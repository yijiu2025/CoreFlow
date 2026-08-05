/**
 * Nonce 防重放存储
 *
 * 用于 RSA 加密登录的防重放校验，支持多实例部署。
 * 根据配置自动选择后端：
 * - REDIS_ENABLED=true + REDIS_HOST → 使用 Redis（Lua 脚本原子 checkAndMark）
 * - 否则 → 使用 MapStore（同步操作，无并发问题）
 *
 * @author yijiu2025
 * @since 2026-07-25
 */

import { RedisStore } from './redis-store.js';
import { MapStore } from './map-store.js';
import { isRedisConfigured } from './utils.js';

const DEFAULT_TTL = 60; // 秒
const REDIS_OP_TIMEOUT = 3000;

/**
 * Lua 脚本：原子性 check + mark
 * 如果 nonce 不存在则写入并返回 0（首次使用）
 * 如果 nonce 已存在则返回 1（重放攻击）
 */
const CHECK_AND_MARK_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('SETEX', KEYS[1], tonumber(ARGV[1]), '1')
  return 0
else
  return 1
end
`;

/**
 * 创建 Nonce 存储实例
 * 根据 isRedisConfigured() 自动选择 Redis 或 MapStore
 * Redis 版抛 RedisRequiredError，MapStore 版抛 TypeError
 * @param {number} [ttlSeconds=60] - Nonce 过期时间（秒）
 * @returns {{ checkAndMark: (nonce: string) => Promise<boolean>, destroy: () => void }}
 */
function createNonceStore(ttlSeconds = DEFAULT_TTL) {
  const useRedis = isRedisConfigured();

  if (useRedis) {
    return _createRedisNonceStore(ttlSeconds);
  }
  return _createMapNonceStore(ttlSeconds);
}

/**
 * Redis 版：通过 Lua 脚本保证原子性，支持多实例部署
 */
function _createRedisNonceStore(ttlSeconds) {
  let _scriptSha = null;

  return {
    async checkAndMark(nonce) {
      const key = `nonce:${nonce}`;
      return RedisStore.call(
        'nonce',
        async redis => {
          if (!_scriptSha) {
            try {
              _scriptSha = await redis.scriptLoad(CHECK_AND_MARK_SCRIPT);
            } catch {
              _scriptSha = null;
            }
          }

          try {
            if (_scriptSha) {
              return (
                (await redis.evalSha(_scriptSha, {
                  keys: [key],
                  arguments: [String(ttlSeconds)]
                })) === 1
              );
            }
          } catch (shaErr) {
            if (shaErr.message?.includes('NOSCRIPT')) {
              _scriptSha = null;
            } else {
              throw shaErr;
            }
          }

          return (
            (await redis.eval(CHECK_AND_MARK_SCRIPT, {
              keys: [key],
              arguments: [String(ttlSeconds)]
            })) === 1
          );
        },
        REDIS_OP_TIMEOUT
      );
    },

    destroy() {
      _scriptSha = null;
    }
  };
}

/**
 * MapStore 版：同步操作，单进程内无并发问题
 * 不支持多实例部署（多个进程共享需要 Redis）
 *
 * 安全性说明：
 * - checkAndMark 虽然是 async 函数，但内部无 await，实际是同步执行
 * - Node.js 单线程模型下，同步的 get + set 之间不会有其他代码插入
 * - 先 getDel 再 set 确保即使有极端情况也不会残留旧值
 */
function _createMapNonceStore(ttlSeconds) {
  // 配置 nonce 命名空间上限，config.ttl 作为默认值，显式传参的 set 不受影响
  MapStore.config('nonce', {
    maxSize: 100000,
    ttl: ttlSeconds,
    cleanupInterval: 300_000,
    batchSize: 5000,
    timerBatchSize: 10000
  });

  return {
    /**
     * 检查并标记 nonce
     * @param {string} nonce
     * @returns {Promise<boolean>} true = 已重复（重放），false = 首次使用
     */
    async checkAndMark(nonce) {
      // Node.js 单线程模型：同步的 get + set 之间无竞态
      const exists = MapStore.get('nonce', nonce);
      if (exists) return true;
      MapStore.set('nonce', nonce, 1, ttlSeconds);
      return false;
    },

    destroy() {
      MapStore.destroy('nonce');
    }
  };
}

export { createNonceStore, _createMapNonceStore, _createRedisNonceStore };
