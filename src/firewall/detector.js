/**
 * 防火墙检测器
 * 包含速率限制、扫描器陷阱、暴力破解检测、地理位置分析和僵尸网络挑战等逻辑。
 */
import { getSecuritySettings } from './dao/dao.js';
import { safeRedis } from './utils/util.js';

import geoip from 'geoip-lite';

const activeConnections = new Map();
const memoryWindows = new Map();
const ipRequestTimestamps = new Map();
// 内存封禁 Map（Redis 不可用时使用），key=ip, value={ status, expiresAt, permanent, source }
const memoryBlocks = new Map();
// 内存白名单 Map（Redis 不可用时使用），key=ip, value={ expiresAt }
const memoryWhitelist = new Map();

let _cachedSettings = null;
let _cacheTime = 0;
const CONFIG_TTL = 30000;

function getConfig() {
  if (Date.now() - _cacheTime > CONFIG_TTL) {
    _cachedSettings = getSecuritySettings();
    _cacheTime = Date.now();
  }
  return _cachedSettings;
}

const KEY = {
  block: (id) => `fw:block:${id}`,
  rateLimit: (id) => `fw:rl:${id}`,
  trap: (ip) => `fw:trap:${ip}`,
  bruteIp: (ip) => `fw:brute:ip:${ip}`,
  bruteUser: (user) => `fw:brute:user:${user}`,
  accountLock: (user) => `fw:lock:${user}`,
  whitelist: (ip) => `fw:whitelist:${ip}`,
};

const HASH_BLOCKED = 'fw:blocked:ips';
const HASH_WHITELIST = 'fw:whitelisted:ips';

const LUA_INCR_WITH_EXPIRE = `
  local current = redis.call('incr', KEYS[1])
  if current == 1 then
    redis.call('expire', KEYS[1], ARGV[1])
  end
  return current
`;

// ============== 核心封禁操作函数 ==============

/**
 * 设置封禁（双写 fw:block:{ip} + fw:blocked:ips hash）
 * @param {object|null} redisClient Redis 客户端
 * @param {string} ip IP 地址
 * @param {object} metadata { status, source, permanent, createdAt, expiresAt }
 */
export async function setBlock(redisClient, ip, metadata) {
  const value = JSON.stringify(metadata);

  if (!redisClient) {
    memoryBlocks.set(ip, {
      status: metadata.status,
      source: metadata.source || 'auto',
      permanent: metadata.permanent || false,
      expiresAt: metadata.permanent ? Infinity : metadata.expiresAt,
    });
    return;
  }

  try {
    if (metadata.permanent) {
      await redisClient.set(KEY.block(ip), value);
    } else {
      const ttlSeconds = Math.max(1, Math.ceil((metadata.expiresAt - Date.now()) / 1000));
      await redisClient.set(KEY.block(ip), value, { EX: ttlSeconds });
    }
    await redisClient.hset(HASH_BLOCKED, ip, value);
  } catch (err) {
    console.error('[Firewall] setBlock Redis 失败，降级到内存:', err.message);
    memoryBlocks.set(ip, {
      status: metadata.status,
      source: metadata.source || 'auto',
      permanent: metadata.permanent || false,
      expiresAt: metadata.permanent ? Infinity : metadata.expiresAt,
    });
  }
}

/**
 * 移除封禁（删除 fw:block:{ip} + fw:blocked:ips hash entry）
 */
export async function removeBlock(redisClient, ip) {
  memoryBlocks.delete(ip);
  if (!redisClient) return;
  try {
    await redisClient.del(KEY.block(ip));
    await redisClient.hdel(HASH_BLOCKED, ip);
  } catch (err) {
    console.error('[Firewall] removeBlock Redis 失败:', err.message);
  }
}

/**
 * 设置白名单（双写 fw:whitelist:{ip} + fw:whitelisted:ips hash）
 */
export async function setWhitelist(redisClient, ip, durationSeconds) {
  const metadata = { expiresAt: Date.now() + durationSeconds * 1000 };
  const value = JSON.stringify(metadata);

  memoryWhitelist.set(ip, { expiresAt: metadata.expiresAt });

  if (!redisClient) return;
  try {
    await redisClient.set(KEY.whitelist(ip), '1', { EX: durationSeconds });
    await redisClient.hset(HASH_WHITELIST, ip, value);
  } catch (err) {
    console.error('[Firewall] setWhitelist Redis 失败:', err.message);
  }
}

/**
 * 移除白名单
 */
export async function removeWhitelist(redisClient, ip) {
  memoryWhitelist.delete(ip);
  if (!redisClient) return;
  try {
    await redisClient.del(KEY.whitelist(ip));
    await redisClient.hdel(HASH_WHITELIST, ip);
  } catch (err) {
    console.error('[Firewall] removeWhitelist Redis 失败:', err.message);
  }
}

/**
 * 获取所有活跃封禁列表
 */
export async function getActiveBlocks(redisClient) {
  const blockMap = new Map();

  // 从 Redis hash 读取
  if (redisClient) {
    try {
      const hashEntries = await redisClient.hgetall(HASH_BLOCKED);
      if (hashEntries) {
        for (const [ip, json] of Object.entries(hashEntries)) {
          try {
            const meta = JSON.parse(json);
            const remainingSeconds = meta.permanent
              ? null
              : Math.max(0, Math.ceil((meta.expiresAt - Date.now()) / 1000));
            // 跳过已过期的
            if (!meta.permanent && remainingSeconds <= 0) {
              await redisClient.hdel(HASH_BLOCKED, ip).catch(() => {});
              continue;
            }
            blockMap.set(ip, { ip, ...meta, remainingSeconds });
          } catch { /* skip malformed entries */ }
        }
      }
    } catch (err) {
      console.error('[Firewall] getActiveBlocks Redis 失败:', err.message);
    }
  }

  // 合并 memoryBlocks
  const now = Date.now();
  for (const [ip, meta] of memoryBlocks) {
    if (blockMap.has(ip)) continue;
    if (!meta.permanent && now > meta.expiresAt) continue;
    const remainingSeconds = meta.permanent
      ? null
      : Math.max(0, Math.ceil((meta.expiresAt - now) / 1000));
    blockMap.set(ip, { ip, ...meta, remainingSeconds });
  }

  return [...blockMap.values()].sort((a, b) => {
    if (a.permanent && !b.permanent) return 1;
    if (!a.permanent && b.permanent) return -1;
    return (a.remainingSeconds || Infinity) - (b.remainingSeconds || Infinity);
  });
}

/**
 * 获取所有活跃白名单列表
 */
export async function getActiveWhitelist(redisClient) {
  const wlMap = new Map();

  if (redisClient) {
    try {
      const hashEntries = await redisClient.hgetall(HASH_WHITELIST);
      if (hashEntries) {
        for (const [ip, json] of Object.entries(hashEntries)) {
          try {
            const meta = JSON.parse(json);
            const remainingSeconds = Math.max(0, Math.ceil((meta.expiresAt - Date.now()) / 1000));
            if (remainingSeconds <= 0) {
              await redisClient.hdel(HASH_WHITELIST, ip).catch(() => {});
              continue;
            }
            wlMap.set(ip, { ip, remainingSeconds });
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      console.error('[Firewall] getActiveWhitelist Redis 失败:', err.message);
    }
  }

  const now = Date.now();
  for (const [ip, meta] of memoryWhitelist) {
    if (wlMap.has(ip)) continue;
    if (now > meta.expiresAt) continue;
    wlMap.set(ip, { ip, remainingSeconds: Math.max(0, Math.ceil((meta.expiresAt - now) / 1000)) });
  }

  return [...wlMap.values()].sort((a, b) => a.remainingSeconds - b.remainingSeconds);
}

/**
 * 获取封禁状态（向后兼容旧格式字符串 + 新格式 JSON）
 * @returns {string|null} 旧格式返回 '1'|'SCANNER'|'CHALLENGE'，新格式返回 status 字段值
 */
async function getBlockStatus(redisClient, blockKey) {
  if (!redisClient) return null;
  try {
    const raw = await redisClient.get(blockKey);
    if (!raw) return null;
    // 新格式 JSON
    if (raw.startsWith('{')) {
      try {
        const meta = JSON.parse(raw);
        return meta.status || 'BLOCKED';
      } catch {
        return raw;
      }
    }
    // 旧格式字符串
    return raw;
  } catch {
    return null;
  }
}

function memorySlidingWindow(key, limit, windowSec) {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const start = now - windowMs;

  if (!memoryWindows.has(key)) memoryWindows.set(key, []);
  const timestamps = memoryWindows.get(key);

  while (timestamps.length && timestamps[0] < start) timestamps.shift();
  timestamps.push(now);

  return timestamps.length > limit;
}

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

  // 清理过期的内存封禁记录
  for (const [ip, block] of memoryBlocks) {
    if (!block.permanent && now > block.expiresAt) memoryBlocks.delete(ip);
  }

  // 清理过期的内存白名单记录
  for (const [ip, entry] of memoryWhitelist) {
    if (now > entry.expiresAt) memoryWhitelist.delete(ip);
  }
}, 60000);

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

/**
 * 全局封禁状态检查（检查白名单 → 检查封禁）
 */
export const checkGlobalBlock = async (redisClient, ip) => {
  // 1. 白名单优先：命中则直接放行
  if (redisClient) {
    try {
      const wl = await redisClient.get(KEY.whitelist(ip));
      if (wl) return; // 白名单命中，跳过所有封禁检查
    } catch { /* ignore */ }
  } else {
    const memWl = memoryWhitelist.get(ip);
    if (memWl && Date.now() <= memWl.expiresAt) return;
    if (memWl && Date.now() > memWl.expiresAt) memoryWhitelist.delete(ip);
  }

  const blockKey = KEY.block(ip);

  // 2. 内存封禁检查（Redis 不可用时的回退）
  if (!redisClient) {
    const memBlock = memoryBlocks.get(ip);
    if (memBlock) {
      if (!memBlock.permanent && Date.now() > memBlock.expiresAt) {
        memoryBlocks.delete(ip);
      } else {
        const ttl = memBlock.permanent
          ? 86400
          : Math.max(1, Math.ceil((memBlock.expiresAt - Date.now()) / 1000));
        const err = new Error(memBlock.status === 'SCANNER' ? 'Scanner blocked' : 'Access temporary denied');
        err.statusCode = memBlock.status === 'SCANNER' ? 403 : 429;
        err.headers = { 'Retry-After': String(ttl) };
        throw err;
      }
    }
    // 最终回退：检查 config 中的 manualBlacklistIps
    const settings = getConfig().defense;
    if (settings.manualBlacklistIps?.includes(ip)) {
      const err = new Error('Manually blocked');
      err.statusCode = 403;
      err.headers = { 'Retry-After': '86400' };
      throw err;
    }
    return;
  }

  // 3. Redis 封禁检查
  const status = await getBlockStatus(redisClient, blockKey);

  if (status) {
    // 检查是否为永久封禁（JSON 格式）
    let ttl = await safeRedis(redisClient, (r) => r.ttl(blockKey)) || 60;
    // TTL = -1 表示无过期（永久封禁）
    if (ttl === -1) ttl = 86400;
    const err = new Error(status === 'SCANNER' ? 'Scanner blocked' : 'Access temporary denied');
    err.statusCode = status === 'SCANNER' ? 403 : 429;
    err.headers = { 'Retry-After': String(ttl) };
    throw err;
  }
};

/**
 * 检测 404/403 扫描陷阱
 */
export const checkNotFoundTrap = async (redisClient, ip, url, statusCode) => {
  const settings = getConfig().defense;
  if (!settings.enableAutoBlacklist) return;

  const safePaths = settings.safePaths || ['/health', '/favicon.ico', '/robots.txt', '/__fw/', '/api/firewall/'];
  if (safePaths.some(p => url.startsWith(p))) return;
  if (![404, 403, 405].includes(statusCode)) return;

  const blockKey = KEY.block(ip);

  if (await getBlockStatus(redisClient, blockKey)) return;

  const limit = settings.maxNotFoundAttempts || 15;
  const window = settings.notFoundWindow || 60;
  const duration = settings.blacklistDuration || 3600;

  if (!redisClient) {
    const memBlock = memoryBlocks.get(ip);
    if (memBlock && !memBlock.permanent && Date.now() <= memBlock.expiresAt) return;
    if (memBlock && !memBlock.permanent && Date.now() > memBlock.expiresAt) memoryBlocks.delete(ip);

    const blocked = memorySlidingWindow(`trap:${ip}`, limit, window);
    if (blocked) {
      await setBlock(null, ip, {
        status: 'SCANNER', source: 'auto', permanent: false,
        createdAt: Date.now(), expiresAt: Date.now() + duration * 1000,
      });
      console.warn(`[Firewall] Scanner detected (mem): ${ip}, blocked ${duration}s`);
      const err = new Error('Scanner detected (memory fallback)');
      err.statusCode = 403;
      err.rule = 'scanner-trap';
      throw err;
    }
    return;
  }

  const trapKey = KEY.trap(ip);
  const count = await redisClient.eval(LUA_INCR_WITH_EXPIRE, 1, trapKey, window);

  if (count >= limit) {
    await setBlock(redisClient, ip, {
      status: 'SCANNER', source: 'auto', permanent: false,
      createdAt: Date.now(), expiresAt: Date.now() + duration * 1000,
    });
    await redisClient.del(trapKey);
    console.warn(`[Firewall] Scanner detected: ${ip}, blocked ${duration}s`);

    const err = new Error('Scanner detected');
    err.statusCode = 403;
    err.rule = 'scanner-trap';
    throw err;
  }
};

/**
 * 登录暴力破解检测
 */
export const checkLoginBruteForce = async (redisClient, ip, username, success) => {
  const settings = getConfig().defense;
  if (!settings.enableBruteForce) return;

  const bruteLimit = settings.bruteLimit || 5;
  const bruteWindow = settings.bruteWindow || 300;
  const accountLockTime = settings.accountLockTime || 900;
  const ipBlockTime = settings.ipBlockTime || 600;
  const ipLimit = settings.bruteIpLimit || 10;

  if (success) {
    await safeRedis(redisClient, async (r) => {
      const pipeline = r.pipeline();
      pipeline.del(KEY.bruteIp(ip));
      if (username) pipeline.del(KEY.bruteUser(username));
      await pipeline.exec();
    });
    return;
  }

  const blockKey = KEY.block(ip);
  if (await getBlockStatus(redisClient, blockKey)) return;

  if (!redisClient) {
    let blocked = false;
    if (memorySlidingWindow(`brute:ip:${ip}`, ipLimit, bruteWindow)) {
      console.warn(`[Firewall] Brute force IP (mem): ${ip}`);
      blocked = true;
    }
    if (username && memorySlidingWindow(`brute:user:${username}`, bruteLimit, bruteWindow)) {
      console.warn(`[Firewall] Brute force account (mem): ${username}`);
      blocked = true;
    }
    if (blocked) {
      const err = new Error('Brute force detected (memory fallback)');
      err.statusCode = 429;
      err.isChallenge = true;
      throw err;
    }
    return;
  }

  const [ipCount, userCount] = await Promise.all([
    redisClient.eval(LUA_INCR_WITH_EXPIRE, 1, KEY.bruteIp(ip), bruteWindow),
    username ? redisClient.eval(LUA_INCR_WITH_EXPIRE, 1, KEY.bruteUser(username), bruteWindow) : 0
  ]);

  const now = Date.now();

  if (ipCount >= ipLimit) {
    await setBlock(redisClient, ip, {
      status: 'CHALLENGE', source: 'auto', permanent: false,
      createdAt: now, expiresAt: now + ipBlockTime * 1000,
    });
    console.warn(`[Firewall] Brute force(IP): ${ip} failed ${ipCount}x, challenge ${ipBlockTime}s`);
    return;
  }

  if (username && userCount >= bruteLimit) {
    await redisClient.set(KEY.accountLock(username), '1', { EX: accountLockTime });
    await setBlock(redisClient, ip, {
      status: 'CHALLENGE', source: 'auto', permanent: false,
      createdAt: now, expiresAt: now + ipBlockTime * 1000,
    });
    console.warn(
      `[Firewall] Brute force(Account): ${username} failed ${userCount}x, ` +
      `locked ${accountLockTime}s, IP ${ip} challenge ${ipBlockTime}s`
    );
  }
};

export const isAccountLocked = async (redisClient, username) => {
  if (!redisClient || !username) return false;
  try {
    return !!(await redisClient.get(KEY.accountLock(username)));
  } catch {
    return false;
  }
};

/**
 * 追踪当前活跃连接数
 */
export const trackConnection = (ip, delta) => {
  const settings = getConfig().defense;
  const maxConn = settings.maxConn || settings.maxConnections || 100;

  const current = (activeConnections.get(ip) || 0) + delta;

  if (current <= 0) {
    activeConnections.delete(ip);
    return 0;
  }

  activeConnections.set(ip, current);

  if (delta > 0 && current > maxConn) {
    const err = new Error(`Connection limit exceeded: ${current}/${maxConn}`);
    err.statusCode = 429;
    err.rule = 'connection-limit';
    throw err;
  }

  return current;
};

export function getConnectionStats() {
  const sorted = [...activeConnections.entries()].sort((a, b) => b[1] - a[1]);
  return {
    totalIPs: activeConnections.size,
    totalConnections: sorted.reduce((sum, [, c]) => sum + c, 0),
    topIPs: sorted.slice(0, 10).map(([ip, count]) => ({ ip, count })),
  };
}

export function cleanupStaleConnections() {
  const settings = getConfig().defense;
  const limit = (settings.maxConn || settings.maxConnections || 100) * 2;
  for (const [ip, count] of activeConnections) {
    if (count > limit) {
      console.warn(`[Firewall] Cleanup zombie: ${ip} (count=${count})`);
      activeConnections.delete(ip);
    }
  }
}

/**
 * 基于地理位置和网络类型的信誉检查
 */
export const checkGeoReputation = async (redisClient, ip, url) => {
  const settings = getConfig().defense;

  const internalPrefixes = settings.internalIpPrefixes || ['127.', '10.', '192.168.', '::1'];
  if (internalPrefixes.some(p => ip.startsWith(p))) return;

  const geo = geoip.lookup(ip);
  const isOverseas = geo && geo.country !== 'CN';

  const idcPrefixes = settings.idcIpPrefixes || ['100.104.', '47.88.', '162.14.'];
  const isIDC = idcPrefixes.some(p => ip.startsWith(p));

  const geoRules = settings.geoRules || { sensitivePaths: [], internalPrefixes: [] };

  if (isIDC) {
    await checkRateLimit(redisClient, `IDC:${ip}`, {
      limit: settings.idcLimit || 60,
      window: 60,
      blockTime: 3600,
    });
  }

  const isInternal = geoRules.internalPrefixes.some(p => url.startsWith(p));
  if (isOverseas && isInternal) {
    await checkRateLimit(redisClient, `OVERSEAS:${ip}`, {
      limit: geoRules.overseasInternalLimit || 30,
      window: 60,
      blockTime: 1800,
    });
  }

  const isSensitive = geoRules.sensitivePaths.some(p => url.includes(p));
  if (isOverseas && isSensitive) {
    await checkRateLimit(redisClient, `OVERSEAS_SENS:${ip}`, {
      limit: geoRules.overseasLimit || 10,
      window: geoRules.overseasWindow || 60,
      blockTime: geoRules.overseasBlockTime || 3600,
    });
  }
};

/**
 * 僵尸网络/机器人挑战检查
 */
export const checkBotChallenge = async (redisClient, ip, ua, requestCount) => {
  const settings = getConfig().defense;
  const botPatterns = (settings.botPatterns || []).map(p => new RegExp(p, 'i'));
  const browserPatterns = (settings.browserPatterns || []).map(p => new RegExp(p, 'i'));
  const now = Date.now();

  if (!ua) {
    if (requestCount > (settings.botChallengeNoUaLimit || 10)) {
      await setBlock(redisClient, ip, {
        status: 'CHALLENGE', source: 'auto', permanent: false,
        createdAt: now, expiresAt: now + 1800 * 1000,
      });
      return true;
    }
    return false;
  }

  const isBotUA = botPatterns.some((p) => p.test(ua));
  const isBrowserUA = browserPatterns.some((p) => p.test(ua));

  if (isBotUA && requestCount > (settings.botChallengeBotLimit || 30)) {
    await setBlock(redisClient, ip, {
      status: 'CHALLENGE', source: 'auto', permanent: false,
      createdAt: now, expiresAt: now + 1800 * 1000,
    });
    return true;
  }

  if (isBrowserUA && requestCount > (settings.botChallengeBrowserLimit || 120)) {
    await setBlock(redisClient, ip, {
      status: 'CHALLENGE', source: 'auto', permanent: false,
      createdAt: now, expiresAt: now + 1800 * 1000,
    });
    return true;
  }

  return false;
};

/**
 * 将 IP 解析为地理位置信息
 */
export function resolveGeoInfo(ip) {
  if (!ip) return { region: '未知', city: '未知' };

  const internalPrefixes = ['127.', '10.', '192.168.', '::1', '172.'];
  if (internalPrefixes.some(p => ip.startsWith(p))) {
    return { region: '内部网络', city: '局域网' };
  }

  try {
    const geo = geoip.lookup(ip);
    if (geo) {
      return {
        region: geo.region || geo.country || '未知',
        city: geo.city || '未知'
      };
    }
  } catch (err) {
    console.error('[Firewall] GeoIP 解析异常:', err.message);
  }

  return { region: '未知', city: '未知' };
}
