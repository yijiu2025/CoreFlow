/**
 * 请求指纹模块
 * 从请求头生成指纹，用于「比单一 IP 更细一档」的封禁粒度
 *
 * ⚠️ 能力边界（务必读）：
 *   `generateFingerprint` 的输入包含 **IP**，因此它是「IP + UA + 语言 + 编码」的联合标识：
 *     - 换 IP → 指纹变；
 *     - 改任意一个请求头 → 指纹变；
 *   它**做不到**「同一攻击者更换 IP 后仍可追踪」—— 旧注释与 README 都这么写，与实现相反。
 *   要跨 IP 追踪需要与 IP 无关的设备指纹，那需要客户端参与（JS 采集 + 上报），
 *   本模块不提供。`generateDeviceFingerprint` 只做服务端可得的「与 IP 无关」近似，
 *   仅供日志/观测，**不用于封禁**（它由纯请求头构成，多人可共享同一个值，
 *   用它做封禁会造成大面积误伤）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'crypto';

/**
 * 取前 16 位十六进制摘要
 *
 * @param {string} raw 原始串
 * @returns {string} 16 位十六进制指纹
 */
function digest16(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * 从请求头生成「访问指纹」（含 IP，用于封禁粒度判定）
 *
 * 输入构成**保持历史不变**：改动构成会让已经落库/落 Redis 的指纹封禁与通过令牌
 * 全部失配（在途状态被静默丢弃），因此这里只补充文档，不改算法。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {string} 16 位十六进制指纹
 */
function generateFingerprint(request) {
  const ip = request.ip || '';
  const ua = request.headers['user-agent'] || '';
  const lang = request.headers['accept-language'] || '';
  const enc = request.headers['accept-encoding'] || '';

  return digest16(`${ip}|${ua}|${lang}|${enc}`);
}

/**
 * 生成「设备指纹」（**与 IP 无关**，仅供观测/日志）
 *
 * 由纯请求头构成：UA + 语言 + 编码 + Client Hints。
 * 注意它天然会被大量同型号/同版本的浏览器共享，**不能用于封禁决策**。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {string} 16 位十六进制指纹
 */
function generateDeviceFingerprint(request) {
  const ua = request.headers['user-agent'] || '';
  const lang = request.headers['accept-language'] || '';
  const enc = request.headers['accept-encoding'] || '';
  const chUa = request.headers['sec-ch-ua'] || '';
  const chPlatform = request.headers['sec-ch-ua-platform'] || '';

  return digest16(`${ua}|${lang}|${enc}|${chUa}|${chPlatform}`);
}

export { generateFingerprint, generateDeviceFingerprint };
