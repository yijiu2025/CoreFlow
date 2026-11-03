/**
 * 人机挑战验证服务
 *
 * 从 api/firewall/v1/challenge.js 下沉：浏览器挑战结果验证 + 签发通过令牌。
 * 复用 firewall 的 PoW 原语 / generateFingerprint / 访问层挑战载荷 / auth 的设备 ID 流程。
 *
 * 校验三要素（缺一不可）：
 *   1. **服务端持有**：challengeId 必须能回查到载荷（旧实现把凭据内嵌进页面，无需回查即通过）；
 *   2. **单次有效**：载荷是原子 GET+DEL 取走的，重放同一个 challengeId 必然失败；
 *   3. **绑定上下文 + 工作量证明**：载荷里记录的 IP/指纹/设备 ID 必须与本次一致，且答案必须满足难度。
 *
 * @author yijiu
 * @since 2026-08-17
 */
import crypto from 'crypto';
import { generateFingerprint } from '../../../framework/firewall/util/fingerprint.js';
import { verifyPow } from '../../../framework/firewall/util/pow-sha256.js';
import { grantPass, takeChallenge, readAccessState } from '../../../framework/firewall/util/redis.js';
import { issueChallengePayload } from '../../../framework/firewall/challenge-template.js';
import { getClientDeviceId } from '../../../framework/auth/index.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.services.challenge');

/** 通过令牌有效期（30 分钟） */
const PASS_TOKEN_TTL = 1800;

/**
 * 为 **Vue 挑战页**签发一份挑战（JSON 入口）
 *
 * 为什么需要它：挑战载荷原先只在渲染后端 HTML 模板时写入（`buildChallengePage`），
 * 前端 SPA 拿不到 `challengeId/salt/difficulty`，就没法自己算 PoW。这里把同一份
 * 签发逻辑（`issueChallengePayload`）开放成 JSON —— 载荷仍然**只存服务端**，
 * 下发的 challengeId 依旧是不可回放的不透明串，安全语义与内置模板完全一致。
 *
 * 绑定上下文与 `verifyChallenge` 逐项对齐（IP + 指纹 + 设备 ID）：同一份载荷
 * 只能被同一上下文消费，换 IP / 换 UA 都过不了校验。
 *
 * ⚠️ **只在挑战态签发**：非挑战态请求返回 403 `Not Challenged`。否则免登录的 issue
 * 就成了"预先买票"——先解一次 PoW 换 30 分钟免挑战，把整套挑战降级成可选项。
 *
 * @param {object} request Fastify request（取 ip / headers / cookie）
 * @returns {Promise<{ok:true, challengeId:string, salt:string, difficulty:number, maxAttempts:number, ttlSec:number}
 *   | {ok:false, statusCode:number, reason:string}>}
 */
async function issueChallenge(request) {
  try {
    const fingerprint = generateFingerprint(request);
    const deviceId = await getClientDeviceId(request);

    // ── 闸门：只有**当前确实处于挑战态**才签发 ──
    //
    // 为什么要这道闸（2026-11-03 补）：issue 是免登录接口，若无条件签发，任何人先打开
    // 挑战页解一次 PoW（约 4k 次哈希，几十毫秒）就能拿到 30 分钟有效的 fw_verified，
    // 之后狂刷时 `checkChallengeCookie` 直接放行 —— 等于把"限频后必须过验证"降级成
    // "每 30 分钟自证一次即可"。而内置 HTML 模板天然没有这个口子：它只在挑战态渲染。
    // 一道只读 Redis 的判定，把这个不对称补齐。
    const state = await readAccessState({ ip: request.ip, fingerprint, deviceId });
    const inChallenge = [state.ipBlock, state.fpBlock, state.devBlock].some(b => b?.status === 'CHALLENGE');
    if (!inChallenge) {
      return { ok: false, statusCode: 403, reason: 'Not Challenged' };
    }

    const payload = await issueChallengePayload({ ip: request.ip, fingerprint, deviceId });
    return { ok: true, ...payload };
  } catch (err) {
    // 签发失败（Redis 写不进等）：对外只给可编程原因，内部细节进日志
    log.warn('⚠️ [Firewall] 挑战签发失败', err);
    return { ok: false, statusCode: 503, reason: 'Challenge Unavailable' };
  }
}

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
 * @param {object} request - Fastify request（取 body / ip / 指纹 / 设备 ID）
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
  const deviceId = await getClientDeviceId(request);

  // 2. 绑定校验：挑战是在某个 IP/指纹/设备上下发的，换一个上下文不能复用。
  //    设备维度只有在下发时确实绑定了、且本次仍能取到时才校验 —— 反过来（下发时没有、
  //    本次有）不算绕过，因为它本来就只是「额外多一个维度」而不是必要条件。
  if (!safeEqual(payload.ip || '', request.ip || '')) {
    return { ok: false, statusCode: 403, reason: 'Challenge Mismatch' };
  }
  if (payload.fingerprint && !safeEqual(payload.fingerprint, fingerprint)) {
    return { ok: false, statusCode: 403, reason: 'Challenge Mismatch' };
  }
  if (payload.deviceId && !safeEqual(payload.deviceId, deviceId || '')) {
    return { ok: false, statusCode: 403, reason: 'Challenge Mismatch' };
  }

  // 3. 工作量证明校验（难度取载荷内的值，避免下发后改配置导致前后不一致）
  if (!verifyPow(challengeId, payload.salt, answer, payload.difficulty)) {
    return { ok: false, statusCode: 403, reason: 'Invalid Proof' };
  }

  // 4. 签发验证令牌（绑定设备 / 指纹 / IP 三个维度）
  const token = crypto.randomBytes(32).toString('hex');
  await grantPass({ ip: request.ip, fingerprint, deviceId, token, ttlSec: PASS_TOKEN_TTL });

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

export { issueChallenge, verifyChallenge };
