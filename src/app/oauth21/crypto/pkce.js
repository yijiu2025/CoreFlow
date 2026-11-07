/**
 * PKCE 工具（code_verifier 生成 + code_challenge S256 计算）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'node:crypto';

/**
 * 常量时间字符串比较
 *
 * 长度不等直接 false（长度不是秘密，且 timingSafeEqual 要求等长 Buffer）；
 * 等长后走 crypto.timingSafeEqual，避免逐字节短路比较的时序侧信道。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 验证 PKCE code_verifier 是否与 code_challenge 匹配
 *
 * 比较用**常量时间**实现：challenge 虽是公开值（authorize 请求里明文带着），
 * 逐字节短路的 `===` 仍属于可消除的时序侧信道 —— 消除它的成本为零。
 */
function verifyPKCE(codeVerifier, codeChallenge, method = 'S256') {
  if (!codeVerifier || !codeChallenge) return false;

  if (method === 'S256') {
    const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return timingSafeEqualStrings(hash, codeChallenge);
  }

  if (method === 'plain') {
    return timingSafeEqualStrings(codeVerifier, codeChallenge);
  }

  return false;
}

/**
 * 验证 code_verifier 格式（RFC 7636 §4.1）
 * 43~128 字符，仅允许 [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 */
function isValidCodeVerifier(verifier) {
  if (!verifier) return false;
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

export { verifyPKCE, isValidCodeVerifier };
