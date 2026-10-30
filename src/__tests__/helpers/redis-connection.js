/**
 * 测试用 Redis 连接引导
 *
 * 背景：`isRedisConfigured()` 只看**环境变量**（`REDIS_ENABLED` + `REDIS_HOST`），
 * 不看有没有真的连上。而真正建立连接的只有两处：Fastify 插件（`app` 启动时）
 * 与 `connectStandalone()`（CLI / 脚本用）。单元测试两处都不跑 ——
 *
 *   - 本地：环境变量没设 ⇒ 相关套件走 `describe.skip`，一切正常；
 *   - CI：装了 redis service 并设了 `REDIS_ENABLED=true` ⇒ 套件**不再跳过**，
 *     但 `globalRedis` 仍是 null，`getStore()` 一路抛 `RedisRequiredError(503)`。
 *
 * 2026-10-30 之前就是这样：CI 上 lock-store / stream-store / auth-contract /
 * redis-operations 四个套件齐红，错误信息看起来像"代码坏了"，实际是测试
 * 从没建立过连接 —— 换句话说，这些套件在 CI 上**一次都没真正验证过 Redis 行为**。
 *
 * 用法（调用方必须先按 `isRedisConfigured()` 决定是否跳过，本模块只在
 * "确实配置了"时才有意义）：
 *
 *   beforeAll(async () => {
 *     await connectTestRedis();
 *   });
 *   afterAll(async () => {
 *     await disconnectTestRedis();
 *   });
 *
 * 连接失败**直接抛错**而不是静默跳过：CI 里"配了却连不上"必须是一条红色失败，
 * 否则又是一次"报告里多了个跳过、没人看见"。
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { connectStandalone, disconnectStandalone } from '../../framework/redis/plugin.js';
import { isRedisConfigured } from '../../framework/redis/utils.js';

/** 默认连接预算与原关卡/CI 守卫保持一致 */
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * 为当前测试文件建立主 Redis 连接（幂等：已连上就直接返回）
 *
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=8000] 连接上限（毫秒）
 * @returns {Promise<void>}
 * @throws {Error} 未配置 Redis，或配置了但连不上
 */
async function connectTestRedis(opts = {}) {
  if (!isRedisConfigured()) {
    throw new Error(
      '[test] Redis 未配置（需要 REDIS_ENABLED=true 且 REDIS_HOST），' +
        '调用方应先用 isRedisConfigured() 决定是否跳过本套件'
    );
  }

  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const conn = await connectStandalone({ timeoutMs });
  if (!conn.ready) {
    throw new Error(`[test] Redis 连接失败：${conn.reason ?? conn.code ?? '未知原因'}`);
  }
}

/**
 * 关闭由 `connectTestRedis()` 建立的连接
 *
 * 必须调用：未关闭的 socket 会让 jest worker 挂住不退出（表现为"测试跑完了但不结束"）。
 *
 * @returns {Promise<void>}
 */
async function disconnectTestRedis() {
  try {
    await disconnectStandalone();
  } catch {
    /* 本来就没连上时忽略 */
  }
}

export { connectTestRedis, disconnectTestRedis };
