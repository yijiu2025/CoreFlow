/**
 * Redis 调优配置 —— **可选的静态覆盖层**
 *
 * ⚠️ 本文件可以整个删掉，服务照常用 core 保底值启动。
 * 这里只写**你想改的键**，未写的键走 core 默认值（src/framework/redis/plugin.js）。
 *
 * 连接信息仍走 env（每部署必配）：
 *   REDIS_ENABLED / REDIS_HOST / REDIS_PORT / REDIS_DB / REDIS_USERNAME /
 *   REDIS_PASSWORD / REDIS_TLS / REDIS_TLS_CA / REDIS_TLS_SKIP_VERIFY /
 *   REDIS_BACKUP_HOST / REDIS_BACKUP_PORT
 *
 * 可用键（本文件）：
 *   connectTimeoutMs   建连超时（毫秒，默认 5000）
 *   maxRetries         重连最大次数（默认 10）；超限后按 FOREVER 策略转 30s 低频探测
 *   commandTimeoutMs   单条命令超时（毫秒，默认 0 = 不设超时，等同 node-redis v5 语义）
 *                      ⚠️ 本项目有大 key 遍历、长 Lua 脚本，开超时要确认不会误杀
 *
 * 示例：
 *   const REDIS_CONFIG = { connectTimeoutMs: 10_000, maxRetries: 20 };
 */
const REDIS_CONFIG = {};

export { REDIS_CONFIG };
