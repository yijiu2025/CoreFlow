/* eslint-disable no-console */

/**
 * 弹性存储类
 * 用于速率限制，当 Redis 不可用时能够自动降级到内存存储。
 * 健康状态来自全局 Redis 健康监控器 (app.redisHealthy)
 * 业务配置通过 options.getWindowMs 回调注入，不反向依赖应用层
 *
 * 修复要点：
 * - 不再缓存本地 healthy 状态，每次读取 app.redisHealthy，杜绝瞬时命令错误后永久卡死在内存模式
 * - 单次失败后短冷却（5s），避免 Redis 抖动时雪崩打爆
 * - child() 保存健康回调 unsubscribe 函数，onClose 时解绑，避免全局回调 Set 无限增长
 * - 移除多余 ttl() 往返，直接返回窗口长度作为 ttl
 *
 * @author yijiu2025
 * @since 2026-07-24
 */

/** 内存清理间隔（30 秒） */
const CLEANUP_INTERVAL = 30_000;

/** 命令失败后冷却时间（毫秒），期间直接走内存，避免抖动雪崩 */
const FAILURE_COOLDOWN = 5_000;

/** Redis 操作超时（毫秒） */
const REDIS_TIMEOUT = 3000;

/**
 * 共享的清理定时器（所有实例共用），避免 child() 创建大量重复定时器
 * 懒初始化 + 引用计数：首个实例创建时启动，末个实例销毁时停止
 * onClose 钩子全局仅注册一次，避免 child() 批量创建时钩子累积
 */
let _sharedCleanupTimer = null;
const _registeredMaps = new Set();
let _instanceCount = 0;
/** 所有 ResilientStore 实例集合，用于 onClose 统一清理 */
const _allInstances = new Set();
/** 已注册 onClose 的 app 实例集合，避免重复注册 */
const _onCloseRegistered = new WeakSet();

/**
 * 启动共享清理定时器（懒初始化）
 * 每 30s 遍历所有注册的 memoryFallback Map，清理已过期的条目
 */
function _ensureCleanupTimer() {
  if (_sharedCleanupTimer) return;
  _sharedCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const map of _registeredMaps) {
      for (const [k, v] of map) {
        if (v.expires < now) map.delete(k);
      }
    }
  }, CLEANUP_INTERVAL);
  _sharedCleanupTimer.unref();
}

/**
 * 停止共享清理定时器（引用计数归零时）
 * 仅在 _instanceCount === 0 时实际停止
 */
function _stopCleanupTimer() {
  if (_instanceCount > 0) return;
  if (_sharedCleanupTimer) {
    clearInterval(_sharedCleanupTimer);
    _sharedCleanupTimer = null;
  }
}

/**
 * 具备降级能力的存储类
 * 当 Redis 故障时，自动切换至内存模式
 *
 * 使用方式：
 *   直接传入 @fastify/rate-limit 的 store 选项：
 *   ```
 *   app.register(rateLimit, {
 *     store: createBoundStore(app, { getWindowMs: () => 60_000 })
 *   });
 *   ```
 */
class ResilientStore {
  /**
   * @param {import('fastify').FastifyInstance} app Fastify 实例
   * @param {object} [options]
   * @param {() => number} [options.getWindowMs] 返回当前限流窗口（毫秒）的回调，默认 60000
   */
  constructor(app, options = {}) {
    /** @type {import('fastify').FastifyInstance} */
    this.app = app;
    /** @type {() => number} */
    this.getWindowMs = options.getWindowMs || (() => 60000);
    /** @type {Map<string, { count: number, expires: number }>} */
    this.memoryFallback = new Map();
    /** @type {import('fastify').FastifyLogger|Console} */
    this.log = app.log || console;
    /** 失败冷却截止时间戳（0 表示无冷却），单次命令超时后在该时间内不再尝试 Redis */
    this._cooldownUntil = 0;

    _instanceCount++;
    // 当限流路由较多时，记录实例数以辅助排查内存占用
    if (_instanceCount > 50 && _instanceCount % 10 === 0) {
      console.warn(`[Redis] ResilientStore 实例数已达 ${_instanceCount}，请检查是否动态创建了过多路由`);
    }
    _ensureCleanupTimer();
    _registeredMaps.add(this.memoryFallback);

    // 监听全局健康状态变化（保存 unsubscribe 以便 onClose 解绑）
    /** @type {(() => void)|null} */
    this._unsubHealth = null;
    if (app.onRedisHealthChange) {
      this._unsubHealth = app.onRedisHealthChange(state => {
        if (state) {
          this.log.info?.('[Redis] 限流器切回分布式模式');
        } else {
          this.log.warn?.('[Redis] 限流器降级至内存模式');
        }
      });
    }

    _allInstances.add(this);

    // 全局仅注册一次 onClose 钩子，统一清理所有实例
    if (app.addHook && !_onCloseRegistered.has(app)) {
      _onCloseRegistered.add(app);
      app.addHook('onClose', () => {
        for (const inst of _allInstances) {
          inst.close();
        }
        _instanceCount = 0;
        _stopCleanupTimer();
      });
    }
  }

  /**
   * 判断当前是否应使用主 Redis
   * ResilientStore 始终使用主 Redis，备用 Redis 由 getStore({ backup: true }) 按需指定
   *
   * 返回 false 的情况：
   * - app.redisHealthy 为 false（健康监控已标记不可用）
   * - app.redis 为 null（Redis 连接未初始化）
   * - 处于冷却期（上次命令超时后 5s 内）
   *
   * @returns {boolean} true = 使用 Redis，false = 降级内存
   */
  _shouldUseRedis() {
    if (!this.app.redisHealthy || !this.app.redis) return false;
    if (Date.now() < this._cooldownUntil) return false;
    return true;
  }

  /**
   * 获取内存降级层的容量使用情况
   * 注意：内存降级层无固定容量上限，capacity 为 null
   * @returns {{ capacity: null, used: number, free: null, percent: null }}
   */
  usage() {
    return { capacity: null, used: this.memoryFallback?.size ?? 0, free: null, percent: null };
  }

  /**
   * 获取主 Redis 客户端
   * @returns {import('redis').RedisClientType|null}
   */
  _getRedis() {
    return this.app.redis;
  }

  /**
   * 增加计数并返回当前状态
   * 使用 MULTI/EXEC 保证 INCR + PEXPIRE 原子性
   *
   * @param {string} key 存储键名
   * @param {Function} cb 回调函数 (err, result)
   * @param {Error|null} cb.err 错误对象
   * @param {object} cb.result
   * @param {number} cb.result.current 当前窗口内的计数
   * @param {number} cb.result.ttl 当前窗口剩余时间（毫秒）
   * @returns {Promise<void>}
   */
  async incr(key, cb) {
    const windowMs = this.getWindowMs();

    if (this._shouldUseRedis()) {
      const redis = this._getRedis();
      try {
        const results = await Promise.race([
          redis.multi().incr(key).pExpire(key, windowMs).exec(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('操作超时')), REDIS_TIMEOUT))
        ]);
        // 兼容 node-redis v4（直接值）和 v5（{ value } 包装）
        const count = typeof results[0] === 'object' ? results[0].value : results[0];
        // 直接以窗口长度作为 ttl，省去一次 PTTL 往返（限流语义上为窗口上界）
        this.log.debug?.({ key, count, ttl: windowMs }, '[Redis] 限流计数成功');
        return cb(null, { current: count, ttl: windowMs });
      } catch (err) {
        // 进入冷却，避免抖动期间反复打 Redis
        this._cooldownUntil = Date.now() + FAILURE_COOLDOWN;
        this.log.warn?.({ err: { message: err.message } }, '[Redis] 限流写入失败，降级到内存');
        // 注意：Promise.race 超时后 Redis 命令可能在后台仍会完成
        // 限流场景下允许 ±1 的计数误差
        if (err.message === '操作超时') {
          this.log.debug?.({ key }, '[Redis] 限流操作超时，降级后可能产生双写');
        }
      }
    }

    // 降级逻辑：内存计数
    if (!this.memoryFallback) {
      this.log.warn?.({ key }, '[Redis] 降级存储已关闭，跳过计数');
      return cb(null, { current: 1, ttl: windowMs });
    }
    const now = Date.now();
    let record = this.memoryFallback.get(key);

    if (!record || record.expires < now) {
      record = { count: 1, expires: now + windowMs };
      this.log.debug?.({ key, mode: 'memory' }, '[Redis] 限流降级到内存');
    } else {
      record.count++;
    }

    this.memoryFallback.set(key, record);

    return cb(null, { current: record.count, ttl: record.expires - now });
  }

  /**
   * 创建隔离的子存储实例
   * @fastify/rate-limit 在注册每个路由时调用此方法创建子实例
   * 全局 onClose 钩子统一清理所有实例，无需单独注册
   *
   * @param {object} [_routeOptions] 路由配置（由 @fastify/rate-limit 传入，当前未使用）
   * @returns {ResilientStore} 新的存储实例
   */
  child(_routeOptions) {
    return new ResilientStore(this.app, { getWindowMs: this.getWindowMs });
  }

  /**
   * 释放资源，从全局集合中移除
   * 调用方在不再需要此实例时调用，避免 _allInstances 无限增长
   *
   * 清理内容：
   * - 从 _allInstances 和 _registeredMaps 中移除
   * - 取消健康回调订阅
   * - 释放 app 和 memoryFallback 引用（便于 GC）
   * - 引用计数减一，归零时停止共享清理定时器
   */
  close() {
    if (!_allInstances.has(this)) return;
    _allInstances.delete(this);
    _registeredMaps.delete(this.memoryFallback);
    if (this._unsubHealth) {
      this._unsubHealth();
      this._unsubHealth = null;
    }
    this._cooldownUntil = 0;
    this.memoryFallback = null;
    this.app = null;
    _instanceCount = Math.max(0, _instanceCount - 1);
    _stopCleanupTimer();
  }
}

/**
 * 创建绑定 app 实例的弹性存储类
 * 工厂模式：返回的类可直接传给 @fastify/rate-limit 的 store 选项
 *
 * @example
 * import rateLimit from '@fastify/rate-limit';
 * app.register(rateLimit, {
 *   store: createBoundStore(app, { getWindowMs: () => 60_000 })
 * });
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 * @param {object} [extraOptions] 额外配置（如 getWindowMs 回调）
 * @param {() => number} [extraOptions.getWindowMs] 覆盖默认的限流窗口回调
 * @returns {typeof ResilientStore} 绑定了 app 的存储类
 */
function createBoundStore(app, extraOptions = {}) {
  return class extends ResilientStore {
    constructor(options) {
      super(app, { ...options, ...extraOptions });
    }
  };
}

export { ResilientStore, createBoundStore };
