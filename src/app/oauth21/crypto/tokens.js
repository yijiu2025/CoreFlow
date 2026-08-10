// src/crypto/tokens.js
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
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += digits[Math.floor(Math.random() * digits.length)];
  return code;
}

export { generateToken, generateAuthorizationCode, generateDeviceCode, generateUserCode };
