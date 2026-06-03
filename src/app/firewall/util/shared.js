/**
 * 共享状态与工具函数
 * 各检测模块共用的内存 Map、Redis Key 前缀、Lua 脚本、配置缓存
 */
import { getSecuritySettings } from '../dao/dao.js';

// ============== 内存状态 ==============

export const activeConnections = new Map();
export const memoryWindows = new Map();
export const ipRequestTimestamps = new Map();
export const memoryBlocks = new Map();
export const memoryWhitelist = new Map();
export const memoryBlocksFp = new Map();
export const memoryWhitelistFp = new Map();

// ============== 配置缓存 ==============

let _cachedSettings = null;
let _cacheTime = 0;
const CONFIG_TTL = 30000;

export function getConfig() {
  if (Date.now() - _cacheTime > CONFIG_TTL) {
    _cachedSettings = getSecuritySettings();
    _cacheTime = Date.now();
  }
  return _cachedSettings;
}

// ============== Redis Key 前缀 ==============

export const KEY = {
  block: (id) => `fw:block:${id}`,
  rateLimit: (id) => `fw:rl:${id}`,
  trap: (ip) => `fw:trap:${ip}`,
  bruteIp: (ip) => `fw:brute:ip:${ip}`,
  bruteUser: (user) => `fw:brute:user:${user}`,
  accountLock: (user) => `fw:lock:${user}`,
  whitelist: (ip) => `fw:whitelist:${ip}`,
  blockFp: (fp) => `fw:block:fp:${fp}`,
  whitelistFp: (fp) => `fw:whitelist:fp:${fp}`,
};

export const HASH_BLOCKED = 'fw:blocked:ips';
export const HASH_WHITELIST = 'fw:whitelisted:ips';
export const HASH_BLOCKED_FP = 'fw:blocked:fps';
export const HASH_WHITELIST_FP = 'fw:whitelisted:fps';

export const LUA_INCR_WITH_EXPIRE = `
  local current = redis.call('incr', KEYS[1])
  if current == 1 then
    redis.call('expire', KEYS[1], ARGV[1])
  end
  return current
`;

// ============== 内存滑动窗口 ==============

export function memorySlidingWindow(key, limit, windowSec) {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const start = now - windowMs;

  if (!memoryWindows.has(key)) memoryWindows.set(key, []);
  const timestamps = memoryWindows.get(key);

  while (timestamps.length && timestamps[0] < start) timestamps.shift();
  timestamps.push(now);

  return timestamps.length > limit;
}

// ============== 封禁状态查询 ==============

/**
 * 获取封禁状态（兼容旧格式字符串 + 新格式 JSON）
 */
export async function getBlockStatus(redisClient, blockKey) {
  if (!redisClient) return null;
  try {
    const raw = await redisClient.get(blockKey);
    if (!raw) return null;
    if (raw.startsWith('{')) {
      try {
        const meta = JSON.parse(raw);
        return meta.status || 'BLOCKED';
      } catch {
        return raw;
      }
    }
    return raw;
  } catch {
    return null;
  }
}

// ============== 定时清理 ==============

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of memoryWindows) {
    const filtered = timestamps.filter(t => now - t < 300000);
    if (filtered.length === 0) memoryWindows.delete(key);
    else memoryWindows.set(key, filtered);
  }

  for (const [ip, timestamps] of ipRequestTimestamps) {
    while (timestamps.length && timestamps[0] < now - 60_000) {
      timestamps.shift();
    }
    if (timestamps.length === 0) {
      ipRequestTimestamps.delete(ip);
    }
  }

  for (const [ip, block] of memoryBlocks) {
    if (!block.permanent && now > block.expiresAt) memoryBlocks.delete(ip);
  }
  for (const [fp, block] of memoryBlocksFp) {
    if (!block.permanent && now > block.expiresAt) memoryBlocksFp.delete(fp);
  }

  for (const [ip, entry] of memoryWhitelist) {
    if (now > entry.expiresAt) memoryWhitelist.delete(ip);
  }
  for (const [fp, entry] of memoryWhitelistFp) {
    if (now > entry.expiresAt) memoryWhitelistFp.delete(fp);
  }
}, 60000);
