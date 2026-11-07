/**
 * 数据库连接池配置 —— **可选的静态覆盖层**
 *
 * ⚠️ 本文件可以整个删掉，服务照常用 core 保底值启动。
 * 这里只写**你想改的键**，未写的键走 core 默认值（src/framework/persistence/db/index.js）。
 *
 * 连接信息（DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASS）仍走 env ——
 * 那是每部署必配的凭据与拓扑，不属于调优项。
 *
 * 可用键：
 *   pool.max      每实例最大连接数（默认 10）
 *                 ⚠️ 容量天花板是**每实例**的：MySQL max_connections 默认 151，
 *                 按 10 算约 15 个实例就耗尽。扩容公式：
 *                 max ≈ (MySQL_max_connections − 运维保留) ÷ 预期实例数
 *   pool.min      最小保持连接数（默认 2）
 *   pool.acquire  等不到连接就放弃的上限（毫秒，默认 30000）
 *                 注意它远大于健康探针 3s 超时 —— 池枯竭时表现为"探针不稳定"
 *   pool.idle     连接空闲多久被释放（毫秒，默认 10000）
 *
 * 示例：
 *   const DB_CONFIG = { pool: { max: 30, min: 5 } };
 */
const DB_CONFIG = {};

export { DB_CONFIG };
