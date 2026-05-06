/**
 * 弹性存储类
 * 用于速率限制，当 Redis 不可用时能够自动降级到内存存储。
 * 健康状态来自全局 Redis 健康监控器 (app.redisHealthy)
 * 业务配置通过 options.getWindowMs 回调注入，不反向依赖应用层
 */

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

    // 监听全局健康状态变化
    if (app.onRedisHealthChange) {
      app.onRedisHealthChange((state) => {
        this.healthy = state;
        if (state) {
          console.log('✅ [Redis] 限流器切回分布式模式');
        } else {
          console.warn('🚨 [Redis] 限流器降级至内存模式');
        }
      });
    }
  }

  /**
   * 增加计数并返回当前状态
   * @param {string} key 存储键名
   * @param {Function} cb 回调函数 (err, result)
   */
  async incr(key, cb) {
    const windowMs = this.getWindowMs();

    if (this.healthy && this.app.redis) {
      try {
        const count = await this.app.redis.incr(key);
        if (count === 1) await this.app.redis.pexpire(key, windowMs);
        const ttl = await this.app.redis.pttl(key);
        return cb(null, { current: count, ttl: ttl > 0 ? ttl : windowMs });
      } catch (err) {
        this.healthy = false;
        console.error('⚠️ [Redis] 写入失败:', err.message);
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
    // 定期清理过期记录
    if (this.memoryFallback.size > 10000) {
      for (const [k, v] of this.memoryFallback) if (v.expires < now) this.memoryFallback.delete(k);
    }

    return cb(null, { current: record.count, ttl: record.expires - now });
  }

  // 必须实现：兼容插件接口，用于子路由注册
  child(routeOptions) {
    return this;
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
