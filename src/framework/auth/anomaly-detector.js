/**
 * 异常登录检测模块
 * 检测异地登录、频繁失败、设备指纹变更等异常行为
 * 人工审核通过（2026-09-09）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'node:crypto';
import { getModel } from '../db/index.js';
import { Op } from 'sequelize';
import { getStore } from '../redis/index.js';
import { computeDeviceFingerprint } from './device.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.anomaly-detector');

/** 检测配置 */
const CONFIG = {
  maxFailuresPerIp: 10, // 同一 IP 最大失败次数（15 分钟内）
  maxFailuresPerAccount: 5, // 同一账号最大失败次数（15 分钟内）
  failureWindowMs: 15 * 60 * 1000, // 失败检测窗口（15 分钟）
  lockoutDurationMs: 30 * 60 * 1000 // 锁定时长（30 分钟）
};

/**
 * 暴力破解锁定 store（统一存储层）
 *
 * 不再收裸 redis 客户端（原实现 request.server.redis 为 null 时整段静默跳过，
 * Redis 故障期间恰是最需要锁定防护的时候）。getStore 主库优先 + 操作超时保护，
 * Redis 不可用时降级 MapStore（单机内存），锁定功能至少单实例生效。
 */
const lockoutStore = getStore('login_lockout', { timeout: 3000 });

/** 已验证标记 TTL：通过人机验证后 30 分钟内不再弹（避免频繁打扰） */
const VERIFIED_TTL = 30 * 60; // 秒

/**
 * 验证标记 Redis store（缓存实例避免重复创建）
 *
 * 模块级单例 _verifyStore：单线程 JS 下无竞态；getStore 自带超时保护与降级，
 * Redis 故障时降级 MapStore（单机内存），人机验证免验标记至少单实例生效。
 */
let _verifyStore = null;
function getVerifyStore() {
  if (_verifyStore) return _verifyStore;
  _verifyStore = getStore('safe_verify', { timeout: 3000 });
  return _verifyStore;
}

/**
 * 登录入口检测结果（detectLoginAnomaly 返回 status 字段）
 *
 * 字段约定（三套检测返回结构不对称，刻意为之）：
 * - detectLoginAnomaly         → { status: safe|block, reason? }
 *   登录入口只区分"放行 / 阻断"，超阈值即 BLOCK（不再有 WARN 中间态，
 *   原 WARN 在阈值边界窗口会被攻击者多蹭一次尝试，已废弃）。
 * - detectLoginEnvironmentAnomaly → { status: safe|warn|info, reason?, baseline? }
 *   密码登录后、签发令牌前，warn 走邮箱二次验证、info 放行。
 * - detectSessionRisk          → { level: safe|warn|info, reasons: [], verify? }
 *   访问时每请求比对，warn + 高风险操作拒（403），info 放行仅记审计。
 */
const DETECT_RESULT = {
  SAFE: 'safe',
  BLOCK: 'block' // 阻止登录
};

/**
 * 检测登录异常
 *
 * 暴力破解锁定（IP + 账号双维度）。Redis 故障时 getStore 降级 MapStore，
 * 锁定至少在单实例内生效——Redis 挂掉期间恰是最需要防护的时候。
 *
 * 锁定写入时机：达到阈值的当次请求即写锁定标记并返回 BLOCK，
 * 不依赖"下一次请求"再检测，避免阈值边界窗口被攻击者多蹭一次尝试。
 *
 * @param {object} params
 * @param {string} params.email 登录邮箱
 * @param {string} params.ip 客户端 IP
 * @param {string} params.userAgent User-Agent
 * @returns {Promise<{status: string, reason?: string}>}
 */
async function detectLoginAnomaly(params) {
  const { email, ip } = params;

  // 1. 检查同一 IP 的失败次数
  const ipFailures = await countRecentFailures(null, ip);
  if (ipFailures >= CONFIG.maxFailuresPerIp) {
    // IP 维度超阈值即写锁定标记（原实现只查不写，IP 锁定永远不生效）
    await lockoutStore.set(`lockout:ip:${ip}`, '1', Math.floor(CONFIG.lockoutDurationMs / 1000));
    // 账号在该 IP 下也失败累计到阈值，一并锁账号，防止换 IP 继续撞同一账号
    if (email) {
      await lockoutStore.set(`lockout:email:${email}`, '1', Math.floor(CONFIG.lockoutDurationMs / 1000));
    }
    return { status: DETECT_RESULT.BLOCK, reason: `IP ${ip} 登录失败次数异常（${ipFailures}次），已被临时锁定` };
  }

  // 2. 检查同一账号的失败次数
  const accountFailures = await countRecentFailures(email, null);
  if (accountFailures >= CONFIG.maxFailuresPerAccount) {
    // 锁定账号（达到阈值当次即锁，不等下次）
    await lockoutStore.set(`lockout:email:${email}`, '1', Math.floor(CONFIG.lockoutDurationMs / 1000));
    return { status: DETECT_RESULT.BLOCK, reason: `账号 ${email} 登录失败次数过多，已被锁定 30 分钟` };
  }

  // 3. 检查是否在锁定期内（早于阈值写入的锁定标记）
  const emailLocked = await lockoutStore.get(`lockout:email:${email}`);
  if (emailLocked) {
    return { status: DETECT_RESULT.BLOCK, reason: '账号已被锁定，请稍后再试' };
  }

  return { status: DETECT_RESULT.SAFE };
}

/**
 * 统计最近失败次数
 *
 * details 是 JSON 列（{ email, reason, deviceType }），Sequelize v6 对
 * `where.details = { email }` 生成 `json_unquote(json_extract(details,'$."email"'))=?`，
 * 子键提取而非整对象相等，故 details 含额外字段（reason/deviceType）仍能命中。
 *
 * @param {string|null} email 邮箱（可选）
 * @param {string|null} ip IP 地址（可选）
 * @returns {Promise<number>}
 */
async function countRecentFailures(email, ip) {
  const SessionLog = getModel('SessionLog');
  if (!SessionLog) {
    log.warn('⚠️ [Anomaly] SessionLog 模型未注册，失败计数降级为 0');
    return 0;
  }
  const since = new Date(Date.now() - CONFIG.failureWindowMs);

  const where = {
    event: 'LOGIN_FAILED',
    created_at: { [Op.gte]: since }
  };

  if (email) {
    // JSON 子键匹配：命中 details.email = email 的行（logLoginFailure 写入）
    where.details = { email };
  } else if (ip) {
    where.ip = ip;
  } else {
    // 既无 email 也无 IP：无法判定维度，记日志后返回 0（原实现静默返回 0）
    log.warn('⚠️ [Anomaly] countRecentFailures 缺少 email 和 ip 参数，无法统计失败次数');
    return 0;
  }

  return await SessionLog.count({ where });
}

/**
 * 清除账号锁定
 * @param {string} email 邮箱
 * @returns {Promise<boolean>} 是否清除成功
 */
async function clearAccountLock(email) {
  if (!email || typeof email !== 'string') {
    const err = new Error('email 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  await lockoutStore.delete(`lockout:email:${email}`);
  return true;
}

/**
 * 清除 IP 锁定
 * @param {string} ip IP 地址
 * @returns {Promise<boolean>} 是否清除成功
 */
async function clearIpLock(ip) {
  if (!ip || typeof ip !== 'string') {
    const err = new Error('ip 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  await lockoutStore.delete(`lockout:ip:${ip}`);
  return true;
}

/**
 * 登录环境异常检测（密码登录通过后、签发令牌前）
 *
 * 已知设备匹配：本次指纹与该用户**任意一条**未吊销 session_tokens 的
 * device_fingerprint 一致 → safe（多设备/多 app 各自的行都能匹配到自己）。
 * - 全新设备/盗号者（无任何匹配）→ warn（需要邮箱二次验证，防账号被盗）
 * - 已知设备但 IP 漂移 → info（与该设备自己的登录 IP 比，不拦，避免误杀）
 * - 无任何历史行 → info（首次登录不拦）
 * - 有历史但基准行没存指纹（旧 session）→ info（降级不误判）
 *
 * 注意不能只拿"全局最近一条"当基准：行按 (user_id, device_id) 幂等且 re-login
 * 只更新本次设备那一行，两台已验证设备交替登录会永远互踩对方指纹——
 * A 活跃 → B 登录 warn → B 成为最新 → A 登录又 warn，多设备用户每次换设备都要收邮箱码。
 *
 * @param {object} params
 * @param {number} params.userId 用户内部 ID
 * @param {string} params.uid 用户 UUID（算指纹用）
 * @param {string} params.deviceId 本次 device_id（cookie）
 * @param {string} params.userAgent 本次 UA
 * @param {string} params.ip 本次 IP
 * @returns {Promise<{status: 'safe'|'warn'|'info', reason?: string, baseline?: object}>}
 */
async function detectLoginEnvironmentAnomaly({ userId, uid, deviceId, userAgent, ip }) {
  const SessionToken = getModel('SessionToken');

  // 计算本次指纹（先算，供已知设备匹配）。
  // 注意：指纹材料必须与 createSession 写入基准时完全一致——createSession 不传
  // platformHint（硬编码 ''），这里也不能传，否则 currentFp 永远匹配不上库里的
  // 指纹，已知设备判定永远失败，每次密码登录都会误弹邮箱二次验证。
  const currentFp = computeDeviceFingerprint({ deviceId, userAgent, uid });

  // 已知设备匹配：任一未吊销行指纹一致即通过（次序仅影响 baseline 展示，加 id DESC 保稳定）
  const known = await SessionToken.findOne({
    where: { user_id: userId, revoked: false, device_fingerprint: currentFp },
    order: [
      ['last_active', 'DESC'],
      ['id', 'DESC']
    ],
    raw: true
  });

  if (known) {
    // IP 只与该设备自己的最近登录 IP 比（跨设备比 IP 无意义）
    if (ip && known.ip && ip !== known.ip) {
      return { status: 'info', reason: 'IP 变化（疑似代理/梯子）', baseline: known };
    }
    return { status: 'safe', baseline: known };
  }

  // 无匹配：取全局最近一条，区分"首次登录"与"环境变化"
  const latest = await SessionToken.findOne({
    where: { user_id: userId, revoked: false },
    order: [
      ['last_active', 'DESC'],
      ['id', 'DESC']
    ],
    raw: true
  });

  // 无历史基准：首次登录或旧 session 无记录，不拦（避免新用户/老用户首次在多端登录被卡）
  if (!latest) {
    return { status: 'info', reason: '无历史基准，首次登录' };
  }

  // 基准缺失（旧 session 没存指纹字段）：降级 info，不拦
  if (!latest.device_fingerprint) {
    return { status: 'info', reason: '基准指纹缺失', baseline: latest };
  }

  // 全新环境（新设备/UA 大变/盗号）→ warn，需邮箱二次验证
  return {
    status: 'warn',
    reason: '登录设备/环境与上次不一致',
    baseline: latest
  };
}

/**
 * 访问时的会话风险检测（纯内存/Redis 比对，不查 DB）
 *
 * 基准从 Redis session 数据里取（登录时 createSession 写入 deviceFingerprint + ip），
 * 避免每次请求查 session_tokens 表。访问时 getSession 已拿到 sessionData，直接传基准进来。
 *
 * 风险规则（IP+指纹组合判，防止误杀梯子用户）：
 * - 设备 ID 丢失/变更（客户端无 ID，或上报 ID 与登录链身份不一致）→ warn：触发人机验证，
 *   高风险操作拒。独立于指纹基准——身份丢失本身即可观测，不需要 baseline。
 *   丢失场景（localStorage + cookie 全丢）即便服务端能从登录链恢复身份（指纹不变），
 *   环境仍属异常，同样要求验证，与指纹变更同级。
 * - 指纹变（无论 IP 变不变）→ warn：触发人机验证，高风险操作拒
 * - IP 变但指纹不变 → info：可能是梯子，不拦不弹，仅记录（供审计）
 * - 基准缺失 → info：旧 session 无指纹字段（登录早于该功能上线），降级放行不误判
 * - 都没变 → safe
 *
 * 已通过验证（Redis 有 verified 标记）→ 直接 safe，不重复弹
 *
 * @param {object} params
 * @param {number} params.userId - user_user.id
 * @param {string} params.deviceId - 当前请求的 device_id（cookie/头）
 * @param {string} params.ip - 当前请求 IP
 * @param {string} [params.fingerprint] - 当前请求算出的复合指纹
 * @param {string} [params.baselineFingerprint] - 基准指纹（sessionData.deviceFingerprint）
 * @param {string} [params.baselineIp] - 基准 IP（sessionData.ip）
 * @param {boolean} [params.deviceIdMismatch] - 解析出的 deviceId 与客户端上报不一致
 *   （客户端没报/报了无效被替换/报了新 ID 触发恢复），由调用方（auth 钩子）比对
 * @param {boolean} [params.deviceIdMissing] - 客户端完全没上报设备 ID（header + cookie 均无）
 * @param {string} [params.verifyUrl] - 前端验证端点（返回给前端弹框用）
 * @returns {Promise<{level: string, reasons: string[], verify?: object}>} level: safe|info|warn
 */
async function detectSessionRisk({
  userId,
  deviceId,
  ip,
  fingerprint,
  baselineFingerprint,
  baselineIp,
  deviceIdMismatch,
  deviceIdMissing,
  verifyUrl
}) {
  const reasons = [];
  if (!userId || !deviceId) {
    return { level: 'info', reasons: ['missing_user_or_device'] };
  }

  // 1. 先查已验证标记：通过过人机验证则直接放行，不重复弹
  try {
    const store = getVerifyStore();
    const verified = await store.get(`verified:${userId}:${deviceId}`);
    if (verified) return { level: 'safe', reasons: ['already_verified'] };
  } catch (err) {
    // 标记查询失败不阻塞，继续走检测（Redis 故障期间仍需做风险判定）
    log.warn(`⚠️ [Anomaly] verified 标记查询失败，继续走风险检测: ${err?.message}`);
  }

  // 2. 基准缺失（旧 session 无指纹字段）→ 降级 info 放行，不误判
  //    （设备 ID 丢失/变更不依赖基准，下方仍会拦）
  if (!baselineFingerprint && !deviceIdMismatch) {
    return { level: 'info', reasons: ['no_baseline'] };
  }

  const fpChanged = !!(fingerprint && baselineFingerprint !== fingerprint);
  const ipChanged = !!(baselineIp && ip && baselineIp !== ip);

  // 3. 组合判定：设备 ID 丢失/变更 与 指纹变更 同级，合并为一次 warn（reasons 累积）
  //    设备 ID 丢失/变更独立于基准：客户端身份丢失本身即可观测，基准缺失也拦。
  //    验证通过后客户端经 X-Device-Id + device-sync 收敛，mismatch 消失；
  //    免验标记（按 userId+deviceId）兜底非收敛客户端的 30 分钟静默窗
  if (fpChanged || deviceIdMismatch) {
    if (deviceIdMismatch) {
      reasons.push(deviceIdMissing ? 'device_id_missing' : 'device_id_changed');
    }
    if (fpChanged) reasons.push('fingerprint_changed');
    if (ipChanged) reasons.push('ip_changed');
    return {
      level: 'warn',
      reasons,
      verify: {
        url: verifyUrl || '/auth/v1/verify-challenge',
        header: 'x-verify-token',
        // 验证 token：userId+deviceId+nonce 存 Redis，验证端点校验一致性
        token: await issueVerifyToken(userId, deviceId)
      }
    };
  }

  // IP 变但指纹不变：梯子可能性大，不拦
  if (ipChanged) {
    reasons.push('ip_changed');
    return { level: 'info', reasons };
  }

  return { level: 'safe', reasons };
}

/**
 * 签发验证 token（前端放进 x-verify-token 头调验证端点）
 *
 * token 用 crypto.randomUUID() 生成（密码学安全），避免被预测/碰撞绕过人机验证。
 * 不内嵌 userId/deviceId——token 仅作 Redis 索引，对应值才存身份，验证端点取值校验。
 *
 * @param {number} userId 用户内部 ID
 * @param {string} deviceId 本次设备 ID
 * @returns {Promise<string>} 验证 token
 */
async function issueVerifyToken(userId, deviceId) {
  const token = crypto.randomUUID();
  try {
    const store = getVerifyStore();
    await store.set(`vtoken:${token}`, { userId, deviceId }, VERIFIED_TTL);
  } catch (err) {
    // 写失败则验证端点无法校验该 token，但不影响本次返回（前端会拿到 token，调验证端点时校验失败再重试）
    log.warn(`⚠️ [Anomaly] verify token 写入失败，验证端点将无法校验: ${err?.message}`);
  }
  return token;
}

/**
 * 验证端点调用：校验 verify token 一致后，写"已验证"标记（30 分钟免验）
 * @param {string} token - 前端传来的 x-verify-token
 * @returns {Promise<boolean>} 是否验证成功
 */
async function confirmVerifyToken(token) {
  try {
    if (!token || typeof token !== 'string') {
      return false;
    }
    const store = getVerifyStore();
    const data = await store.get(`vtoken:${token}`);
    if (!data) return false;
    // 写已验证标记
    await store.set(`verified:${data.userId}:${data.deviceId}`, { at: Date.now() }, VERIFIED_TTL);
    // 验证 token 一次性，消费掉
    await store.delete(`vtoken:${token}`);
    return true;
  } catch (err) {
    // 校验流程异常不直接放行（返回 false 让前端重试），但记日志便于排障
    log.warn(`⚠️ [Anomaly] confirmVerifyToken 异常: ${err?.message}`);
    return false;
  }
}

/**
 * 高风险写操作豁免清单
 *
 * 退出/切换/验证类路径必须放行，否则用户一旦触发指纹变会死锁：
 * 退不出、切不了、连验证端点自己都被拦。这些操作要么不依赖 session 基准
 * （退出/切换是销毁/轮转 cookie），要么本身就在完成验证（verify-challenge）。
 */
const RISK_EXEMPT_PATHS = [
  '/auth/v1/clear-cookie', // 临时退出（清 cookie，不依赖基准）
  '/auth/v1/logout', // 正式退出
  '/auth/v1/switch-account', // 切换账号（轮转凭证 cookie）
  '/auth/v1/bind-session', // iframe 登录后换 sid（此时基准可能还没更新）
  '/auth/v1/verify-challenge', // 人机验证端点自身（不能拦自己）
  '/auth/v1/saved-accounts', // 免切账号管理
  '/auth/v1/deactivation' // 注销申请（登录流程内，已过认证）
];

/**
 * 是否高风险写操作（需风险拦截）
 *
 * 默认：非 GET/HEAD/OPTIONS 方法即视为高风险（写操作）；
 * 豁免清单内路径不拦（见 RISK_EXEMPT_PATHS 注释）。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {boolean}
 */
function isHighRiskRequest(request) {
  const m = (request?.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(m)) return false;
  // 豁免路径不拦（退出/切换/验证类，拦了会死锁）
  const url = request?.url || '';
  const path = url.split('?')[0];
  if (RISK_EXEMPT_PATHS.some(p => path === p || path.startsWith(p + '/'))) return false;
  return true;
}

export {
  DETECT_RESULT,
  detectLoginAnomaly,
  detectLoginEnvironmentAnomaly,
  detectSessionRisk,
  confirmVerifyToken,
  isHighRiskRequest,
  clearAccountLock,
  clearIpLock
};
export default CONFIG;
