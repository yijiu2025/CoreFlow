/**
 * JWT 签名与验证
 *
 * 封装 jsonwebtoken 的 sign/verify 操作，密钥从 src/framework/keys/ 获取。
 * kid 由 keys 子系统的"当前密钥"指针决定，不再使用固定 'default'。
 * @author yijiu
 * @since 2026-08-14
 */

import jwt from 'jsonwebtoken';
import { getPrivateKey, getPublicKeyByKid, getCurrentKid, ensureCurrentKey } from '../keys/index.js';
import { ALGORITHMS } from '../keys/config.js';

/**
 * 签发 JWT
 * @param {object} payload - JWT Payload
 * @param {object} [options] - 额外签名选项
 * @param {string} [options.keyName] - 指定密钥 kid，未提供则用当前密钥
 * @param {string} [options.algorithm=ALGORITHMS.RS256] - 签名算法
 * @returns {Promise<{token: string, kid: string}>} JWT 字符串与使用的密钥 ID
 */
async function sign(payload, options = {}) {
  const { keyName, algorithm = ALGORITHMS.RS256, ...signOptions } = options;
  let kid = keyName || getCurrentKid();

  // 无可用 kid（未指定且无当前密钥）→ 手动刷新确保当前密钥存在后重试，尽量不抛错
  if (!kid) {
    await ensureCurrentKey();
    kid = keyName || getCurrentKid();
    if (!kid) throw new Error('刷新后仍无可用当前密钥，无法签发 JWT');
  }

  const privateKey = await getPrivateKey(kid);
  const token = jwt.sign(payload, privateKey, {
    algorithm,
    keyid: kid,
    ...signOptions
  });
  return { token, kid };
}

/**
 * 验证 JWT
 * @param {string} token - JWT 字符串
 * @returns {Promise<object>} 解码后的 Payload
 * @throws {jwt.JsonWebTokenError} 签名无效或令牌过期时抛出
 */
async function verify(token) {
  const header = jwt.decode(token, { complete: true })?.header;
  // header 无 kid 时回退到当前密钥（getPublicKeyByKid 内部处理）
  const kid = header?.kid;
  const { pem } = await getPublicKeyByKid(kid);
  return jwt.verify(token, pem, {
    algorithms: [ALGORITHMS.RS256]
  });
}

export { sign, verify };
