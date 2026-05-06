/**
 * 并发连接追踪模块
 *
 * 基于内存 Map 追踪每个 IP 的并发连接数。
 * 请求进入时 +1，响应完成时 -1，超过限制时拒绝请求。
 * 同时提供统计查询和僵尸连接清理能力。
 */
import { getConfig, activeConnections } from './shared.js';

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
export const trackConnection = (ip, delta) => {
  const settings = getConfig().defense;
  const maxConn = settings.maxConn || settings.maxConnections || 100;

  const current = (activeConnections.get(ip) || 0) + delta;

  // 连接数归零或为负时清理记录
  if (current <= 0) {
    activeConnections.delete(ip);
    return 0;
  }

  activeConnections.set(ip, current);

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
export function getConnectionStats() {
  const sorted = [...activeConnections.entries()].sort((a, b) => b[1] - a[1]);
  return {
    totalIPs: activeConnections.size,
    totalConnections: sorted.reduce((sum, [, c]) => sum + c, 0),
    topIPs: sorted.slice(0, 10).map(([ip, count]) => ({ ip, count }))
  };
}

/**
 * 清理僵尸连接记录
 * 移除连接数异常高的记录（超过最大限制的 2 倍，通常意味着计数器未正确递减）。
 */
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
 * 启动僵尸连接清理定时任务
 * 每 5 分钟执行一次清理，服务关闭时自动停止。
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
export function startCleanupTask(app) {
  const timer = setInterval(() => cleanupStaleConnections(), 5 * 60 * 1000);
  app.addHook('onClose', async () => clearInterval(timer));
}
