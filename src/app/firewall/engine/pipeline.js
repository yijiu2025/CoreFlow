/**
 * 请求安全处理管道
 * 将 onRequest 钩子中的安全检查逻辑拆分为独立步骤，提高可读性
 *
 * 依赖方向说明：本模块**不再**从 `./index.js`（barrel）取符号，而是直接从各个
 * 实现模块导入。此前 `engine/index.js` re-export `pipeline.js` 的函数，而
 * `pipeline.js` 又从 `engine/index.js` 取符号 —— 构成真实的循环依赖
 * （AUDIT-REPORT 🟡-10）。从 barrel 取符号除了造环，还会让「谁依赖谁」变得不可读。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { buildChallengePage } from '../data/challenge-template.js';
import { checkRateLimit, trackRequestCount } from './detectors/rate-limiter.js';
import { checkGeoReputation, resolveGeoInfo } from './detectors/geo-filter.js';
import { checkBotChallenge } from './detectors/bot-detector.js';
import { checkLoginBruteForce } from './detectors/brute-force.js';
import { checkGlobalBlock, removeBlock, removeBlockFp, removeBlockDevice } from './dao/block-manager.js';
import { trackConnection } from '../util/connection-tracker.js';
import { generateFingerprint } from '../util/fingerprint.js';
import { pushRecord } from '../data/store.js';
import { getSecuritySettings } from '../dao/dao.js';
import { hasPass, readAccessState } from '../util/redis.js';
import { getClientDeviceId } from '../../../framework/auth/device.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.engine.pipeline');

// ============== 跳过规则 ==============

/**
 * 挑战验证接口的完整路径。
 *
 * 集中一处定义：它同时是「深度检测跳过名单」和「挑战态放行名单」的判据，
 * 写成两个字面量一定会漂移（旧实现就只出现在跳过名单里，对第一阶段毫无作用）。
 */
const CHALLENGE_VERIFY_PATH = '/api/firewall/v1/challenge/verify';

/** 静态资源后缀：不经过深度检测 */
const SKIP_PATTERN = /\.(js|css|png|jpg|ico|svg|woff2?)$/i;

/**
 * 去掉查询串，取纯路径
 *
 * @param {string} url 原始 url
 * @returns {string} 路径部分
 */
function pathOf(url) {
  const s = String(url || '');
  const q = s.indexOf('?');
  return q === -1 ? s : s.slice(0, q);
}

/**
 * 是否为挑战验证接口
 *
 * @param {string} url 请求路径
 * @returns {boolean} true 表示是验证接口
 */
function isChallengeVerifyUrl(url) {
  return pathOf(url) === CHALLENGE_VERIFY_PATH;
}

/**
 * 判断请求是否应跳过深度检测
 * @param {string} url 请求路径
 * @returns {boolean} true 表示跳过
 */
function shouldSkipDeepCheck(url) {
  return isChallengeVerifyUrl(url) || SKIP_PATTERN.test(pathOf(url));
}

/**
 * 判断请求是否「已注定被守卫拒绝」——路由声明必须登录，而请求一个凭据都没带
 *
 * 为什么能判断出来：Fastify 的 `onRequest` 在**路由匹配之后**执行，因此
 * `request.routeOptions.config` 可读；`registerSecureRoute` 已把 `requireLogin`
 * 一并写进路由 config（`api/guard.js`），这里读它即可，无需跨 app 去查 guard 的配置表
 * （app 之间不互相依赖）。实测未匹配到路由时 `routeOptions.config` 是空对象，不会误判。
 *
 * 判定刻意收紧为「**一个凭据都没有**」而不是「认证没成功」：带了 sid/token 却没通过认证
 * 是更可疑的信号（失效、伪造、越权试探），必须继续走深度检测。
 *
 * ⚠️ 这是一项**配置开关**（`defense.skipDeepCheckForAnonymous`，默认关闭）而非默认行为：
 * 跳过深度检测后，匿名探测受保护端点不再进入 Bot / 地理 / 端点限频判定，端点枚举的阻力
 * 会下降（第一层全局限流与封禁/白名单阶段仍然生效）。打开它换的是 CPU 与 Redis 往返。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {boolean} true 表示可以跳过深度检测
 */
function willBeRejectedAsAnonymous(request) {
  if (request.routeOptions?.config?.requireLogin !== true) return false;
  if (request.state?.user) return false;
  const hasCredential = Boolean(request.cookies?.sid || request.cookies?.access_token || request.headers.authorization);
  return !hasCredential;
}

// ============== 请求上下文构建 ==============

/**
 * 构建防火墙日志上下文
 * 在请求进入时调用，生成 fingerprint / deviceId 和基础日志字段
 *
 * `deviceId` 用 auth 的 `getClientDeviceId`（只认客户端自报且校验通过的值，**不补发**）：
 * 补发的 ID 每请求都可能不同，拿它当封禁维度等于永远封不住人。
 * 拿不到时返回 null，后续所有判定自动退回 IP / 指纹维度。
 *
 * 成本：结构化 ID 校验是纯 CPU（split + Base62 解码），无 I/O，可放在热路径上。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {Promise<object>} 包含 ip、ua、fingerprint、deviceId、geoInfo 的上下文
 */
async function buildRequestContext(request) {
  const ip = request.ip;
  const ua = request.headers['user-agent'] || '';
  const fingerprint = generateFingerprint(request);
  const deviceId = await getClientDeviceId(request);
  request._fingerprint = fingerprint;
  request._deviceId = deviceId;

  const geoInfo = resolveGeoInfo(ip);
  request._firewallLog = {
    time: new Date().toISOString(),
    ip,
    fingerprint,
    deviceId,
    method: request.method,
    url: request.url,
    userAgent: ua,
    blocked: false,
    ...geoInfo
  };

  return { ip, ua, fingerprint, deviceId, geoInfo };
}

// ============== 挑战态处置 ==============

/**
 * 撤销命中者身上的「挑战」状态（**只清 CHALLENGE**，绝不误伤 SCANNER/BLOCKED）。
 *
 * 挑战与硬封禁共用同一套封禁键，只有状态串不同。用户通过验证后必须把挑战态清掉，
 * 否则他会一直看到挑战页直到 TTL 到期。
 *
 * 三个维度都要清：挑战可能是被其中一个维度命中的，残留任意一个都会让用户
 * 「刚通过又立刻被挑战」。
 *
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 请求指纹
 * @param {string|null} deviceId 设备 ID（可能为 null）
 * @returns {Promise<void>}
 */
async function clearChallengeState(ip, fingerprint, deviceId) {
  try {
    const state = await readAccessState({ ip, fingerprint, deviceId });
    if (state.devBlock?.status === 'CHALLENGE' && deviceId) await removeBlockDevice(deviceId);
    if (state.fpBlock?.status === 'CHALLENGE') await removeBlockFp(fingerprint);
    if (state.ipBlock?.status === 'CHALLENGE') await removeBlock(ip);
  } catch (err) {
    // 清理失败不影响放行：挑战态仍会再次判定，最坏是用户再看一次挑战页
    log.warn(`⚠️ [Firewall] 清除挑战态失败 ip=${ip}`, err);
  }
}

/**
 * 渲染挑战页
 *
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 请求指纹
 * @param {string|null} deviceId 设备 ID（可能为 null）
 * @returns {Promise<void>}
 */
async function sendChallengePage(reply, ip, fingerprint, deviceId) {
  const html = await buildChallengePage(ip, fingerprint, deviceId);
  reply.type('text/html').send(html);
}

// ============== 第一阶段：全局封禁检查 ==============

/**
 * 全局封禁检查（连接数 + 黑名单）
 * 请求进入时最先执行，被封禁的请求直接拒绝，不进入后续检测。
 *
 * `CHALLENGE` 状态**不是**硬封禁，三种去向（修复前一律落成 429，形成死锁）：
 *   ① 客户端已持有有效通过令牌 → 撤销挑战态并放行；
 *   ② 请求的就是验证接口 → 放行（否则挑战永远解不开）；
 *   ③ 其余 → 返回挑战页。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @returns {Promise<boolean>} true 表示已响应（调用方直接 return），false 表示放行
 */
async function checkGlobalBlockPhase(request, reply) {
  const ip = request.ip;
  const fingerprint = request._fingerprint;
  const deviceId = request._deviceId || null;
  const firewallLog = request._firewallLog;

  try {
    trackConnection(ip, 1);
    await checkGlobalBlock(ip, fingerprint, deviceId);
    return false; // 放行
  } catch (err) {
    // ---- 挑战态：不硬封禁 ----
    if (err.isChallenge) {
      const token = request.cookies?.fw_verified;

      // ① 已通过验证：撤销挑战态，正常放行
      if (token && (await hasPass({ ip, fingerprint, deviceId, token }))) {
        await clearChallengeState(ip, fingerprint, deviceId);
        return false;
      }

      // ② 验证接口自身必须可达
      if (isChallengeVerifyUrl(request.url)) return false;

      // ③ 其余请求 → 挑战页
      firewallLog.blocked = true;
      firewallLog.statusCode = 200;
      pushRecord({ ...firewallLog });
      await sendChallengePage(reply, ip, fingerprint, deviceId);
      return true;
    }

    // ---- 硬封禁：403 / 429 ----
    firewallLog.blocked = true;
    firewallLog.statusCode = err.statusCode || 429;
    pushRecord({ ...firewallLog });
    // 透传封禁错误自带的响应头（如 Retry-After）：buildBlockError 刻意设置了它，
    // 供客户端退避；此前的全局封禁阶段漏了这一步，导致该响应头从未真正下发
    // （检测流水线里的同款回包是有透传的，两处行为此前不一致）。
    if (err.headers) reply.headers(err.headers);
    reply.code(err.statusCode || 429).send({
      error: 'Security Policy Blocked',
      message: err.message
    });
    return true; // 已封禁
  }
}

// ============== 第二阶段：挑战 Cookie 验证 ==============

/**
 * 检查请求是否携带有效的挑战验证 Cookie
 * token 绑定在设备 / 指纹 / IP 三个维度上，任一通过即放行
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 请求指纹
 * @returns {Promise<boolean>} true 表示已通过挑战验证，false 表示需要继续检测
 */
async function checkChallengeCookie(request, ip, fingerprint) {
  const clientToken = request.cookies?.fw_verified;
  if (!clientToken) return false;

  // 一次原子校验（设备 / 指纹 / IP 任一命中即通过），且无需再判 redis 是否为空
  return hasPass({ ip, fingerprint, deviceId: request._deviceId || null, token: clientToken });
}

// ============== 第三阶段：深度检测管道 ==============

/**
 * 深度检测管道
 * 执行 Bot 检测、地理信誉检查、端点限频等。
 * 触发挑战或封禁时直接响应请求。
 *
 * @param {string} ip 客户端 IP
 * @param {string} ua User-Agent
 * @param {string} url 请求路径
 * @param {object} firewallLog 日志对象引用
 * @param {string} fingerprint 请求指纹
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @param {string|null} [deviceId] 设备 ID（可为空；命中挑战时会一并写设备维度，使挑战跨 IP 有效）
 * @returns {Promise<boolean>} true 表示被拦截（已响应），false 表示放行
 */
async function runDetectionPipeline(ip, ua, url, firewallLog, fingerprint, reply, deviceId = null) {
  try {
    // Bot 检测：基于 UA 模式 + 请求频率
    const requestCount = trackRequestCount(ip);
    const isBot = await checkBotChallenge(ip, ua, requestCount, deviceId);

    if (isBot) {
      const err = new Error('Challenge required');
      err.isChallenge = true;
      throw err;
    }

    // 地理信誉：IDC 限频、境外敏感路径拦截
    await checkGeoReputation(ip, url);

    // 端点级限频（从配置读取规则）
    const settings = getSecuritySettings();
    const endpointRules = settings.defense?.endpointRateLimits || [];

    for (const rule of endpointRules) {
      if (url.includes(rule.path)) {
        await checkRateLimit(`${rule.path}:${ip}`, {
          limit: rule.limit,
          window: rule.window,
          blockTime: rule.blockTime
        });
        break;
      }
    }

    return false; // 放行
  } catch (err) {
    // 只认结构化标记。旧实现额外用 `err.message.includes('CHALLENGE')` 兜底，
    // 方向是 **fail-open**：任何消息里带该字样的错误都会把「硬封禁」降级成
    // 「返回挑战页 200」。一旦有错误把 Redis key 拼进 message（key 形如
    // `fw:block:...`），行为就会静默改变。
    const isChallenge = err.isChallenge === true;

    firewallLog.blocked = true;
    firewallLog.statusCode = isChallenge ? 200 : err.statusCode || 429;
    pushRecord({ ...firewallLog });

    // 挑战请求返回 HTML 验证页
    if (isChallenge) {
      await sendChallengePage(reply, ip, fingerprint, deviceId);
      return true;
    }

    // 封禁请求返回 JSON 错误
    if (err.headers) reply.headers(err.headers);
    reply.code(err.statusCode || 429).send({
      error: 'Security Policy Blocked',
      message: err.message
    });
    return true; // 已拦截
  }
}

// ============== 登录结果观测（暴力破解防护接线） ==============

/**
 * 登录类路径（账号密码 / 快捷登录 / 邮箱二次验证）
 *
 * 注意：这里刻意**不**在 oauth21 的登录服务里 import firewall 的检测器 ——
 * 本仓的架构约定是「app 之间不互相依赖」。防火墙自己挂在 `onResponse` 上观测
 * 登录请求的结果，从而实现同一件事，且依赖方向仍然是 oauth21 ⊥ firewall。
 */
const LOGIN_PATH_PATTERN = /\/(mini-login|login|verify-email)$/;

/** 视为「凭证失败」的状态码（参数错误 400 不计入，避免把用户填错字段当成爆破） */
const CREDENTIAL_FAILURE_CODES = [401, 403, 422, 423];

/**
 * 观测登录请求的结果并维护暴力破解计数
 *
 * 旧实现里 `checkLoginBruteForce` / `isAccountLocked` 定义了却**零调用**，
 * 所谓「登录暴力破解防护」从未生效。这里给 `checkLoginBruteForce` 接上真实调用点。
 *
 * 两个已知限制（诚实标注，不假装已解决）：
 *   1. 密码登录的账号名在 RSA 密文里，防火墙拿不到 → 只能做 **IP 维度**计数；
 *      账号维度的 `isAccountLocked` 需要 oauth21 侧接入（跨 app，需架构决策）。
 *   2. 邮箱验证码登录会明文带上 `username`，因此账号维度会生效。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @returns {Promise<void>}
 */
async function observeLoginOutcome(request, reply) {
  if (request.method !== 'POST') return;
  if (!LOGIN_PATH_PATTERN.test(pathOf(request.url))) return;

  try {
    if (!getSecuritySettings().defense?.enableBruteForce) return;

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const username = typeof body.username === 'string' ? body.username : undefined;
    const success = reply.statusCode >= 200 && reply.statusCode < 300;

    if (success) {
      // 登录成功即清零，避免历史失败把正常用户推进挑战/封禁
      await checkLoginBruteForce(request.ip, username, true, request._deviceId || null);
      return;
    }
    if (!CREDENTIAL_FAILURE_CODES.includes(reply.statusCode)) return;

    await checkLoginBruteForce(request.ip, username, false, request._deviceId || null);
  } catch (err) {
    // 观测失败绝不影响业务响应
    log.warn('⚠️ [Firewall] 登录结果观测失败', err);
  }
}

// ============== 日志记录 ==============

/**
 * 记录请求日志到流量统计
 * 在响应发送前调用，将 firewallLog 推入环形缓冲区
 *
 * @param {object} firewallLog 日志对象
 * @param {number} statusCode HTTP 状态码
 * @param {boolean} [alreadyLogged=false] 是否已记录（防止重复）
 */
function recordLog(firewallLog, statusCode, alreadyLogged = false) {
  if (firewallLog && !alreadyLogged) {
    pushRecord({ ...firewallLog, statusCode });
  }
}

export {
  CHALLENGE_VERIFY_PATH,
  isChallengeVerifyUrl,
  shouldSkipDeepCheck,
  willBeRejectedAsAnonymous,
  buildRequestContext,
  checkGlobalBlockPhase,
  checkChallengeCookie,
  runDetectionPipeline,
  observeLoginOutcome,
  recordLog
};
