/**
 * 挑战 provider：PoW（自包含，默认）
 *
 * 这是"验证能力"在防火墙侧的**策略外壳**：题目怎么出（难度取多少）、绑定谁、
 * 失败算哪类原因，全部在这里；哈希与判题本身在 `framework/verify/pow`。
 *
 * 之所以还留这一层（而不是让 service 直接调 powDao）：它和 turnstile / hcaptcha /
 * google 必须是**同一个形状**，service 才能只做"拿到 provider → 出题/判题 → 签令牌"，
 * 不用为每个 provider 写一份 if 分支。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import crypto from 'crypto';
import { issueChallengePayload } from '../../../../framework/firewall/challenge-template.js';
import { powChallengeStore } from '../../../../framework/firewall/util/pow-store.js';
import { noteChallengeProofFailed } from '../../../../framework/firewall/challenge-difficulty.js';
import { powDao } from '../../../../framework/verify/pow/index.js';

/** 题号格式（32 位十六进制）：格式不对就不必去打存储 */
const CHALLENGE_ID_RE = /^[0-9a-f]{32}$/;

/**
 * 定长比较（长度不同直接 false，绝不把长度差异喂进 timingSafeEqual —— 那会抛 RangeError）
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

/** @type {{name: string, issue: Function, verify: Function}} */
const powProvider = {
  name: 'pow',

  /**
   * 出题（难度由递进难度决定，绑定 ip / 指纹 / 设备 ID）
   *
   * @param {{ip: string, fingerprint?: string|null, deviceId?: string|null, loggedIn?: boolean}} ctx 挑战对象
   * @returns {Promise<object>} 下发给客户端的题目材料（含 `reason` 粗粒度归因）
   */
  async issue(ctx) {
    return await issueChallengePayload(ctx);
  },

  /**
   * 判题
   *
   * 顺序是刻意的：**先取载荷（一次性消费）→ 再比绑定 → 最后算哈希**。
   * 绑定比对放在哈希前，才能把"换 IP 重放"识别成 `Mismatch` 而不是白算一遍哈希；
   * 而载荷一旦取走就没了，所以任何失败都必须让用户重新出题。
   *
   * @param {object} input 判题输入
   * @param {object} input.request Fastify request（取 ip）
   * @param {{ip: string, fingerprint: string, deviceId: string|null}} input.context 本次请求的绑定上下文
   * @param {object} input.body 请求体（`challengeId` + `answer`）
   * @returns {Promise<{ok: true} | {ok: false, reason: string}>} 判定结果
   */
  async verify({ request, context, body }) {
    const { challengeId, answer } = body || {};

    if (typeof challengeId !== 'string' || !CHALLENGE_ID_RE.test(challengeId)) {
      return { ok: false, reason: 'Malformed Challenge' };
    }

    // 1. 取走载荷（原子 GET+DEL）→ 未知 / 已消费 / 已过期 一律同类失败
    const payload = await powDao.consume(powChallengeStore, challengeId);
    if (!payload) {
      return { ok: false, reason: 'Challenge Expired' };
    }

    // 2. 绑定校验：题目是在某个 IP/指纹/设备上下发的，换一个上下文不能复用。
    //    设备维度只有在下发时确实绑定了、且本次仍能取到时才校验 —— 反过来（下发时没有、
    //    本次有）不算绕过，因为它本来就只是「额外多一个维度」而不是必要条件。
    const binding = payload.binding || {};
    if (!safeEqual(binding.ip || '', context.ip || '')) {
      return { ok: false, reason: 'Challenge Mismatch' };
    }
    if (binding.fingerprint && !safeEqual(binding.fingerprint, context.fingerprint)) {
      return { ok: false, reason: 'Challenge Mismatch' };
    }
    if (binding.deviceId && !safeEqual(binding.deviceId, context.deviceId || '')) {
      return { ok: false, reason: 'Challenge Mismatch' };
    }

    // 3. 工作量证明校验（盐/难度取载荷内的值，避免下发后改配置导致前后不一致）
    const proof = powDao.check(payload, { challengeId, answer });
    if (!proof.ok) {
      // 递进难度的唯一"升"信号：**答案不对**。Expired / Mismatch / Malformed 都不计 ——
      // 那些更像客户端或网络问题，拿它们加难度会把真实用户越推越死。
      await noteChallengeProofFailed(request.ip);
      return { ok: false, reason: proof.reason };
    }

    return { ok: true };
  }
};

export { powProvider };
