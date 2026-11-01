/**
 * 会话风险钩子
 *
 * onRequest 阶段的风险检测联动（403 拦截高风险写操作）与
 * onSend 阶段的响应体注入（GET 读操作弹验证提示，不阻断）。
 * 风险判定本体在 ./anomaly-detector.js，本文件只负责与请求生命周期的接线。
 *
 * @author yijiu
 * @since 2026-09-10
 * @since 2026-11-01 自 auth/index.js 拆出（index.js 收敛为纯门面）
 */
import { getSessionTokenDevice } from '../session/session.js';
import { COOKIE_OPTIONS } from '../context/cookie.js';
import { getDeviceId, computeDeviceFingerprint } from '../device/device.js';
import { detectSessionRisk, isHighRiskRequest } from './anomaly-detector.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.auth.risk-hooks');

/**
 * 检测会话风险并按需拦截高风险写操作
 *
 * 基准从 Redis sessionData 取（登录时写入 deviceFingerprint + ip），不查 DB。
 * - warn（指纹/设备变更）+ 高风险写操作 → 403 拦截，返回验证信息让前端弹框
 * - info（IP 变/无基准）→ 不拦，记 request.state.risk 供响应体注入
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {object} sessionData 登录会话数据
 * @returns {Promise<void>}
 */
async function detectAndHandleRisk(request, reply, sessionData) {
  try {
    // 登录态恢复：客户端（header+cookie）无有效设备 ID 时，从登录链恢复身份
    // （Redis sessionData.deviceId 与风险基准指纹同源，优先；旧会话字段缺失才查 DB）。
    // 恢复/替换结果由下方"与客户端上报不一致 → 回写 X-Device-Id + Set-Cookie"收敛到前端
    const deviceId = await getDeviceId(request, {
      sessionDeviceId: sessionData.deviceId || '',
      sessionUserAgent: sessionData.userAgent || '',
      loadFromDb: () => getSessionTokenDevice(sessionData.sessionId)
    });
    // 设备 ID 与客户端上报不一致（旧格式 UUID / 无效 ID 被替换 / cookie 兜底恢复）→ 回写响应，
    // 前端 device-sync 读取 X-Device-Id 同步 localStorage，否则客户端永远发旧 ID，
    // 服务端每次换新随机 ID，指纹每请求都变，人机验证死循环。
    // X-Device-Id-Updated 为"服务端换发"显式信号（与 login.service 路径语义统一），
    // 前端收到后强制采纳，不依赖本地比对
    const clientDeviceId = request.headers['x-device-id'] || request.cookies?.device_id || '';
    if (deviceId && deviceId !== clientDeviceId) {
      reply.header('X-Device-Id', deviceId);
      reply.header('X-Device-Id-Updated', 'true');
      reply.setCookie('device_id', deviceId, COOKIE_OPTIONS.DEVICE);
    }
    const fingerprint = computeDeviceFingerprint({
      deviceId,
      userAgent: request.headers['user-agent'] || '',
      uid: sessionData.uid
    });
    const risk = await detectSessionRisk({
      userId: sessionData.userId,
      deviceId,
      ip: request.ip,
      fingerprint,
      baselineFingerprint: sessionData.deviceFingerprint, // 基准：登录时写入 Redis 的指纹
      baselineIp: sessionData.ip,
      // 设备 ID 丢失/变更：与指纹变更同级 warn，弹人机验证。
      // 丢失 = 客户端 header+cookie 均无 ID（含已被登录链恢复的情形，环境仍属异常）；
      // 变更 = 客户端上报 ID 与登录链身份不一致（无效被替换 / 恢复覆盖了新上报 ID）
      deviceIdMismatch: deviceId !== clientDeviceId,
      deviceIdMissing: !clientDeviceId
    });
    if (risk.level !== 'safe') {
      request.state.risk = risk;
      log.debug('⚠️ 会话风险: %s %j', risk.level, risk.reasons);

      // 高风险操作（非 GET）+ warn → 拦截，要求先完成人机验证
      // 免验标记短路已在 detectSessionRisk 内完成（命中 → 直接 safe），
      // 走到这里必然未验证，无需再查一次（原实现每 warn 多一跳 Redis）。
      if (risk.level === 'warn' && isHighRiskRequest(request) && risk.verify) {
        // 不要写 `reply.sent = true`：Fastify 5 的 reply.sent 是只读 getter，ESM 严格
        // 模式下赋值抛 TypeError（会被本函数的 catch 吞成一条"风险检测异常"警告），
        // 而 send() 本身已置 sent，下游守卫/钩子的 reply.sent 判断不受影响。
        reply.code(403).send({
          code: 403,
          message: '检测到设备环境变更，请完成人机验证后再操作',
          data: null,
          __risk__: {
            level: risk.level,
            reasons: risk.reasons,
            verifyUrl: risk.verify.url,
            verifyHeader: risk.verify.header,
            verifyToken: risk.verify.token
          }
        });
        return;
      }
    }
  } catch (err) {
    // 风险检测失败不阻塞请求，但记 warn 便于排障（安全相关路径，原仅 _debug 生产不可见）
    log.warn('⚠️ [Auth] 会话风险检测异常:', err);
  }
}

/**
 * onSend 钩子：info 级风险（IP 变但指纹不变，可能是梯子）不拦请求，
 * 但响应体加 __risk__ 让前端弹验证框（不阻断读操作）；
 * warn+高风险已在 onRequest 拦截 403，此处只处理 GET 读操作的弹框提示。
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {*} payload 响应体
 * @returns {*} 处理后的 payload
 */
async function injectRiskOnSend(request, _reply, payload) {
  const risk = request.state?.risk;
  if (!risk || risk.level === 'safe' || !risk.verify) return payload;
  // warn 已在高风险操作拦截，若到了 onSend 说明是 GET 读操作，仍带验证信息让前端弹（不阻断）
  try {
    const body = typeof payload === 'string' ? JSON.parse(payload) : null;
    if (body && typeof body === 'object' && body.__risk__ === undefined) {
      body.__risk__ = {
        level: risk.level,
        reasons: risk.reasons,
        verifyUrl: risk.verify.url,
        verifyHeader: risk.verify.header,
        verifyToken: risk.verify.token
      };
      return JSON.stringify(body);
    }
  } catch {
    // 非 JSON 响应不改，原样返回
  }
  return payload;
}

export { detectAndHandleRisk, injectRiskOnSend };
