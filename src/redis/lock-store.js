/**
 * 分布式锁
 *
 * 基于 Redis SET NX 的分布式锁，适用于多实例部署下的互斥控制。
 * 支持自动续期、阻塞等待、安全释放（仅锁持有者可释放）。
 *
 * 适用场景：
 * - 定时任务防重复执行
 * - 防重提交
 * - 缓存重建保护
 * - 资源竞争保护
 *
 * @example
 * const lock = createLock('task:sync-users', { ttl: 30000 });
 *
 * // 非阻塞尝试
 * if (await lock.tryAcquire()) {
 *   try { await syncUsers(); } finally { await lock.release(); }
 * }
 *
 * // 阻塞等待（最多等 10 秒）
 * await lock.acquire(10000);
 * try { await syncUsers(); } finally { await lock.release(); }
 *
 * @author yijiu2025
 * @since 2026-08-06
 */

import { RedisStore } from './redis-store.js';
import { isRedisConfigured } from './utils.js';

const LOCK_PREFIX = 'lock';

/**
 * 生成唯一实例 ID（进程级别），用于标记锁的持有者
 */
function _instanceId() {
  return `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Lua 脚本：安全释放锁
 * 仅当 KEYS[1] 的值等于 ARGV[1]（实例 ID）时才删除，防止误删其他实例的锁
 */
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

/**
 * Lua 脚本：续期锁
 * 仅当 KEYS[1] 的值等于 ARGV[1]（实例 ID）时才延长 TTL
 */
const EXTEND_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`;

/**
 * 创建分布式锁
 * @param {string} name - 锁名称（全局唯一）
 * @param {object} [options]
 * @param {number} [options.ttl=30000] - 锁超时毫秒，超时自动释放
 * @param {number} [options.retryDelay=200] - 重试间隔毫秒，仅 acquire 时有效
 * @returns {object} 锁对象
 */
function createLock(name, options = {}) {
  if (!isRedisConfigured()) {
    throw new Error('Redis 未配置，分布式锁需要 Redis 支持');
  }

  const { ttl = 30000, retryDelay = 200 } = options;
  const lockKey = `${LOCK_PREFIX}:${name}`;
  const holder = _instanceId();
  let _renewTimer = null;

  /**
   * 获取锁的当前持有者
   * @returns {Promise<string|null>}
   */
  async function getHolder() {
    return RedisStore.call(LOCK_PREFIX, redis => redis.get(lockKey), 1000);
  }

  /**
   * 尝试获取锁（非阻塞）
   * @param {number} [customTtl] - 自定义 TTL（毫秒），不传使用 options.ttl
   * @returns {Promise<boolean>} true = 获取成功
   */
  async function tryAcquire(customTtl) {
    const lockTtl = customTtl ?? ttl;
    const result = await RedisStore.call(
      LOCK_PREFIX,
      redis => redis.set(lockKey, holder, { NX: true, PX: lockTtl }),
      1000
    );
    return result === 'OK';
  }

  /**
   * 阻塞等待锁（最多等 timeout 毫秒）
   * @param {number} [timeout=30000] - 最大等待毫秒，0 或负数表示无限等待
   * @returns {Promise<boolean>} true = 获取成功
   */
  async function acquire(timeout = 30000) {
    // 先尝试一次
    if (await tryAcquire()) return true;

    // 拿不到则轮询，最多等 timeout 毫秒（timeout <= 0 表示无限等待）
    const deadlineMs = timeout > 0 ? Date.now() + timeout : Infinity;
    while (Date.now() < deadlineMs) {
      await new Promise(r => setTimeout(r, retryDelay));
      if (await tryAcquire()) return true;
    }
    return false;
  }

  /**
   * 释放锁（仅当前持有者可以释放）
   * @returns {Promise<boolean>} true = 释放成功
   */
  async function release() {
    stopRenew();
    const result = await RedisStore.call(
      LOCK_PREFIX,
      redis => redis.eval(RELEASE_SCRIPT, { keys: [lockKey], arguments: [holder] }),
      1000
    );
    return result === 1;
  }

  /**
   * 启动自动续期（适合长时间任务）
   * 每间隔 ttl/3 毫秒续期一次，防止锁在任务执行期间过期
   * @returns {void}
   */
  function startRenew() {
    stopRenew();
    const interval = Math.max(1000, Math.floor(ttl / 3));
    _renewTimer = setInterval(async () => {
      try {
        await RedisStore.call(
          LOCK_PREFIX,
          redis => redis.eval(EXTEND_SCRIPT, { keys: [lockKey], arguments: [holder, String(Math.ceil(ttl / 1000))] }),
          1000
        );
      } catch {
        /* 续期失败不阻塞，锁过期后自然释放 */
      }
    }, interval);
    if (_renewTimer) _renewTimer.unref();
  }

  /** 停止自动续期 */
  function stopRenew() {
    if (_renewTimer) {
      clearInterval(_renewTimer);
      _renewTimer = null;
    }
  }

  return {
    tryAcquire,
    acquire,
    release,
    getHolder,
    startRenew,
    stopRenew
  };
}

export { createLock };
