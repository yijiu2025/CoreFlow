/**
 * 登录暴力破解检测
 * 账号维度 + IP 维度双重防护，触发后锁定账号并挑战 IP
 */
import { safeRedis } from '../../../redis/safe-redis.js';
import { getConfig, KEY, LUA_INCR_WITH_EXPIRE, memorySlidingWindow, getBlockStatus } from '../../util/shared.js';
import { setBlock } from '../dao/block-manager.js';

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
