/**
 * 弹性存储类
 * 用于速率限制，当 Redis 不可用时能够自动降级到内存存储。
 * 健康状态来自全局 Redis 健康监控器 (app.redisHealthy)
 * 业务配置通过 options.getWindowMs 回调注入，不反向依赖应用层
 */

/** 内存清理间隔（30 秒） */
const CLEANUP_INTERVAL = 30_000;

/**
 * 具备降级能力的存储类
 * 当 Redis 故障时，自动切换至内存模式
 */
export class ResilientStore {
  /**
   * @param {import('fastify').FastifyInstance} app Fastify 实例
   * @param {object} [options]
   * @param {() => number} [options.getWindowMs] 返回当前限流窗口（毫秒）的回调，默认 60000
   */
  constructor(app, options = {}) {
    this.app = app;
    this.getWindowMs = options.getWindowMs || (() => 60000);
    this.memoryFallback = new Map();
    this.healthy = !!app.redisHealthy;
    this.log = app.log || console;

    // 定时清理过期内存记录
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.memoryFallback) {
        if (v.expires < now) this.memoryFallback.delete(k);
      }
    }, CLEANUP_INTERVAL);
    this._cleanupTimer.unref();

    // 监听全局健康状态变化
    if (app.onRedisHealthChange) {
      app.onRedisHealthChange((state) => {
        this.healthy = state;
        if (state) {
          this.log.info?.('[Redis] 限流器切回分布式模式');
        } else {
          this.log.warn?.('[Redis] 限流器降级至内存模式');
        }
      });
    }

    // 应用关闭时清理定时器
    if (app.addHook) {
      app.addHook('onClose', () => {
        clearInterval(this._cleanupTimer);
      });
    }
  }

  /**
   * 增加计数并返回当前状态
   * 使用 MULTI/EXEC 保证 INCR + PEXPIRE 原子性
   * @param {string} key 存储键名
   * @param {Function} cb 回调函数 (err, result)
   */
  async incr(key, cb) {
    const windowMs = this.getWindowMs();

    if (this.healthy && this.app.redis) {
      try {
        const results = await this.app.redis.multi().incr(key).pexpire(key, windowMs).exec();

        // 兼容 node-redis v4（直接值）和 v5（{ value } 包装）
        const count = typeof results[0] === 'object' ? results[0].value : results[0];
        const ttl = await this.app.redis.pttl(key);
        return cb(null, { current: count, ttl: ttl > 0 ? ttl : windowMs });
      } catch (err) {
        this.healthy = false;
        this.log.warn?.({ err: { message: err.message } }, '[Redis] 限流写入失败，降级到内存');
      }
    }

    // 降级逻辑：内存计数
    const now = Date.now();
    let record = this.memoryFallback.get(key);

    if (!record || record.expires < now) {
      record = { count: 1, expires: now + windowMs };
    } else {
      record.count++;
    }

    this.memoryFallback.set(key, record);

    return cb(null, { current: record.count, ttl: record.expires - now });
  }

  /**
   * 创建隔离的子存储实例
   * @param {object} routeOptions 路由配置
   * @returns {ResilientStore} 新的存储实例
   */
  child(routeOptions) {
    return new ResilientStore(this.app, { getWindowMs: this.getWindowMs });
  }
}

/**
 * 创建绑定 app 实例的弹性存储类
 * 工厂模式：返回的类可直接传给 @fastify/rate-limit 的 store 选项
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 * @param {object} [extraOptions] 额外配置（如 getWindowMs 回调）
 * @returns {typeof ResilientStore} 绑定了 app 的存储类
 */
export function createBoundStore(app, extraOptions = {}) {
  return class extends ResilientStore {
    constructor(options) {
      super(app, { ...options, ...extraOptions });
    }
  };
}
