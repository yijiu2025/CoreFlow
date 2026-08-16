/**
 * Redis 全局健康监控器（单例式）
 * 事件驱动 + 按需探测：健康时零开销，不健康时定时 ping 检测恢复
 *
 * 设计要点（修复历史问题）：
 * - init(app) 只执行一次：decorate('onRedisHealthChange') 与 onClose 钩子唯一注册，
 *   避免主备切换时反复 decorate 抛 FST_ERR_DEC_ALREADY_PRESENT、onClose 钩子累积
 * - onClose 防重复通过模块级 WeakSet 跟踪已注册的 app，不污染 app 命名空间
 * - attach(client)/detach(client) 在连接切换时仅重绑监听器，回调 Set 与 pingTimer 全局唯一
 * - switchback（切回主库）不再复用当前连接的 ready 事件，改由 index.js 独立主库探活驱动
 *
 * @author yijiu2025
 * @since 2026-07-24
 */

/** 不可用时恢复探测间隔（毫秒） */
const PING_INTERVAL = 10_000;

/** SLOWLOG 采集间隔（毫秒） */
const SLOWLOG_INTERVAL = 60_000;

/** 每次采集的慢查询条数 */
const SLOWLOG_COUNT = 10;

/** SLOWLOG 告警阈值（微秒），默认 100ms，低于此值不记录 */
const SLOWLOG_WARN_THRESHOLD = 100_000;

/** 已注册 onClose 钩子的 app 实例集合，避免重复注册 */
const _hookBoundApps = new WeakSet();

/**
 * 创建并初始化健康监控器（每个 app 仅初始化一次）
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 * @param {object} [options]
 * @param {(healthy: boolean) => void} [options.onStateChange] - 健康状态变化回调，用于同步模块级状态
 * @returns {{ attach: Function, detach: Function }} 监控器实例，提供 attach/detach 能力
 */
function setupRedisHealthMonitor(app, options = {}) {
  const { onStateChange } = options;
  /** 健康状态回调集合（全局唯一，跨连接切换复用） */
  const callbacks = new Set();
  /** 当前监听的 Redis 客户端 */
  let monitored = null;
  /** 当前客户端是否健康 */
  let healthy = true;
  /** 恢复探测定时器（不健康时启动，健康时清除） */
  let pingTimer = null;
  /** SLOWLOG 采集定时器 */
  let slowlogTimer = null;
  /** 上次已上报的 SLOWLOG 条目 ID，用于判重替代 RESET */
  let _lastSlowlogId = '0';
  /** 绑定到 monitored 的 error 处理函数引用（便于解绑） */
  let onError = null;
  let onReady = null;
  let onEnd = null;

  /**
   * 通知所有监听者
   * 单个回调异常不影响其他回调执行
   * @param {boolean} newState - 新健康状态
   */
  function notify(newState) {
    for (const cb of callbacks) {
      try {
        cb(newState);
      } catch (err) {
        console.warn('[Redis] 健康状态回调异常:', err.stack || err.message);
      }
    }
  }

  /**
   * 更新内部状态 + app 装饰器 + 模块级状态
   * @param {boolean} newState
   */
  function setState(newState) {
    healthy = newState;
    app.redisHealthy = newState;
    if (onStateChange) onStateChange(newState);
  }

  /**
   * 标记为不健康，启动恢复探测
   * 防重复：healthy 为 false 时直接返回
   * 启动 10s 间隔的 ping 探测，ping 成功时自动调 markHealthy
   */
  function markUnhealthy() {
    if (!healthy) return;
    setState(false);
    notify(false);

    if (!pingTimer) {
      pingTimer = setInterval(async () => {
        if (!monitored) return;
        try {
          await monitored.ping();
          markHealthy();
        } catch {
          /* 不可用，继续等待 */
        }
      }, PING_INTERVAL);
      pingTimer.unref();
    }
  }

  /**
   * 标记为健康，停止恢复探测
   * 防重复：healthy 为 true 时直接返回
   */
  function markHealthy() {
    if (healthy) return;
    setState(true);
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    notify(true);
  }

  /**
   * 启动 SLOWLOG 采集
   * 每 60s 采集一次，超过 100ms 的慢查询记录到 app.log.warn
   * 用条目 ID 判重，不 RESET 日志，避免干扰其他监控工具
   * 防重复：slowlogTimer 已存在时直接返回
   */
  function startSlowlog() {
    if (slowlogTimer) return;
    const SLOWLOG_TIMEOUT = 5000;
    slowlogTimer = setInterval(async () => {
      if (!monitored || !monitored.isReady) return;
      try {
        const logs = await Promise.race([
          monitored.sendCommand(['SLOWLOG', 'GET', String(SLOWLOG_COUNT)]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SLOWLOG 超时')), SLOWLOG_TIMEOUT))
        ]);
        if (logs && logs.length > 0) {
          for (const entry of logs) {
            const id = String(entry[0]); // 条目唯一 ID
            const duration = entry[1]; // 微秒
            const args = entry[3]?.join(' ') || '';
            if (id <= _lastSlowlogId) continue; // 已上报过，跳过
            if (duration >= SLOWLOG_WARN_THRESHOLD) {
              app.log.warn?.(
                { module: 'Redis', duration, command: args },
                `SLOWLOG: ${(duration / 1000).toFixed(1)}ms`
              );
            }
          }
          // 更新最新 ID，不执行 RESET 以兼容其他监控工具
          const latestId = String(logs[0][0]);
          if (latestId > _lastSlowlogId) _lastSlowlogId = latestId;
        }
      } catch {
        /* SLOWLOG 采集失败不阻塞健康逻辑 */
      }
    }, SLOWLOG_INTERVAL);
    slowlogTimer.unref();
  }

  /** 停止 SLOWLOG 采集 */
  function stopSlowlog() {
    if (slowlogTimer) {
      clearInterval(slowlogTimer);
      slowlogTimer = null;
    }
  }

  /**
   * 解绑当前客户端的事件监听
   * 同时停止 SLOWLOG 采集
   */
  function detach() {
    if (!monitored) return;
    if (onError) monitored.off('error', onError);
    if (onReady) monitored.off('ready', onReady);
    if (onEnd) monitored.off('end', onEnd);
    onError = onReady = onEnd = null;
    stopSlowlog();
  }

  /**
   * 绑定新的 Redis 客户端进行监控
   * 切换连接时调用：先解绑旧客户端，再绑定新客户端
   * 绑定后监听 error/ready/end 事件，自动更新健康状态
   * @param {import('redis').RedisClientType} client
   */
  function attach(client) {
    if (monitored === client) return;
    detach();
    monitored = client;
    if (!client) {
      setState(false);
      return;
    }

    // error 事件包含瞬时错误（如命令超时），不一定断开连接
    // 检查 isReady 避免不必要的健康状态翻转
    onError = () => {
      if (!client.isReady) markUnhealthy();
    };
    onReady = () => markHealthy();
    onEnd = () => markUnhealthy();

    client.on('error', onError);
    client.on('ready', onReady);
    client.on('end', onEnd);

    // 以新客户端当前状态为基准
    if (client.isReady) {
      setState(true);
      startSlowlog();
    } else {
      markUnhealthy();
    }
  }

  // 初始化全局状态与装饰器（仅执行一次）
  if (!app.hasDecorator('onRedisHealthChange')) {
    app.decorate('onRedisHealthChange', cb => {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    });
  }

  // 应用关闭时清理定时器与回调（仅注册一次）
  if (!_hookBoundApps.has(app)) {
    _hookBoundApps.add(app);
    app.addHook('onClose', () => {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      stopSlowlog();
      detach();
      callbacks.clear();
    });
  }

  return { attach, detach };
}

export { setupRedisHealthMonitor };
