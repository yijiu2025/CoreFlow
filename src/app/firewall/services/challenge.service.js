/**
 * 人机挑战验证服务
 *
 * 从 api/firewall/v1/challenge.js 下沉：浏览器挑战结果验证 + 签发通过令牌。
 * 复用 firewall 的 CHALLENGE_SECRET / generateFingerprint。
 *
 * @author yijiu
 * @since 2026-08-17
 */
import crypto from 'crypto';
import { CHALLENGE_SECRET } from '../config/config.js';
import { generateFingerprint } from '../util/fingerprint.js';

/** 挑战时效（5 分钟） */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** 通过令牌有效期（30 分钟） */
const PASS_TOKEN_TTL = 1800;

/**
 * 验证浏览器提交的挑战结果，通过则签发 fw_verified 令牌（Cookie + Redis）
 *
 * @param {object} request - Fastify request（取 body / ip / 指纹）
 * @param {object} reply - Fastify reply（设 Cookie）
 * @returns {Promise<{ok:true} | {ok:false, statusCode:number, reason:string}>}
 */
export async function verifyChallenge(request, reply) {
  const { nonce, timestamp, signature, webgl, webdriver, plugins } = request.body;
  const fingerprint = generateFingerprint(request);

  // 1. 签名验证（兼容旧版 IP 签名 + 新版指纹签名）
  const expectedIp = crypto
    .createHmac('sha256', CHALLENGE_SECRET)
    .update(`${request.ip}:${nonce}:${timestamp}`)
    .digest('hex');
  const expectedFp = crypto
    .createHmac('sha256', CHALLENGE_SECRET)
    .update(`${fingerprint}:${nonce}:${timestamp}`)
    .digest('hex');

  if (signature !== expectedIp && signature !== expectedFp) {
    return { ok: false, statusCode: 403, reason: 'Signature Mismatch' };
  }

  // 2. 时效性验证
  if (Date.now() - timestamp > CHALLENGE_TTL_MS) {
    return { ok: false, statusCode: 403, reason: 'Challenge Expired' };
  }

  // 3. 浏览器指纹检查
  if (!webgl || webdriver || plugins === 0) {
    return { ok: false, statusCode: 403, reason: 'Suspicious Environment' };
  }

  // 4. 签发验证令牌（同时绑定指纹和 IP）
  const token = crypto.randomBytes(32).toString('hex');
  if (request.server?.redis) {
    const pipeline = request.server.redis.pipeline();
    pipeline.set(`fw:pass:fp:${fingerprint}:${token}`, '1', 'EX', PASS_TOKEN_TTL);
    pipeline.set(`fw:pass:${request.ip}:${token}`, '1', 'EX', PASS_TOKEN_TTL);
    await pipeline.exec();
  }

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
