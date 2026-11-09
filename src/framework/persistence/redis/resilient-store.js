import { createLogger } from '../../support/log/index.js';

const log = createLogger('framework.redis.resilient-store');
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
 *   （2026-11-07 起**只有父实例订阅**：路由桶都是 child，逐个订阅会让一次 Redis
 *   主备切换打出 N 行相同日志）
 * - 移除多余 ttl() 往返，直接返回窗口长度作为 ttl
 * - 降级表封顶（2026-11-09）：键是 `rate:ip:*` / `rate:user:*`，IPv6 轮换地址可无上限增长；
 *   满后先清过期、仍满则**拒绝新键**（fail-closed），绝不淘汰活条目（那等于清零限流计数）
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
 * 降级表默认上限（键数）
 *
 * 每个键 ≈ 200 字节（key 串 + `{count,expires}` + Map 槽位）⇒ 10 万键 ≈ 20MB。
 * 可由 `defense.fallbackMaxKeys`（防火墙配置）覆盖。
 */
const DEFAULT_FALLBACK_MAX_KEYS = 100_000;

/**
 * 超限后清理过期条目的最小间隔
 *
 * 为什么必须节流：攻击场景下「新键持续到来」会让我们每来一个键就全表扫一遍，
 * 把内存风险换成 CPU 风险（O(n) × n）。1 秒最多扫一次，其余时间直接走"拒绝"分支（O(1)）。
 */
const PURGE_MIN_INTERVAL_MS = 1_000;

/** 拒绝新键的告警节流（同一条故障不要每请求刷一行） */
const CAP_WARN_INTERVAL_MS = 60_000;

/** 上一次清理过期条目 / 上一次告警的时间戳（跨实例共享，child 不重复扫） */
let _lastPurgeAt = 0;
let _lastCapWarnAt = 0;

/**
 * 限流计数（单次往返、原子）：INCR 后**仅当窗口首次创建时**设置过期。
 *
 * 为什么不能每个请求都 PEXPIRE：那样 TTL 会被不断续期，只要客户端持续重试，
 * 计数永远不归零 —— 限流退化成「一旦超限就永久 429」，NAT 出口会被整段锁死。
 * 语义与插件自带的 `RedisStore`（`INCR` + `current == 1 时 PEXPIRE`）保持一致。
 *
 * ⚠️ 窗口来自**调用方传入的 timeWindow**（路由级声明），不是全局配置 —— 见 incr 注释。
 *
 * KEYS: [1] 计数 key
 * ARGV: [1] 窗口毫秒
 * 返回: { 当前计数, 剩余毫秒 }
 */
const LUA_INCR_WINDOW = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then ttl = tonumber(ARGV[1]) end
return { current, ttl }
`;

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
/** 已挂过启动汇总钩子的 app（每个 app 只挂一次，不是每个实例） */
const _summaryBoundApps = new WeakSet();

/**
 * 实例数超过这个值才告警
 *
 * 正常值由**路由表规模**决定：每条带 `config.rateLimit` 的路由各占一个 child
 * （Fastify 给每个 GET 自动生成的 HEAD 也算一条），同 groupId 的端点共享桶但仍是
 * 独立实例。实测本仓库 52 个逻辑桶 → 83 个 child + 1 个父实例 = 84，
 * 所以 50 这个量级是常态而非异常。真正的异常是"运行期被反复注册"，
 * 那种情况会跑到数百上千。
 */
const INSTANCE_WARN_THRESHOLD = 500;

/**
 * 在启动结束时打一条汇总（每个 app 只挂一次 onReady）
 *
 * 为什么不在构造时打：child() 是在路由注册过程中密集调用的，构造期只能看到
 * 一个不断增长的中途值 —— 原先按「>50 且 10 的倍数」打点，一次启动会连打
 * 60/70/80 三条，且文案暗示"动态创建了过多路由"，与事实不符（见上）。
 *
 * @param {object} app Fastify 实例
 * @returns {void}
 */
function _scheduleBootSummary(app) {
  if (!app?.addHook || _summaryBoundApps.has(app)) return;
  _summaryBoundApps.add(app);

  const emit = () => {
    const total = _instanceCount;
    if (total === 0) return;
    if (total > INSTANCE_WARN_THRESHOLD) {
      log.warn(`[Redis] 限流存储实例 ${total} 个，异常增长；请检查是否有路由在运行期被反复注册`);
      return;
    }
    log.info(`[Redis] 限流存储就绪：${total} 个实例（父 1 + 路由桶 ${total - 1}）`);
  };

  try {
    app.addHook('onReady', emit);
  } catch {
    // ready 之后再 addHook 可能不被允许（测试里常见）：退回同步摘要，不影响功能
    emit();
  }
}

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
   * @param {() => number} [options.getMaxKeys] 返回降级表容量上限（键数）的回调，默认 10 万
   * @param {boolean} [options.isChild] 是否由 `child()` 派生（子实例不订阅健康变化）
   */
  constructor(app, options = {}) {
    /** @type {import('fastify').FastifyInstance} */
    this.app = app;
    /** @type {() => number} */
    this.getWindowMs = options.getWindowMs || (() => 60000);
    /** @type {() => number} 容量按需读取（面板改阈值后无需重启，与 getWindowMs 同思路） */
    this.getMaxKeys = options.getMaxKeys || (() => DEFAULT_FALLBACK_MAX_KEYS);
    /**
     * @type {Map<string, { count: number, expires: number }>}
     * 子实例共享父实例这张表：库的计数语义是「按 key」，同一个 key 必须命中同一份计数，
     * 否则同 groupId 的多个端点、或全局桶，在 Redis 模式共享而在降级模式各算各的。
     */
    this.memoryFallback = options.memoryFallback || new Map();
    /** @type {import('fastify').FastifyLogger|import('../../support/log/logger.js').AppLogger} */
    this.log = app.log || log;
    /** 失败冷却截止时间戳（0 表示无冷却），单次命令超时后在该时间内不再尝试 Redis */
    this._cooldownUntil = 0;

    _instanceCount++;
    // 汇总日志在启动结束时打一条（不是每个实例都打，见 _scheduleBootSummary）
    _scheduleBootSummary(app);
    _ensureCleanupTimer();
    _registeredMaps.add(this.memoryFallback);

    // 监听全局健康状态变化（保存 unsubscribe 以便 onClose 解绑）
    //
    // ⚠️ **只有父实例订阅**：每个路由桶都是一个 child，若逐个订阅，一次 Redis 主备切换
    // 会打出 N 行完全相同的日志（本仓库实测 83 行），把真正的故障信息淹掉。
    // 桶本身不需要知道健康状态 —— 它每次命令都读 app.redisHealthy。
    /** @type {(() => void)|null} */
    this._unsubHealth = null;
    if (!options.isChild && app.onRedisHealthChange) {
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
   * 当前降级表容量上限（键数）
   * 配置缺失 / 非法时回退默认值 —— 容量判据绝不能因为配错而变成 0 或 Infinity。
   * @returns {number}
   */
  _fallbackCapacity() {
    const value = Number(this.getMaxKeys?.());
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_FALLBACK_MAX_KEYS;
  }

  /**
   * 清掉降级表里**已经过期**的条目
   *
   * 只删过期项：过期条目在语义上已经"不存在"，删掉不影响任何计数 —— 这与"淘汰活条目"
   * 有本质区别（后者等于把限流计数清零）。写时清理 + 定时清理双管，前者只在超限时触发。
   *
   * @param {number} now 当前时间戳
   * @returns {void}
   */
  _purgeExpiredFallback(now) {
    for (const [key, record] of this.memoryFallback) {
      if (!record || record.expires < now) this.memoryFallback.delete(key);
    }
  }

  /**
   * 降级表已满：拒绝**新键**（fail-closed），已有键的计数一概不动
   *
   * 为什么是拒绝而不是淘汰最旧：淘汰会清掉某个键的计数，那个客户端下一请求就从 0 开始数
   * —— 攻击者只要把表打满，就能让所有人的限流窗口反复重置（比"新用户 429"糟得多）。
   * 返回 `max + 1` 让 `@fastify/rate-limit` 判定 exceeds（`isExceeded = current > max`）。
   *
   * @param {number|undefined} max 该路由的窗口上限（插件第 4 个参数）
   * @param {number} windowMs 窗口毫秒
   * @param {string} key 被拒的键（只用于日志，需掩码）
   * @returns {{current: number, ttl: number}}
   */
  _rejectNewFallbackKey(max, windowMs, key) {
    const limit = Number(max);
    const current = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : Number.MAX_SAFE_INTEGER;

    const now = Date.now();
    if (now - _lastCapWarnAt >= CAP_WARN_INTERVAL_MS) {
      _lastCapWarnAt = now;
      const cap = this._fallbackCapacity();
      // 键里只有 userId / IP，日志里给个可定位的片段即可
      const sample = String(key).replace(/\d{1,4}$/, '***');
      this.log.warn?.(
        `[Redis] 限流降级表已达上限 ${cap} 键，拒绝新键（fail-closed）：${sample}；` +
          `已有键计数不受影响，Redis 恢复后自动回到分布式模式`
      );
    }

    return { current, ttl: windowMs };
  }

  /**
   * 获取内存降级层的容量使用情况
   *
   * `capacity` 是**软上限**：超过它之后新键被拒（见 `_rejectNewFallbackKey`），
   * 已有键继续计数，所以 `percent` 理论上不会超过 100（并发写入下可能瞬时略高）。
   *
   * @returns {{ capacity: number, used: number, free: number, percent: number|null }}
   */
  usage() {
    const capacity = this._fallbackCapacity();
    const used = this.memoryFallback?.size ?? 0;
    return {
      capacity,
      used,
      free: Math.max(0, capacity - used),
      percent: capacity > 0 ? Math.round((used / capacity) * 1000) / 10 : null
    };
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
   *
   * 窗口优先取**插件传入的 `timeWindow`**（`@fastify/rate-limit` 以第 3 个参数传入，
   * 即路由声明的 `config.rateLimit.timeWindow`），缺失/非法时才回退全局 `getWindowMs()`。
   * 历史实现完全忽略该参数，导致路由上写的 `timeWindow` 是装饰品 —— 声明 10 分钟仍是 60 秒。
   *
   * @param {string} key 存储键名
   * @param {Function} cb 回调函数 (err, result)
   * @param {number} [timeWindow] 窗口毫秒（由插件按路由配置传入）
   * @param {number} [max] 窗口内上限（降级表满时用来构造"已超限"的返回值）
   * @returns {Promise<void>}
   */
  async incr(key, cb, timeWindow, max) {
    const requested = Number(timeWindow);
    const windowMs = Number.isFinite(requested) && requested > 0 ? requested : this.getWindowMs();

    if (this._shouldUseRedis()) {
      const redis = this._getRedis();
      try {
        const res = await Promise.race([
          redis.eval(LUA_INCR_WINDOW, { keys: [key], arguments: [String(windowMs)] }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('操作超时')), REDIS_TIMEOUT))
        ]);
        // 数组元素可能是字符串（node-redis 的 Lua 返回值类型宽松）
        const count = Number(res?.[0]);
        const ttl = Number(res?.[1]) > 0 ? Number(res[1]) : windowMs;
        this.log.debug?.({ key, count, ttl }, '[Redis] 限流计数成功');
        return cb(null, { current: count, ttl });
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

    // 降级逻辑：内存计数（固定窗口，与 Redis 侧同语义：窗口内不续期）
    if (!this.memoryFallback) {
      this.log.warn?.({ key }, '[Redis] 降级存储已关闭，跳过计数');
      return cb(null, { current: 1, ttl: windowMs });
    }
    const now = Date.now();
    let record = this.memoryFallback.get(key);
    const isNewWindow = !record || record.expires < now;

    // 容量守卫（2026-11-09）：降级表按请求键（`rate:ip:*` / `rate:user:*`）增长，
    // IPv6 一个 /64 就有 2^64 个地址，轮换地址能把这张表撑到 OOM。
    // 策略是**只拦新键**：满了先清过期（纯收益），仍满则新键直接判超限，
    // 已有键的计数一概不动 —— 淘汰活条目等于把限流计数清零，比误伤新用户糟得多。
    if (isNewWindow && this.memoryFallback.size >= this._fallbackCapacity()) {
      if (now - _lastPurgeAt >= PURGE_MIN_INTERVAL_MS) {
        _lastPurgeAt = now;
        this._purgeExpiredFallback(now);
      }
      if (this.memoryFallback.size >= this._fallbackCapacity()) {
        return cb(null, this._rejectNewFallbackKey(max, windowMs, key));
      }
    }

    if (isNewWindow) {
      record = { count: 1, expires: now + windowMs };
      this.log.debug?.({ key, mode: 'memory' }, '[Redis] 限流降级到内存');
    } else {
      record.count++;
    }

    this.memoryFallback.set(key, record);

    return cb(null, { current: record.count, ttl: Math.max(0, record.expires - now) });
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
    // 共享 memoryFallback：Redis 模式下所有子实例本来就写同一批 key，
    // 若降级时每个子实例各建一张表，就会出现「Redis 模式共享、降级模式隔离」
    // 的语义分裂（同 groupId 的端点不共享桶、全局桶被按路由放大数倍）。
    //
    // isChild: 子实例不订阅健康变化（父实例统一转告），否则一次切换打 N 行相同日志。
    return new ResilientStore(this.app, {
      getWindowMs: this.getWindowMs,
      getMaxKeys: this.getMaxKeys,
      memoryFallback: this.memoryFallback,
      isChild: true
    });
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
