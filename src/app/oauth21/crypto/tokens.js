/**
 * 随机令牌生成工具（授权码/设备码/refresh token 等）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'node:crypto';

/** 生成安全的随机令牌（URL-safe base64） */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** 生成授权码 */
function generateAuthorizationCode() {
  return generateToken(32);
}

/** 生成设备码 */
function generateDeviceCode() {
  return generateToken(32);
}

/** 生成用户码（如 "WDJB-MJHT"） */
function generateUserCode() {
  const chars = 'BCDFGHJKLMNPQRSTVWXYZ';
  const digits = '0123456789';
  let code = '';
  // 🔴 用 CSPRNG（crypto.randomInt）而不是 Math.random（2026-11-08）：
  // 用户码是设备授权流程里"把设备请求绑定到某个账号"的凭据，V8 的 PRNG
  // 状态可由少量输出还原 → 攻击者可预测即将签发的用户码。
  for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += digits[crypto.randomInt(digits.length)];
  return code;
}

export { generateToken, generateAuthorizationCode, generateDeviceCode, generateUserCode };
