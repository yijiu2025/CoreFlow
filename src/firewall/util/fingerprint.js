/**
 * 请求指纹模块
 * 从请求头生成设备指纹，用于精准封禁（避免同 IP 误杀）
 */
import crypto from 'crypto';

/**
 * 从请求头生成设备指纹
 * 组合 IP + User-Agent + Accept-Language + Accept-Encoding 的哈希
 * @param {import('fastify').FastifyRequest} request
 * @returns {string} 16 位十六进制指纹
 */
export function generateFingerprint(request) {
  const ip = request.ip || '';
  const ua = request.headers['user-agent'] || '';
  const lang = request.headers['accept-language'] || '';
  const enc = request.headers['accept-encoding'] || '';

  const raw = `${ip}|${ua}|${lang}|${enc}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}
