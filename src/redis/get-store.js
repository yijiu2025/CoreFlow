/**
 * 统一存储工厂（getStore）
 *
 * 根据配置自动选择存储后端：
 * - REDIS_ENABLED=true 且配置了 REDIS_HOST → 使用 Redis（全功能）
 * - 否则 → 使用 MapStore（仅 KV）
 *
 * === 备用 Redis 模式 ===
 * 传 { backup: true } 时允许主库故障时自动降级到备用 Redis。
 * 备用 Redis 未配置时自动回退到主 Redis。
 * 适用于限流计数、验证码等短时效数据。
 *
 * Redis 模式支持所有 Redis 操作，key 自动加 prefix: 前缀。
 * 不传 prefix 或传空字符串时不加前缀，直接使用原始 key。
 * MapStore 模式仅支持 KV 操作，hash 等方法抛 TypeError。
 * 超时通过 timeout 选项配置（默认 5000ms），MapStore 模式忽略。
 *
 * === 缓存策略 ===
 * 相同 prefix + timeout + backup 返回同一个 store 实例。
 * 缓存按后端类型（redis/map）标记，Redis 健康状态变更时自动失效重建。
 * 缓存上限 1000 条，超出时淘汰最旧条目。
 * 健康稳定期间，业务代码多次调用 getStore('captcha') 拿到的是同一个对象。
 *
 * === 架构说明 ===
 * 所有 Redis 操作委托给 RedisStore，复用其冷却机制、超时保护和错误包装。
 * 所有 MapStore 操作委托给 MapStore，hash 等方法抛 TypeError。
 * getStore 本身不包含任何内联的 Redis 命令，仅做路由和缓存。
 *
 * @example
 * import { getStore } from './get-store.js';
 *
 * // KV 操作（Redis + MapStore 均支持）
 * const store = getStore('captcha', { timeout: 3000 });
 * await store.set('key', value, 600);
 * const data = await store.get('key');
 *
 * // 备用 Redis 模式（主库故障时降级备用）
 * const rl = getStore('rl', { backup: true });
 * await rl.set('ip:1.2.3.4', count, 60);
 *
 * // Hash 操作（仅 Redis，MapStore 抛错）
 * const fw = getStore('fw');
 * await fw.hset('blocked:ips', ip, JSON.stringify(meta));
 *
 * @author yijiu2025
 * @since 2026-07-28
 */

import { getRedisStore, setTtlJitter } from './redis-store.js';
import { getMapStore } from './map-store.js';
import { isRedisConfigured } from './utils.js';

/** 默认超时（毫秒） */
const DEFAULT_TIMEOUT = 5000;

/**
 * 根据配置自动选择存储后端
 * @param {string} [prefix] - 命名空间，不传或空字符串时不加前缀
 * @param {object} [options] - 使用redis时有效
 * @param {number} [options.timeout=5000] - 操作超时（毫秒）
 * @param {boolean} [options.backup=false] - 允许使用备用 Redis 作为主库故障降级
 *                                   true  = 主库不通切备库，都不行抛 503
 *                                   false = 仅主库，不通则抛 503
 * @param {number} [options.ttlJitter=0] - TTL 随机抖动范围（秒），防缓存雪崩
 * @returns {object} 存储对象
 */
function getStore(prefix, options = {}) {
  if (prefix !== undefined && prefix !== '' && typeof prefix !== 'string') {
    throw new TypeError('getStore: prefix 必须是字符串');
  }
  const { timeout = DEFAULT_TIMEOUT, backup = false, ttlJitter } = options;
  const useRedis = isRedisConfigured();
  const resolvedPrefix = prefix ?? '';

  // 配置全局 TTL 随机抖动
  if (ttlJitter !== undefined) {
    setTtlJitter(ttlJitter);
  }

  const store = useRedis ? getRedisStore(resolvedPrefix, timeout, backup) : getMapStore(resolvedPrefix);

  // 链式设置子前缀：aaa.setPrefix('second') → first:second:key
  store.setPrefix = subPrefix =>
    getStore(resolvedPrefix ? `${resolvedPrefix}:${subPrefix}` : subPrefix, { timeout, backup });

  return store;
}

export { getStore };
