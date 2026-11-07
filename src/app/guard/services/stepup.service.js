/**
 * 安全配置变更的二次认证（step-up）
 *
 * ── 适用范围 ──
 * `enabled` / `requireLogin` / `allowIps` / `allowRoles` 的**任何**实际变更
 * （收紧与放宽都算），都必须先换一张 ticket。收紧之所以也要认证：
 * 把某个模块关掉、把某个角色踢出去，同样是影响线上可用性的高危操作，
 * 误操作与越权操作在结果上没有区别。只改 `description` 这类无鉴权语义的字段不需要。
 *
 * ── 为什么是两步 ──
 * 第一步 challenge：服务端根据目标路径 + patch 算出 patchHash 并留存，
 *   同时发出验证码（或标记为密码方式）。
 * 第二步 verify：核验凭据，签发一张**与 patchHash 绑定、5 分钟有效、一次性**的票据。
 * 第三步写入才拿票据换执行，服务端重算 patchHash 比对。
 *
 * 这样做的关键收益：**一次授权只能用于它被批准的那一次变更**。
 * 常见做法是"验证通过后给会话打个 5 分钟标记"，那等于给了一个 5 分钟的自由窗口，
 * 拿到之后可以做任意次变更 —— 本文件刻意不采用。
 *
 * ── 凭据 ──
 * - email：**复用 framework/verify/email/dao.js**（后端既有逻辑）——
 *   6 位码、600s 有效期、60s 重发冷却、5 次失败作废、发码/用码绑定同一
 *   `sessionId`（此处为 challengeId）与客户端指纹（IP+UA）。与登录验证码共用实现，
 *   避免两套规则各写一份、各自漂移。
 * - password：校验本地密码哈希（OAuth-only 账号无密码，走验证码）
 * - sms：短信服务商接口目前是空实现（framework/verify/sms/service.js 会抛
 *   "尚未接入"），因此**明确拒绝**而不是静默降级成邮箱 ——
 *   "以为发了短信、其实没发"是最糟的失败方式。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import crypto from 'node:crypto';
import { getStore } from '../../../framework/redis/index.js';
import { getModel } from '../../../framework/db/index.js';
import { verifyPassword } from '../../../framework/auth/index.js';
import emailDao from '../../../framework/verify/email/dao.js';
import { createLogger } from '../../../framework/log/index.js';
import { canonicalJson, pickRuntimeFields } from './direction.js';
import { isSuperAdmin, assertChangeAuthority } from './authority.js';

const log = createLogger('app.guard.stepup');

/**
 * 挑战有效期
 *
 * 必须 ≥ 验证码本身的有效期（`framework/verify/config.js` 的 `common.codeTtl`，默认 600s），
 * 否则会出现"码还没过期、挑战先过期"的错位，用户只能重来。
 */
const CHALLENGE_TTL = 600;

/** 票据有效期：够走完前端"确认 → 提交"，又不至于被长期囤积 */
const TICKET_TTL = 300;

/** 密码方式的错误次数上限（邮箱方式的次数控制由 emailDao 自己负责） */
const MAX_PASSWORD_ATTEMPTS = 5;

/** 同一用户每小时最多发码次数（emailDao 只管 60s 间隔，没有小时级配额） */
const MAX_SENDS_PER_HOUR = 5;

/** 原因文本长度约束（写进审计，太短等于没写） */
const MIN_REASON_LENGTH = 4;
const MAX_REASON_LENGTH = 200;

/** 存储命名空间：与登录用的 email_code 完全隔离，避免同一邮箱的两类验证码互相覆盖 */
const STORE_NAMESPACE = 'guard_stepup';

/** 进程内单例 */
let store = null;

function getStepupStore() {
  if (!store) store = getStore(STORE_NAMESPACE);
  return store;
}

/** 恒定时间比较字符串 */
function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** 目标路径字符串（system/group/apiKey），既用于展示也参与签名 */
function buildPath(system, group, apiKey) {
  return [system, group, apiKey].filter(Boolean).join('/');
}

/**
 * 计算本次变更摘要
 *
 * 只把**运行时字段**纳入摘要：description 之类不参与鉴权语义，
 * 让它们进摘要只会导致"改个说明就得重新认证"。
 *
 * @param {string} path
 * @param {object} patch
 * @returns {string} sha256 hex
 */
function hashPatch(path, patch) {
  const material = canonicalJson({ path, fields: pickRuntimeFields(patch) });
  return crypto.createHash('sha256').update(material).digest('hex');
}

/** 邮箱脱敏：u***@example.com */
function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '***';
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

/** 票据 token 的存储键：只存摘要，Redis 泄露时拿到 key 也换不到可用票据 */
function ticketKey(token) {
  return `ticket:${crypto.createHash('sha256').update(String(token)).digest('hex')}`;
}

/**
 * 客户端上下文（供既有验证码逻辑做指纹绑定）
 *
 * emailDao 在发码时记录 `sha256(IP|UA)`，用码时回查一致，
 * 所以发码与用码必须来自同一客户端环境 —— 这正是我们要的语义。
 *
 * @param {object} request
 * @param {string} [sessionId]
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
 * 读取当前操作者的认证要素
 *
 * @param {string} uid 用户 UUID
 * @returns {Promise<{uid:string, email:string, phone:string, credential:string, status:number}|null>}
 */
async function loadAuthFactors(uid) {
  const User = getModel('User');
  if (!User) return null;

  const user = await User.findOne({
    where: { uid },
    attributes: ['uid', 'email', 'phone', 'credential', 'status']
  });
  if (!user) return null;

  return {
    uid: user.uid,
    email: user.email || '',
    phone: user.phone || '',
    credential: user.credential || '',
    status: user.status
  };
}

/**
 * 每小时发码配额
 *
 * @returns {Promise<boolean>} true = 还有额度
 */
async function consumeSendQuota(kv, uid) {
  const hourBucket = Math.floor(Date.now() / 3600_000);
  const quotaKey = `send:${uid}:${hourBucket}`;
  const used = Number((await kv.get(quotaKey)) || 0);
  if (used >= MAX_SENDS_PER_HOUR) return false;
  await kv.set(quotaKey, used + 1, 3600);
  return true;
}

/**
 * 第一步：创建挑战
 *
 * @param {object} params
 * @param {string} params.system 系统标识
 * @param {string} params.group 模块标识
 * @param {string} [params.apiKey] 接口标识
 * @param {object} params.patch 待写入的字段
 * @param {string} params.reason 变更原因（审计用）
 * @param {'password'|'email'|'sms'} params.method 认证方式
 * @param {object} params.request Fastify request（取 uid / ip / ua）
 * @returns {Promise<object>}
 */
async function createChallenge({ system, group, apiKey, patch, reason, method, request }) {
  const uid = request?.state?.user?.uid;
  if (!uid) return { ok: false, statusCode: 401, message: '身份验证失败，请先登录' };

  // 身份门槛放在最前面：非超管连"发码"这一步都不该走通，
  // 否则会出现"有权限的运维收到了码、却不知道能不能改"的模糊态。
  if (!isSuperAdmin(request.state.user)) {
    return { ok: false, statusCode: 403, message: '安全配置仅允许超级管理员操作' };
  }

  const reasonText = String(reason || '').trim();
  if (reasonText.length < MIN_REASON_LENGTH || reasonText.length > MAX_REASON_LENGTH) {
    return {
      ok: false,
      statusCode: 400,
      message: `请填写${MIN_REASON_LENGTH}-${MAX_REASON_LENGTH} 字的变更原因`
    };
  }

  if (!['password', 'email'].includes(method)) {
    if (method === 'sms') {
      return { ok: false, statusCode: 400, message: '短信通道尚未接入，请改用邮箱验证码或登录密码' };
    }
    return { ok: false, statusCode: 400, message: '不支持的认证方式' };
  }

  const factors = await loadAuthFactors(uid);
  if (!factors) return { ok: false, statusCode: 404, message: '账号不存在' };
  if (factors.status === 0) return { ok: false, statusCode: 403, message: '账号已被禁用，无法执行安全变更' };

  // 白名单比对用**数据库里的邮箱**（即实际收码地址），不用会话快照 ——
  // 否则"换绑邮箱 → 旧会话仍通过"就能绕开白名单。
  const authority = assertChangeAuthority(request.state.user, factors.email);
  if (!authority.ok) return authority;

  if (method === 'password' && !factors.credential) {
    return { ok: false, statusCode: 400, message: '当前账号未设置密码，请改用邮箱验证码' };
  }
  if (method === 'email' && !factors.email) {
    return { ok: false, statusCode: 400, message: '当前账号未绑定邮箱，无法使用验证码' };
  }

  const s = getStepupStore();
  const path = buildPath(system, group, apiKey);
  const patchHash = hashPatch(path, patch);
  const challengeId = crypto.randomUUID();

  if (method === 'email') {
    if (!(await consumeSendQuota(s, uid))) {
      return { ok: false, statusCode: 429, message: '本小时验证码发送次数已达上限' };
    }

    try {
      // sessionId = challengeId：验证码只能用在本挑战上，
      // 与登录流程的验证码即使同一邮箱也互不串号（namespace 也不同）
      await emailDao.sendCode(factors.email, challengeId, s, clientCtx(request, challengeId));
    } catch (err) {
      // emailDao 在发送失败时已经把码写进 store，这会让用户白白等 60 秒冷却，
      // 这里补一次清理，把"发送失败"与"发过了"区分开
      await s.delete(factors.email).catch(() => {});
      const message = String(err?.message || '');
      if (message.includes('发送过于频繁')) {
        return { ok: false, statusCode: 429, message: message.replace(/^SEND_CODE_FAILED:/, '') };
      }
      log.warn(`⚠️ [StepUp] 验证码发送失败 uid=${uid}: ${message}`);
      return { ok: false, statusCode: 502, message: '验证码发送失败，请稍后重试或改用登录密码' };
    }
  }

  const record = {
    uid,
    sessionId: request?.state?.user?.sessionId || null,
    path,
    patchHash,
    method,
    reason: reasonText,
    createdAt: Date.now(),
    attempts: 0
  };
  await s.set(`challenge:${challengeId}`, record, CHALLENGE_TTL);

  log.info(`🔐 [StepUp] 已创建挑战 uid=${uid} method=${method} path=${path}`);

  return {
    ok: true,
    challengeId,
    method,
    path,
    expiresIn: CHALLENGE_TTL,
    maskedTarget: method === 'email' ? maskEmail(factors.email) : null
  };
}

/**
 * 把 emailDao 的错误映射成 HTTP 状态
 *
 * @param {Error} err
 * @returns {{statusCode:number, message:string}}
 */
function mapEmailError(err) {
  const raw = String(err?.message || '验证失败');
  const message = raw.replace(/^VERIFY_FAILED:/, '').replace(/^PARAM_ERROR:/, '');
  if (message.includes('尝试次数过多')) return { statusCode: 429, message };
  if (message.includes('发送过于频繁')) return { statusCode: 429, message };
  return { statusCode: 400, message };
}

/**
 * 第二步：核验凭据并签发票据
 *
 * @param {object} params
 * @param {string} params.challengeId
 * @param {string} [params.code] 邮箱验证码
 * @param {string} [params.password] 登录密码
 * @param {object} params.request
 * @returns {Promise<object>}
 */
async function verifyChallenge({ challengeId, code, password, request }) {
  const uid = request?.state?.user?.uid;
  if (!uid) return { ok: false, statusCode: 401, message: '身份验证失败，请先登录' };
  if (!challengeId) return { ok: false, statusCode: 400, message: '缺少挑战标识' };

  const s = getStepupStore();
  const key = `challenge:${challengeId}`;
  const record = await s.get(key);
  if (!record) return { ok: false, statusCode: 400, message: '认证已过期，请重新发起' };

  // 挑战只能本人使用：换个人拿到 challengeId 也不能替别人完成认证
  if (record.uid !== uid) return { ok: false, statusCode: 403, message: '认证信息与当前登录账号不匹配' };

  if (record.method === 'password') {
    const nextAttempts = (record.attempts || 0) + 1;
    const reject = async message => {
      if (nextAttempts >= MAX_PASSWORD_ATTEMPTS) {
        await s.delete(key);
        return { ok: false, statusCode: 429, message: '错误次数过多，请重新发起认证' };
      }
      const remaining = Math.max(1, Math.ceil(CHALLENGE_TTL - (Date.now() - record.createdAt) / 1000));
      await s.set(key, { ...record, attempts: nextAttempts }, remaining);
      return { ok: false, statusCode: 400, message };
    };

    const factors = await loadAuthFactors(uid);
    if (!factors?.credential) return { ok: false, statusCode: 400, message: '当前账号未设置密码' };

    const matched = await verifyPassword(String(password || ''), factors.credential);
    if (!matched) {
      log.warn(`⚠️ [StepUp] 密码校验失败 uid=${uid} path=${record.path}`);
      return reject('密码不正确');
    }
  } else {
    const factors = await loadAuthFactors(uid);
    if (!factors?.email) return { ok: false, statusCode: 400, message: '当前账号未绑定邮箱' };

    try {
      // 复用既有验证码逻辑：内部完成码比对、sessionId 绑定、指纹校验、失败计数与一次性消费
      await emailDao.verifyCode(factors.email, String(code || ''), s, clientCtx(request, challengeId));
    } catch (err) {
      log.warn(`⚠️ [StepUp] 验证码校验失败 uid=${uid} path=${record.path}: ${err?.message || err}`);
      const mapped = mapEmailError(err);
      // 验证码被作废（次数用尽）时，挑战也没有继续存在的意义
      if (mapped.statusCode === 429) await s.delete(key).catch(() => {});
      return { ok: false, ...mapped };
    }
  }

  // 一次性消费挑战：同一个 challengeId 不能换出第二张票据
  const consumed = await s.getDel(key);
  if (!consumed) return { ok: false, statusCode: 400, message: '认证已过期，请重新发起' };

  const token = crypto.randomBytes(32).toString('base64url');
  const ticket = {
    uid,
    sessionId: record.sessionId,
    path: record.path,
    patchHash: record.patchHash,
    method: record.method,
    reason: record.reason,
    issuedAt: Date.now()
  };
  await s.set(ticketKey(token), ticket, TICKET_TTL);

  log.info(`✅ [StepUp] 已签发票据 uid=${uid} method=${record.method} path=${record.path}`);

  return {
    ok: true,
    ticket: token,
    expiresIn: TICKET_TTL,
    method: record.method,
    reason: record.reason
  };
}

/**
 * 第三步：消费票据（写入时调用）
 *
 * 校验三件事，缺一不可：
 * 1. 票据属于当前用户（含会话）；
 * 2. 票据绑定的路径与本次一致；
 * 3. 票据绑定的 patchHash 与**本次实际写入的 patch** 一致。
 *
 * @param {object} params
 * @param {string} params.token 票据明文
 * @param {string} params.system
 * @param {string} params.group
 * @param {string} [params.apiKey]
 * @param {object} params.patch 即将写入的字段
 * @param {object} params.request
 * @returns {Promise<{ok:true, method:string, reason:string}|{ok:false, statusCode:number, message:string}>}
 */
async function consumeTicket({ token, system, group, apiKey, patch, request }) {
  const uid = request?.state?.user?.uid;
  if (!uid) return { ok: false, statusCode: 401, message: '身份验证失败，请先登录' };
  if (!token) return { ok: false, statusCode: 428, message: '该变更需要二次认证' };

  const s = getStepupStore();
  const key = ticketKey(token);
  const ticket = await s.get(key);
  if (!ticket) return { ok: false, statusCode: 428, message: '二次认证已过期或已使用，请重新认证' };

  if (ticket.uid !== uid) {
    // 不消费：避免他人试探导致真正持有者的票据被烧掉
    return { ok: false, statusCode: 403, message: '二次认证与当前账号不匹配' };
  }
  if (ticket.sessionId && request?.state?.user?.sessionId && ticket.sessionId !== request.state.user.sessionId) {
    return { ok: false, statusCode: 403, message: '二次认证与当前会话不匹配，请重新认证' };
  }

  const path = buildPath(system, group, apiKey);
  if (ticket.path !== path) {
    return { ok: false, statusCode: 403, message: '二次认证与本次变更对象不匹配' };
  }

  const expectedHash = hashPatch(path, patch);
  if (!safeEqual(ticket.patchHash, expectedHash)) {
    return { ok: false, statusCode: 403, message: '二次认证与本次变更内容不匹配，请重新认证' };
  }

  // 原子消费：并发请求里只有一个能拿到
  const consumed = await s.getDel(key);
  if (!consumed) return { ok: false, statusCode: 428, message: '二次认证已过期或已使用，请重新认证' };

  return { ok: true, method: ticket.method, reason: ticket.reason };
}

export { CHALLENGE_TTL, TICKET_TTL, hashPatch, buildPath, createChallenge, verifyChallenge, consumeTicket };
