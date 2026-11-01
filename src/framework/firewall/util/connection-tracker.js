/**
 * 并发连接追踪模块
 *
 * 追踪每个 IP 的并发连接数：请求进入时 +1，响应完成时 -1，超过限制时拒绝请求。
 * 同时提供统计查询和僵尸连接清理能力。
 *
 * ── 部署语义（必须知道，否则会误判保护强度）──
 * 计数保存在**进程内**（`shared.js` 的 activeConnections）。这意味着：
 *   实际放行上限 = 配置的 maxConn × 实例数
 * 配置写的是 100，跑 3 个实例时全集群实际放行 300。
 *
 * 这是**已知取舍而非缺陷**：把计数改到 Redis 需要每请求增加一次往返，
 * 而本模块处于请求热路径上。若部署形态变化（例如实例数 > 3），
 * 应当按 `maxConn ÷ 实例数` 配值，或把限制前移到边缘（Nginx / ALB 的连接限制）。
 * 两条路都比"以为配置 100 就是 100"要诚实。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-19 清理判据由「计数阈值」改为「最后活跃时间」，修复泄漏计数永不回收
 */
import { getConfig, activeConnections } from './shared.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.util.connection-tracker');

/**
 * 记录过期阈值（毫秒）：超过这么久没有再活跃，即视为泄漏残留并回收。
 *
 * ⚠️ 必须**大于单请求的最长生命周期**。上游 `requestTimeout` 默认 300s，
 * 若本阈值小于它，一个正常的长请求（大文件上传）的 +1 记录会在请求还没结束
 * 时被回收，其随后的 -1 就变成"减一个不存在的记录"，计数失真。
 * 取 10 分钟 = 2 × requestTimeout(300s)，并恰好是清理周期的 2 倍。
 */
const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * 追踪 IP 的当前并发连接数
 * 在请求进入时 delta=+1，响应完成时 delta=-1。
 * 超过最大连接数限制时抛出 429 异常。
 *
 * @param {string} ip 客户端 IP 地址
 * @param {number} delta 连接数变化量（+1 表示新连接，-1 表示连接关闭）
 * @returns {number} 该 IP 当前的并发连接数
 * @throws {Error} 超过连接数限制时抛出，statusCode=429，rule='connection-limit'
 */
const trackConnection = (ip, delta) => {
  const settings = getConfig().defense;

  // 并发连接限制开关：此前没有任何读取点，运维关掉「并发连接限制」后限制照旧生效。
  if (!settings.enableConnLimit) return 0;

  const maxConn = settings.maxConn || settings.maxConnections || 100;

  const entry = activeConnections.get(ip);
  const current = (entry ? entry.count : 0) + delta;

  // 连接数归零或为负时清理记录
  if (current <= 0) {
    activeConnections.delete(ip);
    return 0;
  }

  // 记录**最后活跃时间**：清理判据必须用它而不是计数阈值。
  // 原实现只在 count > maxConn*2 时才回收，而真实泄漏往往只多 1~2 个计数
  // （异常路径没走到 onSend），永远到不了阈值 —— 那条记录会永久占着该 IP 的配额。
  activeConnections.set(ip, { count: current, lastAt: Date.now() });

  // 仅在新连接建立时检查超限（delta > 0），避免关闭连接时误触发
  if (delta > 0 && current > maxConn) {
    const err = new Error(`Connection limit exceeded: ${current}/${maxConn}`);
    err.statusCode = 429;
    err.rule = 'connection-limit';
    throw err;
  }

  return current;
};

/**
 * 获取连接统计摘要
 * 用于监控面板展示当前并发连接分布情况。
 *
 * @returns {object} 统计信息
 * @returns {number} return.totalIPs 活跃 IP 数量
 * @returns {number} return.totalConnections 总并发连接数
 * @returns {Array<{ip: string, count: number}>} return.topIPs 连接数最多的前 10 个 IP
 */
function getConnectionStats() {
  const sorted = [...activeConnections.entries()].sort((a, b) => b[1].count - a[1].count);
  return {
    totalIPs: activeConnections.size,
    totalConnections: sorted.reduce((sum, [, entry]) => sum + entry.count, 0),
    topIPs: sorted.slice(0, 10).map(([ip, entry]) => ({ ip, count: entry.count }))
  };
}

/**
 * 清理僵尸连接记录
 *
 * 判据是「最后活跃时间」而非「计数阈值」：任何超过 STALE_AFTER_MS 没有再活跃的记录
 * 一律回收，**与残留计数多少无关**。这样即使只泄漏 1 个计数也能被收回，
 * 不会像原先那样永久占用该 IP 的配额。
 *
 * @returns {number} 本次回收的记录数
 */
function cleanupStaleConnections() {
  const now = Date.now();
  let cleaned = 0;
  for (const [ip, entry] of activeConnections) {
    if (now - entry.lastAt > STALE_AFTER_MS) {
      log.warn(
        `[Firewall] 回收僵尸连接记录: ${ip} (残留计数=${entry.count}, 静默 ${Math.round((now - entry.lastAt) / 1000)}s)`
      );
      activeConnections.delete(ip);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * 启动僵尸连接清理定时任务
 * 每 5 分钟执行一次清理，服务关闭时自动停止。
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
function startCleanupTask(app) {
  const timer = setInterval(() => cleanupStaleConnections(), 5 * 60 * 1000);
  app.addHook('onClose', async () => clearInterval(timer));
}

export { trackConnection, getConnectionStats, cleanupStaleConnections, startCleanupTask };
