/**
 * 404/403 扫描陷阱检测
 * 短时间内大量访问不存在的路径 → 判定为扫描器 → 自动封禁
 */
import { getConfig, KEY, LUA_INCR_WITH_EXPIRE, memorySlidingWindow, memoryBlocks, getBlockStatus } from '../../util/shared.js';
import { setBlock } from '../dao/block-manager.js';

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
