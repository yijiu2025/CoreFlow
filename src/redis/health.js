/**
 * Redis 全局健康监控器
 * 事件驱动 + 按需探测：健康时零开销，不健康时定时 ping 检测恢复
 */

/**
 * 为 Fastify 实例设置 Redis 健康监控
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 * @param {import('redis').RedisClientType} redis Redis 客户端
 */
export function setupRedisHealthMonitor(app, redis) {
  let healthy = true;
  let pingTimer = null;
  const callbacks = new Set();

  /** 通知所有监听者 */
  function notify(newState) {
    for (const cb of callbacks) {
      try {
        cb(newState);
      } catch (err) {
        console.warn('[Redis] 健康状态回调异常:', err.message);
      }
    }
  }

  /** 标记为不健康，启动恢复探测 */
  function markUnhealthy() {
    if (!healthy) return;
    healthy = false;
    app.redisHealthy = false;
    notify(false);

    if (!pingTimer) {
      pingTimer = setInterval(async () => {
        try {
          await redis.ping();
          markHealthy();
        } catch {
          /* 不可用，继续等待 */
        }
      }, 30_000);
      pingTimer.unref();
    }
  }

  /** 标记为健康，停止恢复探测 */
  function markHealthy() {
    if (healthy) return;
    healthy = true;
    app.redisHealthy = true;
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    notify(true);
  }

  // 监听 Redis 客户端事件
  redis.on('error', () => markUnhealthy());
  redis.on('ready', () => markHealthy());
  redis.on('end', () => markUnhealthy());

  // 初始化全局状态
  app.redisHealthy = true;

  // 应用关闭时清理定时器
  app.addHook('onClose', () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    callbacks.clear();
  });

  /** 注册健康状态变化回调，返回取消函数 */
  app.decorate('onRedisHealthChange', (cb) => {
    callbacks.add(cb);
    return () => callbacks.delete(cb);
  });
}
