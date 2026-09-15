/**
 * 速率限制检测
 *
 * 端点级滑动窗口限频：窗口内请求数超阈值即封禁 actor（通常是 `路径:IP`）。
 * Redis 不可用时，访问层会自动切换到等价的内存滑窗实现，本模块无需分支。
 *
 * 优化点（旧实现在这里踩了两个坑）：
 *   1. `redisClient.pipeline()` 是 ioredis 的 API，node-redis 只有 `multi()` ——
 *      该调用会直接抛 TypeError，被上层 catch 后所有命中规则的请求都回 429，
 *      且错误信息是「redisClient.pipeline is not a function」。
 *   2. zadd/zremrangebyscore/zcard/pexpire 四条命令拆成 pipeline 下发（4 次往返），
 *      且「先计数后写入」在并发下会让窗口计数漂移。
 * 现在统一为**一次 Lua**：清理窗口外成员 + 记录本次 + 计数 + 续期，原子且只 1 次往返。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getConfig, ipRequestTimestamps } from '../../util/shared.js';
import { readAccessState, consumeRateWindow, rel } from '../../util/redis.js';
import { setBlock } from '../dao/block-manager.js';

/**
 * 追踪 IP 请求次数（基于内存滑动窗口，供 Bot 检测的「短时高频」判断使用）
 *
 * @param {string} ip 客户端 IP
 * @returns {number} 60 秒窗口内的请求数（含本次）
 */
function trackRequestCount(ip) {
  const now = Date.now();
  const windowMs = 60_000;

  if (!ipRequestTimestamps.has(ip)) {
    ipRequestTimestamps.set(ip, []);
  }

  const timestamps = ipRequestTimestamps.get(ip);
  while (timestamps.length && timestamps[0] < now - windowMs) {
    timestamps.shift();
  }

  timestamps.push(now);
  return timestamps.length;
}

/**
 * 核心速率限制检查
 *
 * @param {string} actorId 限频主体（如 `/api/order:1.2.3.4`）
 * @param {object} [options] 限频参数
 * @param {number} [options.limit=50] 窗口内允许的请求数
 * @param {number} [options.window=60] 窗口秒数
 * @param {number} [options.blockTime=60] 触发后的封禁秒数
 * @param {number} [options.retryAfter=60] 缺少 TTL 时的 Retry-After 兜底值
 * @returns {Promise<true>} 放行（未超限）
 * @throws {Error} 超限或已封禁：statusCode 429/403，挑战为 200 + isChallenge
 */
const checkRateLimit = async (actorId, options = {}) => {
  const { limit = 50, window = 60, blockTime = 60, retryAfter = 60 } = options;

  const settings = getConfig().defense;
  if (!settings.enableRateLimit) return true;

  // 已封禁 / 挑战状态：一次往返取回状态 + 剩余 TTL
  const state = await readAccessState({ ip: actorId, fingerprint: null });
  const blocked = state.ipBlock || state.fpBlock;

  if (blocked) {
    const ttl = blocked.ttlSec || retryAfter;

    if (blocked.status === 'CHALLENGE') {
      const err = new Error('Challenge required');
      err.statusCode = 200;
      err.isChallenge = true;
      throw err;
    }

    const err = new Error(`Blocked, retry in ${ttl}s`);
    err.statusCode = blocked.status === 'SCANNER' ? 403 : 429;
    err.headers = { 'Retry-After': String(ttl) };
    throw err;
  }

  // 滑窗计数（Redis 单次 Lua / 内存滑窗，语义一致）
  const count = await consumeRateWindow(rel.rateLimit(actorId), window * 1000);

  if (count > limit) {
    await setBlock(actorId, {
      status: 'BLOCKED',
      source: 'auto',
      permanent: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + blockTime * 1000
    });
    const err = new Error(`Too Many Requests. Blocked for ${blockTime}s`);
    err.statusCode = 429;
    err.headers = { 'Retry-After': String(blockTime) };
    throw err;
  }

  return true;
};

export { trackRequestCount, checkRateLimit };
