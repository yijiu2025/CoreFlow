/**
 * 设备识别模块
 *
 * 统一管理设备类型判定与设备标识生成：
 * - detectDeviceType：返回设备类型语义值（存 session.deviceType 字段）
 * - getDeviceId：验证并规范化结构化设备 ID（WEB-DaBOSbNdSuc-8s4T），**校验失败会补发新 ID**
 * - getDeviceIdAndWrapResponse：getDeviceId + 写响应头/cookie
 * - getClientDeviceId：只取客户端**自报且校验通过**的 ID（不补发），供「把 ID 当稳定身份」的用途
 * - computeDeviceFingerprint：计算复合设备指纹（device_id + UA + uid 哈希）
 *
 * device_id 采用结构化格式（如 WEB-DaBOSbNdSuc-8s4T），前端生成后端验证，
 * 若无效则生成新 ID，确保唯一性和安全性。
 *
 * 注意：平台短前缀 detectPlatform 已移至 device-id-service.js（接 UA 字符串，
 * 返回大写 WEB/IOS/ANDROID，供 ID 生成用）。本模块只保留 detectDeviceType
 * （粗粒度设备类型，接 UA，返回 browser/app/desktop/miniapp/api，session 用）。
 *
 * 文件结构（自上而下）：
 * 1. 常量（REBORN_WINDOW_MS / MAX_LOG_LENGTH / DEVICE_TYPE）
 * 2. 内部工具（forLog / deviceTypeCompatible）
 * 3. 公共 API（detectDeviceType / getDeviceId / getDeviceIdAndWrapResponse /
 *    getClientDeviceId / computeDeviceFingerprint）— 入口处均做参数防御
 * 4. 导出
 *
 * @author yijiu
 * @since 2026-08-14
 * @since 2026-09-01 结构化设备 ID（加密时间戳 + 高唯一性）
 * @since 2026-09-05 cookie 兜底恢复（localStorage 丢失时从 httpOnly cookie 恢复设备身份）
 * @since 2026-09-10 结构重排 + export 集中末尾；删死导出 detectPlatform（与 device-id-service 同名冲突）；公共函数补 INVALID_PARAM 校验
 */

import crypto from 'node:crypto';
import {
  verifyAndNormalizeDeviceId,
  generateServerSideDeviceId,
  validateDeviceId,
  parseDeviceId
} from './device-id-service.js';
import { COOKIE_OPTIONS } from './cookie.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.device');

// ── 1. 常量 ──

/** header ID 视为"刚生成"（localStorage 丢失后新造）的判定窗口（毫秒） */
const REBORN_WINDOW_MS = 10_000;

/** 日志中外部输入的最大展示长度（防脏数据刷屏/日志注入） */
const MAX_LOG_LENGTH = 48;

/**
 * 设备类型常量（语义值，存 session.deviceType）
 */
const DEVICE_TYPE = {
  BROWSER: 'browser', // 浏览器（Chrome/Firefox/Safari 等）
  APP: 'app', // 移动端 App（Android/iOS）
  DESKTOP: 'desktop', // 桌面客户端（Electron 等）
  MINIAPP: 'miniapp', // 小程序（微信/支付宝等）
  API: 'api' // API 调用（服务间通信，无 UA）
};

// ── 2. 内部工具 ──

/**
 * 截断外部输入用于日志展示
 * @param {string} value 原始值
 * @returns {string} 截断后的安全展示值
 */
function forLog(value) {
  if (value == null) return '(empty)';
  const safe = String(value);
  return safe.length > MAX_LOG_LENGTH ? `${safe.slice(0, MAX_LOG_LENGTH)}…` : safe;
}

/**
 * 恢复候选 UA 与登录时 UA 的设备类型是否兼容
 *
 * 浏览器大版本升级会导致 UA 字符串变化，严格比较会误伤正常恢复；
 * 但 sid 被窃取后在完全不同环境（如 curl / 换手机）使用时应拒绝恢复
 * 受害者设备身份。用粗粒度设备类型（browser/app/desktop/miniapp/api）判定。
 *
 * @param {string} currentUa 当前请求 UA
 * @param {string} loginUa 登录时 UA（空视为兼容，兼容存量无 UA 记录）
 * @returns {boolean}
 */
function deviceTypeCompatible(currentUa, loginUa) {
  if (!loginUa) return true;
  return detectDeviceType(currentUa) === detectDeviceType(loginUa);
}

// ── 3. 公共 API ──

/**
 * 从 User-Agent 推断设备类型（粗粒度语义值，存 session.deviceType）
 *
 * 与 device-id-service.js 的 detectPlatform 互补而非重复：
 * - 本函数粗粒度（browser/app/desktop/miniapp/api 5 类），供 session 记录设备类型、
 *   按设备类型踢下线（kickByDeviceType）用，能识别 miniapp/desktop/api 等 ID 前缀无法表达的类别
 * - detectPlatform 细粒度（WEB/IOS/ANDROID 3 类），供 device_id 前缀用，受 ID 格式约束只能 3 类
 * （device_id 平台段校验只接受 WEB/IOS/ANDROID，故 detectPlatform 不能返回 miniapp/desktop/api）
 *
 * @param {string} ua User-Agent 字符串
 * @returns {string} DEVICE_TYPE 之一
 */
function detectDeviceType(ua) {
  if (!ua) return DEVICE_TYPE.API;
  const lower = ua.toLowerCase();
  if (lower.includes('miniprogram') || lower.includes('micromessenger')) return DEVICE_TYPE.MINIAPP;
  if (lower.includes('android') || lower.includes('iphone') || lower.includes('mobile')) return DEVICE_TYPE.APP;
  if (lower.includes('electron') || lower.includes('desktop')) return DEVICE_TYPE.DESKTOP;
  return DEVICE_TYPE.BROWSER;
}

/**
 * 验证并规范化设备标识
 *
 * 混合方案：
 * 1. 前端生成临时结构化 ID（WEB-DaBOSbNdSuc-8s4T）
 * 2. 后端验证格式、安全性、有效性
 * 3. 无效则生成新 ID 并返回
 *
 * ID 来源优先级：
 *   1. x-device-id 头（前端主动传的结构化 ID）
 *   2. cookie 里的 device_id（向后兼容旧版本）
 *   3. 登录态恢复（Redis session → DB session_tokens，仅已登录 + 客户端无有效 ID 时）
 *   4. 服务端生成（兜底）
 *
 * 恢复目标必须与风险基准指纹同源（登录链上最新已知 ID），
 * 否则 fingerprint 比对必然失配 → 风控误报死循环。
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {object} [opts] 登录态恢复选项（未登录/登录路径可不传，向后兼容）
 * @param {string} [opts.sessionDeviceId] Redis sessionData.deviceId（登录时写入，验证通过后随基准更新）
 * @param {string} [opts.sessionUserAgent] Redis sessionData.userAgent（恢复时做设备类型兼容校验）
 * @param {Function} [opts.loadFromDb] DB 兜底回调，返回 {deviceId, originalDeviceId, userAgent}|null
 *   （session 里没有 deviceId 时才调用，如旧会话字段缺失；实现见 session.js getSessionTokenDevice）
 * @returns {Promise<string>} 形如 `WEB-DaBOSbNdSuc-8s4T`
 * @throws {Error} code=INVALID_PARAM 当 request 非对象
 */
async function getDeviceId(request, opts = {}) {
  if (!request || typeof request !== 'object') {
    const err = new Error('request 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const userAgent = request?.headers?.['user-agent'] || '';
  const header = request?.headers?.['x-device-id'] || '';
  const cookieDeviceId = request?.cookies?.device_id || '';

  // 1. cookie 兜底恢复：localStorage 被清（手动清除 / Safari ITP 7 天清除脚本存储）
  //    时前端会立即生成"刚出生"的有效新 ID，且请求头优先级高于 cookie——若直接采纳，
  //    httpOnly cookie 里的旧设备身份（不受 ITP 清除影响）将永久丢失，设备指纹突变。
  //    当 header ID 刚生成（REBORN_WINDOW_MS 内）或不可解析，且 cookie 存有合法的
  //    不同 ID 时，优先恢复 cookie 身份；调用方检测到与客户端上报不一致会回写
  //    X-Device-Id，前端 device-sync 同步回 localStorage，身份收敛（无需刷新页面）。
  //    cookie 由服务端 Set-Cookie 写入、httpOnly 不可伪造跨设备，恢复目标恒为同浏览器旧身份。
  if (header && cookieDeviceId && header !== cookieDeviceId) {
    const cookieValidation = await validateDeviceId(cookieDeviceId);
    if (cookieValidation.valid) {
      const headerInfo = parseDeviceId(header);
      const headerJustBorn = headerInfo && Date.now() - headerInfo.timestamp < REBORN_WINDOW_MS;
      if (!headerInfo || headerJustBorn) {
        log.info(`🔄 [DeviceId] localStorage 丢失，从 httpOnly cookie 恢复设备身份: ${forLog(cookieDeviceId)}`);
        return cookieValidation.normalizedId;
      }
    }
  }

  // 2. 登录态恢复：客户端（header + cookie）都无法提供有效 ID 时，
  //    从登录链恢复设备身份，避免设备指纹突变。
  //    覆盖场景：device_id cookie 被浏览器单独逐出/拒绝 + localStorage 被清，
  //    但 sid 会话仍存活（sid/device_id 同 jar 但 TTL 相差悬殊：2h vs 10 年）。
  //    优先 Redis sessionData.deviceId（与风险基准指纹同源、零 DB 查询）；
  //    旧会话字段缺失时才触发 loadFromDb 查 session_tokens（device_id 优先，
  //    device_id_original 兜底）。恢复后调用方检测到与客户端上报不一致会回写
  //    X-Device-Id + Set-Cookie，前端 device-sync 同步 localStorage，身份收敛。
  const clientId = header || cookieDeviceId;
  if (!clientId || !(await validateDeviceId(clientId)).valid) {
    let recovered = '';
    if (opts?.sessionDeviceId) {
      const sv = await validateDeviceId(opts.sessionDeviceId);
      if (sv.valid && deviceTypeCompatible(userAgent, opts.sessionUserAgent)) {
        recovered = sv.normalizedId;
      }
    }
    if (!recovered && typeof opts?.loadFromDb === 'function') {
      try {
        const rec = await opts.loadFromDb();
        const dbId = rec?.deviceId || rec?.originalDeviceId || '';
        if (dbId) {
          const dv = await validateDeviceId(dbId);
          if (dv.valid && deviceTypeCompatible(userAgent, rec.userAgent)) {
            recovered = dv.normalizedId;
          }
        }
      } catch (error) {
        log.warn(`⚠️ [DeviceId] 登录态 DB 恢复失败`, error);
      }
    }
    if (recovered) {
      log.info(`🔄 [DeviceId] 客户端无有效 ID，从登录链恢复设备身份: ${forLog(recovered)}`);
      return recovered;
    }
  }

  // 3. 优先验证前端传的结构化 ID
  if (clientId) {
    try {
      const validation = await verifyAndNormalizeDeviceId(clientId, userAgent);

      if (validation.valid) {
        // 验证通过，使用规范化 ID
        if (validation.shouldReplace) {
          log.warn(`⚠️ [DeviceId] 前端 ID 无效，已替换：${forLog(clientId)} → ${validation.normalizedId}`);
        }
        return validation.normalizedId;
      }
    } catch (error) {
      log.warn(`⚠️ [DeviceId] 验证失败`, error);
    }
  }

  // 4. 后端生成新 ID（兜底）
  const serverId = generateServerSideDeviceId(userAgent);
  log.info(`📱 [DeviceId] 服务端生成：${serverId}`);
  return serverId;
}

/**
 * 获取设备 ID 并包装响应
 *
 * Cookie 选项统一用 COOKIE_OPTIONS.DEVICE（httpOnly:true / secure:按生产 / 10年），
 * 与 bind-session 写业务域 device_id cookie 一致，避免双套选项导致属性不一致。
 * 前端改用 x-device-id 头 + localStorage 持久化后不依赖读 cookie，httpOnly 无副作用。
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<string>} 设备 ID
 * @throws {Error} code=INVALID_PARAM 当 request/reply 非对象
 */
async function getDeviceIdAndWrapResponse(request, reply) {
  if (!request || typeof request !== 'object' || !reply || typeof reply !== 'object') {
    const err = new Error('request/reply 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const deviceId = await getDeviceId(request);

  // 1. 写入响应头（前端可以读取）
  reply.header('X-Device-Id', deviceId);

  // 2. 写入 Cookie（后续请求自动带上，统一选项与 bind-session 一致）
  reply.setCookie('device_id', deviceId, COOKIE_OPTIONS.DEVICE);

  // 3. 如果是首次生成（无效的 cookie），通过响应体通知前端更新
  const cookieDeviceId = request?.cookies?.device_id || '';
  if (!cookieDeviceId) {
    reply.header('X-Device-Id-Updated', 'true');
  }

  return deviceId;
}

/**
 * 计算复合设备指纹（device_id + UA + uid 等哈希）
 *
 * 区别于 device_id（设备级稳定标识，跨账号共用）：
 * device_fingerprint 绑定"设备 + 账号"，同设备换账号/同账号换设备都会变。
 * 每次登录计算并记录到 session_tokens，访问时比对——突变则可能账号被盗/换设备。
 *
 * 输入：device_id + UA + uid + sec-ch-ua-platform（浏览器特征，防 UA 轻微变化误报）
 *
 * @param {object} opts - { deviceId, userAgent, uid, platformHint? }
 * @returns {string} 32 位指纹
 * @throws {Error} code=INVALID_PARAM 当 opts 非对象
 */
function computeDeviceFingerprint({ deviceId, userAgent, uid, platformHint }) {
  if (arguments.length === 0 || typeof arguments[0] !== 'object') {
    // 解构非对象会抛，这里显式校验给出清晰错误码
    const err = new Error('opts 参数无效：需传对象 { deviceId, userAgent, uid }');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const material = `${deviceId || ''}|${uid || ''}|${userAgent || ''}|${platformHint || ''}`;
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * 读取**客户端自报且校验通过**的设备 ID；未上报或校验不通过时返回 null
 *
 * 与 `getDeviceId` 的关键区别：**不补发**。`getDeviceId` 在校验失败时会生成一个全新的
 * 服务端 ID（可用性优先），那个值每次请求都可能不同 —— 拿它当身份维度做封禁/限流，
 * 等于把所有人当成同一个人再分开，规则永远不会命中。
 *
 * 因此凡是「把这个 ID 当作稳定身份」的用途（防火墙封禁、跨 IP 追踪、设备白名单），
 * 都必须用本函数：它只承认客户端真正携带、且符合结构化格式（平台-时间戳-随机后缀）
 * 的值，拿不到就返回 null，由调用方退回其它维度（IP / 请求指纹）。
 *
 * ⚠️ 强度边界：device_id **不是凭证**（见 device-id-service.js 的说明），它由客户端携带，
 * 清掉 localStorage 与 httpOnly cookie 即可换一个新身份。它提高的是攻击成本与追踪能力，
 * 不是不可绕过的屏障 —— 依赖它的安全决策要按这个强度来设计。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {Promise<string|null>} 规范化后的设备 ID，或 null
 */
async function getClientDeviceId(request) {
  if (!request || typeof request !== 'object') return null;
  const raw = request.headers?.['x-device-id'] || request.cookies?.device_id || '';
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const validation = await validateDeviceId(raw);
    return validation.valid ? validation.normalizedId : null;
  } catch (error) {
    log.warn('⚠️ [DeviceId] 客户端设备 ID 校验异常', error);
    return null;
  }
}

// ── 4. 导出 ──

// prettier-ignore
export {
  DEVICE_TYPE,
  detectDeviceType,
  getDeviceId,
  getDeviceIdAndWrapResponse,
  getClientDeviceId,
  computeDeviceFingerprint
};
