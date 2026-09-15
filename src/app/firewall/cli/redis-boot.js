/**
 * firewall CLI 的 Redis 生命周期辅助
 *
 * 为什么需要它：`npm run cli` 只加载模型、不启动 Fastify app，框架的 redis 插件不会执行，
 * 模块级 `globalRedis` 恒为 null —— 而 `util/redis.js` 访问层依赖它（`getStore()` 会抛
 * `RedisRequiredError`）。这里用框架提供的 `connectStandalone()` 补齐连接，
 * 并在命令结束时释放：未关闭的 socket 会让一次性 CLI 进程挂住不退出。
 *
 * 语义选择：Redis 不可用时**明确拒绝**，而不是让访问层落到进程内内存表。
 * 访问层在 Redis 不可用时会自动降级为进程内内存实现，这对一次性 CLI 毫无意义
 * （写完即丢，却会打印「成功」），属于典型的静默失败。管理操作宁可报错。
 *
 * @author yijiu2025
 * @since 2026-09-15
 */
import { connectStandalone, disconnectStandalone } from '../../../framework/redis/index.js';
import { printWarning } from '../../../framework/cli/index.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.cli.redis-boot');

/**
 * 在已连接的 Redis 上执行一段操作，结束后自动释放连接
 *
 * @param {Function} fn 需要 Redis 的异步操作
 * @returns {Promise<any|undefined>} fn 的返回值；Redis 不可用时返回 undefined 并已打印告警
 */
async function withFirewallRedis(fn) {
  const { ready, reason } = await connectStandalone();
  if (!ready) {
    printWarning(`Redis 不可用（${reason}），在线封禁/白名单数据无法读取或写入`);
    return undefined;
  }

  try {
    return await fn();
  } finally {
    try {
      await disconnectStandalone();
    } catch (err) {
      log.warn('释放 Redis 连接失败', err);
    }
  }
}

export { withFirewallRedis };
