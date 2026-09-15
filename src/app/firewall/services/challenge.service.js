/**
 * 人机挑战验证服务
 *
 * 从 api/firewall/v1/challenge.js 下沉：浏览器挑战结果验证 + 签发通过令牌。
 * 复用 firewall 的 PoW 原语 / generateFingerprint / 访问层挑战载荷。
 *
 * 校验三要素（缺一不可）：
 *   1. **服务端持有**：challengeId 必须能回查到载荷（旧实现把凭据内嵌进页面，无需回查即通过）；
 *   2. **单次有效**：载荷是原子 GET+DEL 取走的，重放同一个 challengeId 必然失败；
 *   3. **绑定上下文 + 工作量证明**：载荷里记录的 IP/指纹必须与本次一致，且答案必须满足难度。
 *
 * @author yijiu
 * @since 2026-08-17
 */
import crypto from 'crypto';
import { generateFingerprint } from '../util/fingerprint.js';
import { verifyPow } from '../util/pow-sha256.js';
import { grantPass, takeChallenge } from '../util/redis.js';

/** 通过令牌有效期（30 分钟） */
const PASS_TOKEN_TTL = 1800;

/**
 * 定长比较（长度不同直接返回 false，绝不把长度差异喂进 timingSafeEqual —— 那会抛 RangeError）
 *
 * @param {string} a 比较值 a
 * @param {string} b 比较值 b
 * @returns {boolean} 是否相等
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 验证浏览器提交的挑战结果，通过则签发 fw_verified 令牌（Cookie + Redis）
 *
 * @param {object} request - Fastify request（取 body / ip / 指纹）
 * @param {object} reply - Fastify reply（设 Cookie）
 * @returns {Promise<{ok:true} | {ok:false, statusCode:number, reason:string}>}
 */
async function verifyChallenge(request, reply) {
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const { challengeId, answer } = body;

  if (typeof challengeId !== 'string' || !/^[0-9a-f]{32}$/.test(challengeId)) {
    return { ok: false, statusCode: 403, reason: 'Malformed Challenge' };
  }

  // 1. 取走载荷（原子 GET+DEL）→ 未知 / 已消费 / 已过期 一律同类失败
  const payload = await takeChallenge(challengeId);
  if (!payload) {
    return { ok: false, statusCode: 403, reason: 'Challenge Expired' };
  }

  const fingerprint = generateFingerprint(request);

  // 2. 绑定校验：挑战是在某个 IP/指纹上下发的，换一个上下文不能复用
  if (!safeEqual(payload.ip || '', request.ip || '')) {
    return { ok: false, statusCode: 403, reason: 'Challenge Mismatch' };
  }
  if (payload.fingerprint && !safeEqual(payload.fingerprint, fingerprint)) {
    return { ok: false, statusCode: 403, reason: 'Challenge Mismatch' };
  }

  // 3. 工作量证明校验（难度取载荷内的值，避免下发后改配置导致前后不一致）
  if (!verifyPow(challengeId, payload.salt, answer, payload.difficulty)) {
    return { ok: false, statusCode: 403, reason: 'Invalid Proof' };
  }

  // 4. 签发验证令牌（同时绑定指纹和 IP）
  const token = crypto.randomBytes(32).toString('hex');
  await grantPass({ ip: request.ip, fingerprint, token, ttlSec: PASS_TOKEN_TTL });

  // 5. 设置 HttpOnly Cookie
  reply.setCookie('fw_verified', token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: PASS_TOKEN_TTL,
    sameSite: 'Strict'
  });

  return { ok: true };
}

export { verifyChallenge };
