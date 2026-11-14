/**
 * 后台高危操作的一次性二次验证（step-up）
 *
 * ── 为什么不再要求「输入你自己的登录密码」──
 * 本仓大量账号是**邮箱验证码登录**的（`login.js` 支持 type=email），从来没设置过密码。
 * 对这类账号，密码框是死路：填什么都错，只能放弃操作。就算设了密码，让人在后台里
 * 反复敲密码也不合适 —— 密码是登录凭据，不是操作确认手段。
 *
 * ── 做法：两步，但不签长期票据 ──
 * 1. `createChallenge`：先做**与执行时同一套**权限判定（不能给没权限的人发码），
 *    再按选定方式发凭据，落一条绑定 `用户 + 动作 + 目标` 的挑战记录（600s）。
 * 2. `consumeChallenge`：业务请求带上 `challengeId` + 凭据，校验通过后**一次性消费**。
 *
 * 绑定 action + targetId 是关键：否则「为了看 A 而通过的验证」可以被拿去删 B。
 * 这与 `app/guard/services/stepup.service.js` 把票据绑到 patchHash 是同一个思路。
 *
 * ── 凭据 ──
 * - email：复用 `framework/security/verify/email/dao.js`（6 位码、600s、60s 重发冷却、
 *   5 次失败作废、发码/用码绑定同一 sessionId 与客户端指纹）。与登录验证码共用实现，
 *   避免两套规则各自漂移。存储命名空间独立，同一邮箱的两类码互不覆盖。
 * - password：只作为**后备**（账号绑了密码、但没绑邮箱的少数情况）。真源是
 *   `user_identity(identity_type='password')` —— `User` 表没有 credential 列。
 * - 短信：通道未接入（`verify/sms/service.js` 会抛），明确拒绝而不是静默降级成邮箱。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import crypto from 'node:crypto';
import { getStore } from '../../../framework/persistence/redis/index.js';
import { getModel } from '../../../framework/persistence/db/index.js';
import { verifyPassword, logAuditEvent } from '../../../framework/security/auth/index.js';
import emailDao from '../../../framework/security/verify/email/dao.js';
import { createLogger } from '../../../framework/support/log/index.js';

const log = createLogger('app.console.stepup');

/**
 * 挑战有效期
 *
 * 与验证码有效期（`verify/config.js` 的 `common.codeTtl`，默认 600s）对齐：
 * 短于码会造成「码还有效、挑战先过期」，用户只能重来。
 */
const CHALLENGE_TTL = 600;

/** 同一操作者每小时最多发码次数（emailDao 只管 60s 间隔，没有小时级配额） */
const MAX_SENDS_PER_HOUR = 5;

/** 密码方式的错误次数上限（邮箱方式的次数由 emailDao 自己管） */
const MAX_PASSWORD_ATTEMPTS = 5;

/** 存储命名空间：与登录 email_code、防火墙 guard_stepup 完全隔离 */
const STORE_NAMESPACE = 'console_stepup';

/**
 * 支持二次验证的动作白名单
 *
 * 只认这几个键，不接受前端自由传字符串 —— 否则"动作"这一维就形同虚设，
 * 挑战记录里的 action 也就没法用于校验。
 */
const ACTIONS = {
  'user.delete': '删除账号',
  'user.app-deactivate': '注销应用账号',
  'user.temp-password': '签发临时密码',
  // 清除日志：目标不是"某个用户"，而是"一组筛选条件"，所以走 targetKey 绑定（见下）
  'log.purge': '清除日志'
};

/** 进程内单例（懒加载：导入模块不碰 Redis，无 Redis 的部署与单测都能 import） */
let challengeStore = null;

/**
 * 取挑战存储
 *
 * @returns {object} store
 */
function getChallengeStore() {
  if (!challengeStore) challengeStore = getStore(STORE_NAMESPACE);
  return challengeStore;
}

/** 邮箱脱敏：u***@example.com */
function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '***';
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

/**
 * 客户端上下文（供既有验证码逻辑做指纹绑定）
 *
 * emailDao 发码时记录 `sha256(IP|UA)`、用码时回查一致 —— 所以发码与用码必须来自
 * 同一客户端环境。这正是我们要的语义：验证码不能在别的机器上被消费。
 *
 * @param {import('fastify').FastifyRequest} request 请求
 * @param {string} sessionId 会话标识（此处为 challengeId）
 * @returns {object} 上下文
 */
function clientCtx(request, sessionId) {
  return {
    ip: request?.ip,
    ua: request?.headers?.['user-agent'],
    deviceFp: request?.body?.deviceFp || request?.headers?.['x-device-fingerprint'],
    sessionId
  };
}

/**
 * 读取操作者的认证要素
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<{email: string, credential: string}|null>} 要素
 */
async function loadFactors(userId) {
  const User = getModel('User');
  const UserIdentity = getModel('UserIdentity');
  if (!User) return null;

  const user = await User.findByPk(Number(userId), { attributes: ['id', 'email'] });
  if (!user) return null;

  // 密码真源是 user_identity（User 表没有 credential 列）
  const identity = UserIdentity
    ? await UserIdentity.findOne({ where: { user_id: Number(userId), identity_type: 'password' } })
    : null;

  return {
    email: user.email || '',
    credential: identity?.credential || ''
  };
}

/**
 * 操作者当前可用的验证方式
 *
 * 前端据此决定展示「发送验证码」还是密码框 —— 别再让没设密码的人对着密码框干瞪眼。
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<{email: string, hasPassword: boolean, recommended: 'email'|'password'|null}>} 能力
 */
async function describeFactors(userId) {
  const factors = await loadFactors(userId);
  if (!factors) return { email: '', hasPassword: false, recommended: null };
  const hasEmail = Boolean(factors.email);
  const hasPassword = Boolean(factors.credential);
  return {
    email: hasEmail ? maskEmail(factors.email) : '',
    hasPassword,
    recommended: hasEmail ? 'email' : hasPassword ? 'password' : null
  };
}

/**
 * 每小时发码配额
 *
 * @param {object} kv 存储
 * @param {number} userId 用户 ID
 * @returns {Promise<boolean>} true = 还有额度
 */
async function consumeSendQuota(kv, userId) {
  const hourBucket = Math.floor(Date.now() / 3600_000);
  const key = `send:${userId}:${hourBucket}`;
  const used = Number((await kv.get(key)) || 0);
  if (used >= MAX_SENDS_PER_HOUR) return false;
  await kv.set(key, used + 1, 3600);
  return true;
}

/**
 * 创建挑战（发凭据）
 *
 * @param {object} params 参数
 * @param {number} params.userId 操作者 ID
 * @param {object} params.request Fastify request（取 ip / ua）
 * @param {string} params.action 动作键（见 ACTIONS）
 * @param {number|null} params.targetId 目标用户（部分动作没有目标）
 * @param {string|null} [params.targetKey] 目标指纹（无用户目标时替代 targetId 绑定范围）
 * @param {'email'|'password'} [params.method] 验证方式（缺省按可用性选）
 * @param {object} [params.store] 注入的存储（测试用，缺省用命名空间 store）
 * @returns {Promise<object>} { challengeId, method, expiresIn, maskedTarget }
 * @throws {Error} `STEPUP_*` / `INVALID_PARAM:`
 */
async function createChallenge({ userId, request, action, targetId, targetKey, method, store }) {
  if (!ACTIONS[action]) throw new Error('INVALID_PARAM:不支持的操作类型');

  const factors = await loadFactors(userId);
  if (!factors) throw new Error('FORBIDDEN:账号不存在，请重新登录');

  const hasEmail = Boolean(factors.email);
  const hasPassword = Boolean(factors.credential);
  const chosen = method || (hasEmail ? 'email' : hasPassword ? 'password' : null);

  if (!chosen) {
    throw new Error('FORBIDDEN:你的账号既未绑定邮箱也未设置密码，无法完成二次验证，请联系管理员');
  }
  if (chosen === 'email' && !hasEmail) {
    throw new Error('INVALID_PARAM:你的账号未绑定邮箱，请改用登录密码验证');
  }
  if (chosen === 'password' && !hasPassword) {
    // 这句是本次改动的直接动因：不要让"没设密码"变成一个说不清的失败
    throw new Error('INVALID_PARAM:你的账号未设置密码（当前用邮箱验证码登录），请改用邮箱验证码');
  }
  if (!['email', 'password'].includes(chosen)) {
    throw new Error('INVALID_PARAM:不支持的验证方式');
  }

  const kv = store || getChallengeStore();
  const challengeId = crypto.randomUUID();

  if (chosen === 'email') {
    if (!(await consumeSendQuota(kv, userId))) {
      throw new Error('STEPUP_RATE_LIMITED:本小时验证码发送次数已达上限，请稍后再试');
    }
    try {
      // sessionId = challengeId：这个码只能用于本挑战（与登录码即使同一邮箱也不串）
      await emailDao.sendCode(factors.email, challengeId, kv, clientCtx(request, challengeId));
    } catch (err) {
      // emailDao 在发送失败时也已把码写进 store，会白等 60 秒冷却 —— 补一次清理，
      // 把"发送失败"与"发过了"区分开
      await kv.delete(factors.email).catch(() => {});
      const message = String(err?.message || '');
      if (message.includes('发送过于频繁')) {
        throw new Error(`STEPUP_RATE_LIMITED:${message.replace(/^SEND_CODE_FAILED:/, '')}`, { cause: err });
      }
      log.warn(`⚠️ [ConsoleStepUp] 验证码发送失败 userId=${userId}: ${message}`);
      throw new Error('STEPUP_UNAVAILABLE:验证码发送失败，请稍后重试或改用其它验证方式', { cause: err });
    }
  }

  await kv.set(
    `challenge:${challengeId}`,
    {
      userId: Number(userId),
      action,
      targetId: targetId === null || targetId === undefined ? null : Number(targetId),
      /*
       * 目标指纹：有些动作没有"某个用户"这个目标，而是一组筛选条件（例如清除日志）。
       * 这时把条件规范化后算出的指纹存进来，消费时比对 —— 否则"为了清 A 范围而通过的
       * 验证"可以被拿去清 B 范围，把 targetId 绑定的意义整个绕过去。
       */
      targetKey: targetKey === null || targetKey === undefined ? null : String(targetKey),
      method: chosen,
      createdAt: Date.now(),
      attempts: 0
    },
    CHALLENGE_TTL
  );

  log.info(`🔐 [ConsoleStepUp] 已创建挑战 userId=${userId} action=${action} target=${targetId} method=${chosen}`);

  return {
    challengeId,
    method: chosen,
    expiresIn: CHALLENGE_TTL,
    maskedTarget: chosen === 'email' ? maskEmail(factors.email) : null
  };
}

/**
 * 把 emailDao 的错误映射成本仓错误码
 *
 * @param {Error} err 异常
 * @returns {Error} 带前缀的异常
 */
function mapEmailError(err) {
  const raw = String(err?.message || '验证失败');
  const message = raw.replace(/^VERIFY_FAILED:/, '').replace(/^PARAM_ERROR:/, '');
  // 次数用尽 / 发送过频都属于"别急着重试"，用 429 表达
  const code =
    message.includes('尝试次数过多') || message.includes('发送过于频繁') ? 'STEPUP_RATE_LIMITED' : 'STEPUP_FAILED';
  return new Error(`${code}:${message}`, { cause: err });
}

/**
 * 校验并消费挑战
 *
 * 三个身份维度都要对得上：**本人**、**同一动作**、**同一目标**。
 *
 * @param {object} params 参数
 * @param {number} params.userId 操作者 ID
 * @param {object} params.request Fastify request
 * @param {string} params.action 动作键
 * @param {number|null} params.targetId 目标用户
 * @param {string|null} [params.targetKey] 目标指纹（与签发时比对）
 * @param {string} [params.challengeId] 挑战 ID
 * @param {string} [params.code] 邮箱验证码
 * @param {string} [params.password] 登录密码（密码方式）
 * @param {object} [params.store] 注入的存储（测试用）
 * @returns {Promise<{method: string}>} 通过的方式
 * @throws {Error} `STEPUP_REQUIRED:` / `STEPUP_FAILED:` / `STEPUP_RATE_LIMITED:`
 */
async function consumeChallenge({ userId, request, action, targetId, targetKey, challengeId, code, password, store }) {
  if (!challengeId) {
    // 428 让前端知道"该先发码"，而不是当成普通参数错误
    throw new Error('STEPUP_REQUIRED:该操作需要二次验证，请先获取验证码');
  }

  const kv = store || getChallengeStore();
  const key = `challenge:${challengeId}`;
  const record = await kv.get(key);
  if (!record) throw new Error('STEPUP_REQUIRED:验证已过期，请重新获取验证码');

  if (Number(record.userId) !== Number(userId)) {
    throw new Error('FORBIDDEN:验证信息与当前登录账号不匹配');
  }
  // 动作 / 目标必须与发码时一致：一次验证只能用于它所批准的那一次操作
  if (record.action !== action) {
    throw new Error('FORBIDDEN:该验证不是为当前操作签发的，请重新获取验证码');
  }
  const expectTarget = targetId === null || targetId === undefined ? null : Number(targetId);
  if (record.targetId !== expectTarget) {
    throw new Error('FORBIDDEN:该验证不是为该账号签发的，请重新获取验证码');
  }
  /*
   * 目标指纹同样要比对。老记录没有这个字段（`undefined`），新调用方不传也是
   * `undefined`/`null` —— 两侧都归一成 null 再比较，历史挑战不受影响。
   */
  const expectKey = targetKey === null || targetKey === undefined ? null : String(targetKey);
  if ((record.targetKey ?? null) !== expectKey) {
    throw new Error('FORBIDDEN:该验证不是为当前筛选范围签发的，请重新获取验证码');
  }

  if (record.method === 'password') {
    const factors = await loadFactors(userId);
    if (!factors?.credential) throw new Error('STEPUP_FAILED:你的账号未设置密码');

    const matched = await verifyPassword(String(password || ''), factors.credential);
    if (!matched) {
      const attempts = Number(record.attempts || 0) + 1;
      if (attempts >= MAX_PASSWORD_ATTEMPTS) {
        await kv.delete(key).catch(() => {});
        throw new Error('STEPUP_RATE_LIMITED:错误次数过多，请重新获取验证码');
      }
      // 剩余有效期继续保留，只是累加次数
      await kv.set(key, { ...record, attempts }, CHALLENGE_TTL);
      throw new Error('STEPUP_FAILED:密码不正确');
    }
  } else {
    const factors = await loadFactors(userId);
    if (!factors?.email) throw new Error('STEPUP_FAILED:你的账号未绑定邮箱');

    try {
      // 复用既有验证码逻辑：码比对、sessionId 绑定、指纹校验、失败计数与一次性消费
      await emailDao.verifyCode(factors.email, String(code || ''), kv, clientCtx(request, challengeId));
    } catch (err) {
      log.warn(`⚠️ [ConsoleStepUp] 验证码校验失败 userId=${userId} action=${action}: ${err?.message || err}`);
      const mapped = mapEmailError(err);
      /*
       * 码被作废（连续输错 / 发得过频）时：删挑战 + 写一条审计。
       * 只在这个时刻留痕 —— 偶尔输错一次是常态，每次都记会让审计被噪音淹没；
       * 而"码被作废"往往意味着有人在反复试，是值得追的信号。
       */
      if (mapped.message.startsWith('STEPUP_RATE_LIMITED')) {
        await kv.delete(key).catch(() => {});
        await auditFailure({ userId, request, action, targetId: expectTarget, reason: mapped.message });
      }
      throw mapped;
    }
  }

  /*
   * 一次性消费：先校验再 getDel。
   *
   * getDel 返回空说明**同一挑战已经被另一个并发请求用掉了** —— 必须拒绝，
   * 否则一次验证可以并发出两条删除申请（业务层虽然幂等，但这层不该放行）。
   */
  const consumed = await kv.getDel(key);
  if (!consumed) throw new Error('STEPUP_REQUIRED:验证已被使用，请重新获取验证码');

  log.info(`✅ [ConsoleStepUp] 二次验证通过 userId=${userId} action=${action} target=${expectTarget}`);

  return { method: record.method };
}

/**
 * 验证失败留痕（仅在"码被作废"这类需要追查的情况下调用）
 *
 * @param {object} params 参数
 * @param {number} params.userId 操作者 ID
 * @param {object} params.request 请求
 * @param {string} params.action 动作键
 * @param {number|null} params.targetId 目标
 * @param {string} params.reason 原因
 * @returns {Promise<void>}
 */
async function auditFailure({ userId, request, action, targetId, reason }) {
  await logAuditEvent({
    type: 'CONSOLE_STEPUP_FAILED',
    userId: Number(userId) || null,
    ip: request?.ip,
    userAgent: request?.headers?.['user-agent'] || '',
    appId: 'console',
    details: { action, targetId, reason }
  });
}

const stepUpService = { createChallenge, consumeChallenge, describeFactors };

export { ACTIONS, CHALLENGE_TTL, createChallenge, consumeChallenge, describeFactors, auditFailure };
export default stepUpService;
