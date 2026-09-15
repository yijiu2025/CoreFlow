/**
 * 404/403 扫描陷阱检测
 * 短时间内大量访问不存在的路径 → 判定为扫描器 → 自动封禁
 *
 * 优化点：旧实现用 `eval(script, 1, key, window)`（node-redis v5 要求 `{ keys, arguments }`），
 * 真实 Redis 上必然抛错 —— 扫描陷阱计数**从未生效过**（每次 404 只留一条 WARN 日志）。
 * 现在统一走访问层 `bumpCounter`（单 Lua 原子 INCR+EXPIRE），并顺带把阈值判定统一为 `>=`，
 * 与 Redis 分支的旧语义对齐（内存分支过去是 `> limit`，比 Redis 分支宽松一次）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getConfig } from '../../util/shared.js';
import { readAccessState, bumpCounter, removeKeys, rel } from '../../util/redis.js';
import { setBlock } from '../dao/block-manager.js';
import { notifyAttack } from '../auto-responder.js';
import { createLogger } from '../../../../framework/log/index.js';

const log = createLogger('app.firewall.engine.detectors.scan-trap');

/**
 * 检测 404/403 扫描陷阱
 *
 * @param {string} ip 客户端 IP
 * @param {string} url 请求路径
 * @param {number} statusCode 响应状态码
 * @returns {Promise<void>}
 * @throws {Error} 命中陷阱时抛出（statusCode 403，rule='scanner-trap'）
 */
const checkNotFoundTrap = async (ip, url, statusCode) => {
  const settings = getConfig().defense;
  if (!settings.enableAutoBlacklist) return;

  const safePaths = settings.safePaths || ['/health', '/favicon.ico', '/robots.txt', '/__fw/', '/api/firewall/'];
  if (safePaths.some(p => url.startsWith(p))) return;
  if (![404, 403, 405].includes(statusCode)) return;

  // 已封禁则不再累计
  const state = await readAccessState({ ip, fingerprint: null });
  if (state.ipBlock || state.fpBlock) return;

  const limit = settings.maxNotFoundAttempts || 15;
  const window = settings.notFoundWindow || 60;
  const duration = settings.blacklistDuration || 3600;

  const trapKey = rel.trap(ip);
  const count = await bumpCounter(trapKey, window);

  if (count >= limit) {
    await setBlock(ip, {
      status: 'SCANNER',
      source: 'auto',
      permanent: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + duration * 1000
    });
    // 封禁后清掉陷阱计数，避免解封后立即再次触发
    await removeKeys([trapKey]);
    log.warn(`[Firewall] Scanner detected: ${ip}, blocked ${duration}s`);

    // 旁路告警（未配置 email/webhook 时是空操作，不影响主流程）
    await notifyAttack(ip, 'scan', { url, statusCode, count, blockedSeconds: duration });

    const err = new Error('Scanner detected');
    err.statusCode = 403;
    err.rule = 'scanner-trap';
    throw err;
  }
};

export { checkNotFoundTrap };
