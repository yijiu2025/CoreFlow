/**
 * 速率限制检测
 * 基于 Redis 滑动窗口的 IP 限频，Redis 不可用时降级到内存
 */
import { safeRedis } from '../../../redis/safe-redis.js';
import { getConfig, KEY, memorySlidingWindow, ipRequestTimestamps, getBlockStatus } from '../../util/shared.js';
import { setBlock } from '../dao/block-manager.js';

/**
 * 追踪 IP 请求次数（基于内存滑动窗口）
 */
export function trackRequestCount(ip) {
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
 */
export const checkRateLimit = async (redisClient, actorId, options = {}) => {
  const {
    limit = 50,
    window = 60,
    blockTime = 60,
    retryAfter = 60,
  } = options;

  const settings = getConfig().defense;
  if (!settings.enableRateLimit) return true;

  const blockKey = KEY.block(actorId);
  const blockStatus = await getBlockStatus(redisClient, blockKey);

  if (blockStatus) {
    const ttl = await safeRedis(redisClient, (r) => r.ttl(blockKey)) || retryAfter;

    if (blockStatus === 'CHALLENGE') {
      const err = new Error('Challenge required');
      err.statusCode = 200;
      err.isChallenge = true;
      throw err;
    }

    const err = new Error(`Blocked, retry in ${ttl}s`);
    err.statusCode = blockStatus === 'SCANNER' ? 403 : 429;
    err.headers = { 'Retry-After': String(ttl) };
    throw err;
  }

  if (!redisClient) {
    if (memorySlidingWindow(actorId, limit, window)) {
      const err = new Error('Rate limit exceeded (memory fallback)');
      err.statusCode = 429;
      err.headers = { 'Retry-After': String(retryAfter) };
      throw err;
    }
    return true;
  }

  const now = Date.now();
  const windowMs = window * 1000;
  const windowStart = now - windowMs;
  const rlKey = KEY.rateLimit(actorId);
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  const pipeline = redisClient.pipeline();
  pipeline.zadd(rlKey, now, member);
  pipeline.zremrangebyscore(rlKey, 0, windowStart);
  pipeline.zcard(rlKey);
  pipeline.pexpire(rlKey, windowMs + 5000);

  const results = await pipeline.exec();

  if (!results || results.some(([err]) => err)) {
    console.error('[Firewall] Redis pipeline 失败，降级放行');
    return true;
  }

  const count = results[2][1];

  if (count > limit) {
    await setBlock(redisClient, actorId, {
      status: 'BLOCKED', source: 'auto', permanent: false,
      createdAt: now, expiresAt: now + blockTime * 1000,
    });
    const err = new Error(`Too Many Requests. Blocked for ${blockTime}s`);
    err.statusCode = 429;
    err.headers = { 'Retry-After': String(blockTime) };
    throw err;
  }

  return true;
};
