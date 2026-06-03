// src/crypto/pkce.js
import crypto from 'node:crypto';

/**
 * 验证 PKCE code_verifier 是否与 code_challenge 匹配
 */
export function verifyPKCE(codeVerifier, codeChallenge, method = 'S256') {
  if (!codeVerifier || !codeChallenge) return false;

  if (method === 'S256') {
    const hash = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return hash === codeChallenge;
  }

  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }

  return false;
}

/**
 * 验证 code_verifier 格式（RFC 7636 §4.1）
 * 43~128 字符，仅允许 [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 */
export function isValidCodeVerifier(verifier) {
  if (!verifier) return false;
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}
