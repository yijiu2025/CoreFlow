/**
 * 弹性存储类
 * 用于速率限制，当 Redis 不可用时能够自动降级到内存存储，确保防火墙的基本功能。
 */
import { getSecuritySettings } from '../dao/dao.js';

/**
 * 具备降级能力的存储类
 * 当 Redis 故障时，自动切换至内存模式
 */
export class ResilientStore {
  constructor(app, options = {}) {
    this.app = app;
    this.options = options;
    this.memoryFallback = new Map();
    this.redisHealthy = !!app.redis;

    // 定期探测 Redis 健康状况 (每 10 秒)
    if (app.redis) {
      this.pingTimer = setInterval(async () => {
        try {
          await app.redis.ping();
          if (!this.redisHealthy) {
            this.redisHealthy = true;
            console.log('✅ [Firewall] Redis 恢复连接，限流器切回分布式模式');
          }
        } catch (err) {
          if (this.redisHealthy) {
            this.redisHealthy = false;
            console.warn('🚨 [Firewall] Redis 连接中断，限流器降级至内存模式');
          }
        }
      }, 10000);
    }
  }

  /**
   * 增加计数并返回当前状态
   * @param {string} key 存储键名
   * @param {Function} cb 回调函数 (err, result)
   */
  async incr(key, cb) {
    const windowMs = (getSecuritySettings().defense.rateLimitWindow || 60) * 1000;
    
    if (this.redisHealthy && this.app.redis) {
      try {
        const count = await this.app.redis.incr(key);
        if (count === 1) await this.app.redis.pexpire(key, windowMs);
        const ttl = await this.app.redis.pttl(key);
        return cb(null, { current: count, ttl: ttl > 0 ? ttl : windowMs });
      } catch (err) {
        this.redisHealthy = false;
        console.error('⚠️ [Firewall] Redis 写入失败:', err.message);
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

  // 必须实现：兼容插件接口
  // 必须实现：兼容插件接口，用于子路由注册
  child(routeOptions) {
    return this;
  }
}
