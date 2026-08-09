/**
 * Redis 会话存储（单例模式）
 *
 * 基于 Redis 的临时数据存储，适用于验证码、登录凭证、扫码状态等。
 * 全局共用一个 RedisStore，通过 prefix 隔离命名空间。
 * Redis 不可用时抛出 RedisRequiredError，不使用内存降级。
 *
 * API 设计对标 MapStore，提供一致的接口：
 * - get/set/delete/has/ttl/expire 单键操作
 * - list/count 批量操作（SCAN 游标）
 * - destroy/clear 命名空间清理
 *
 * 所有 KV 方法支持可选的 timeout 参数，调用方可按需覆盖默认超时。
 *
 * @example
 * RedisStore.set('email_code', 'user@example.com', { code: '123456' }, 600);
 * const data = await RedisStore.get('email_code', 'user@example.com');
 * const exists = await RedisStore.has('email_code', 'user@example.com');
 * const remaining = await RedisStore.ttl('email_code', 'user@example.com');
 * await RedisStore.delete('email_code', 'user@example.com');
 * const keys = await RedisStore.list('email_code');
 * const total = await RedisStore.count('email_code');
 *
 * @author yijiu2025
 * @since 2026-07-25
 */

/* eslint-disable no-console */

import { RedisRequiredError } from './errors.js';
import {
  withTimeout as withTimeoutPromise,
  makeKey,
  getRedisClient,
  getBackupRedisClient,
  isBackupRedisReady,
  safeParse,
  serialize
} from './utils.js';

/** 单次 Redis 操作超时（毫秒） */
const REDIS_OP_TIMEOUT = 3000;

/** 是否启用 Redis 调试日志 */
const DEBUG = process.env.DEBUG_REDIS === 'true';

/** 可注入的日志器（由 plugin.js 初始化时设置） */
let _logger = null;

/** 缓存命中/未命中计数 */
let _cacheHits = 0;
let _cacheMisses = 0;

/** TTL 随机抖动范围（秒），防缓存雪崩，0 表示不抖动 */
let _ttlJitter = 0;

/**
 * 设置全局 TTL 随机抖动范围
 * @param {number} jitter - 抖动秒数，0 或负数表示关闭
 */
function setTtlJitter(jitter) {
  _ttlJitter = Number.isFinite(jitter) && jitter > 0 ? Math.floor(jitter) : 0;
}

/**
 * 获取缓存命中率统计
 * @returns {{ hits: number, misses: number, ratio: number }}
 */
function getCacheStats() {
  const total = _cacheHits + _cacheMisses;
  return {
    hits: _cacheHits,
    misses: _cacheMisses,
    ratio: total > 0 ? _cacheHits / total : 0
  };
}

/**
 * 设置日志器，替换默认的 console.log
 * @param {object} logger - 符合 Fastify log 接口的对象
 */
function setLogger(logger) {
  _logger = logger;
}

/**
 * 调试日志
 */
function _log(...args) {
  if (_logger) {
    _logger.debug({ module: 'RedisStore' }, args.map(String).join(' '));
  } else if (DEBUG) {
    console.log(...args);
  }
}

/**
 * 获取 Redis 客户端，支持主备切换
 * useBackup=true 时：主库优先 → 主库不可用时切备库 → 都不行抛错
 * @param {boolean} [useBackup] - true 时允许主库故障时降级到备库
 * @returns {import('redis').RedisClientType}
 * @throws {RedisRequiredError}
 */
function _getRedisClient(useBackup) {
  if (useBackup) {
    // 主库优先，主库不可用时降级到备库
    try {
      return getRedisClient();
    } catch {
      if (isBackupRedisReady()) return getBackupRedisClient();
      throw new RedisRequiredError('主备 Redis 均不可用', { operation: 'redis' });
    }
  }
  return getRedisClient();
}

/**
 * 获取当前 Redis 连接（带冷却检查）
 * @param {string} _operation - 操作名称（日志用）
 * @param {string} prefix - 命名空间
 * @param {boolean} [useBackup] - 是否使用备用 Redis
 * @throws {RedisRequiredError}
 */
function _getRedis(_operation, _prefix, useBackup) {
  return _getRedisClient(useBackup);
}

/**
 * 生成 key 匹配模式：prefix:*
 * @param {string} prefix
 * @returns {string}
 */
function _keyPattern(prefix) {
  return `${prefix}:*`;
}

/**
 * 统一包装 Redis 操作错误
 * 自动处理冷却、透传已有错误类型
 * @param {Error} err - 原始错误
 * @param {string} operation - 操作名称
 * @param {string} store - 前缀/命名空间
 * @param {string} [message] - 自定义错误消息
 * @throws {RedisRequiredError}
 * @throws {TypeError}
 */
function _wrapRedisError(err, operation, store, message) {
  if (err instanceof RedisRequiredError) throw err;
  if (err instanceof TypeError) throw err;
  throw new RedisRequiredError(message || `Redis ${operation} 失败: ${err.message}`, { operation, store });
}

/**
 * 参数校验
 * @throws {TypeError}
 */
function _validateInput(prefix, key, ttl) {
  if (!prefix || typeof prefix !== 'string') {
    throw new TypeError('RedisStore: prefix 必须是非空字符串');
  }
  if (key !== undefined && (!key || typeof key !== 'string')) {
    throw new TypeError('RedisStore: key 必须是非空字符串');
  }
  if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < 1)) {
    throw new TypeError('RedisStore: ttl 必须是正整数（秒）');
  }
}

/**
 * 执行 Redis 操作并添加超时保护
 * @param {import('redis').RedisClientType} redis
 * @param {Function} fn - Redis 操作函数
 * @param {number} [timeout=REDIS_OP_TIMEOUT]
 * @returns {Promise<any>}
 */
function withTimeout(redis, fn, timeout = REDIS_OP_TIMEOUT) {
  return withTimeoutPromise(fn(redis), timeout);
}

const RedisStore = {
  /**
   * 读取数据
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @returns {Promise<any>} 值，不存在返回 null
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async get(prefix, key, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('get', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      const raw = await withTimeout(redis, r => r.get(fullKey), timeout);
      if (raw === null) {
        _cacheMisses++;
        _log(`[RedisStore] GET ${fullKey} → 未命中`);
        return null;
      }
      _cacheHits++;
      const result = safeParse(raw);
      _log(`[RedisStore] GET ${fullKey} → 命中`);
      return result;
    } catch (err) {
      _wrapRedisError(err, 'get', prefix);
    }
  },

  /**
   * 写入数据
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {any} value - 值
   * @param {number} [ttl=600] - 过期时间（秒）
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @throws {RedisRequiredError} Redis 不可用时
   * @throws {TypeError} value 为 undefined 或不可序列化时
   */
  async set(prefix, key, value, ttl = 600, timeout, useBackup) {
    _validateInput(prefix, key, ttl);
    if (value === undefined) {
      throw new TypeError('RedisStore: value 不能为 undefined');
    }
    let serialized;
    try {
      serialized = serialize(value);
    } catch (err) {
      throw new TypeError(`RedisStore: value 序列化失败 — ${err.message}`, { cause: err });
    }
    const finalTtl = _ttlJitter > 0 ? ttl + Math.floor(Math.random() * (_ttlJitter + 1)) : ttl;
    const redis = _getRedis('set', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      await withTimeout(redis, r => r.set(fullKey, serialized, { EX: finalTtl }), timeout);
      _log(`[RedisStore] SET ${fullKey} TTL=${finalTtl}s`);
    } catch (err) {
      _wrapRedisError(err, 'set', prefix);
    }
  },

  /**
   * 删除数据
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async delete(prefix, key, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('delete', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      await withTimeout(redis, r => r.del(fullKey), timeout);
      _log(`[RedisStore] DEL ${fullKey}`);
    } catch (err) {
      _wrapRedisError(err, 'delete', prefix);
    }
  },

  /**
   * 判断 key 是否存在
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @returns {Promise<boolean>}
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async has(prefix, key, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('has', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      const exists = await withTimeout(redis, r => r.exists(fullKey), timeout);
      return exists === 1;
    } catch (err) {
      _wrapRedisError(err, 'has', prefix);
    }
  },

  /**
   * 获取剩余过期时间（兼容 Redis TTL 语义）
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @returns {Promise<number>} 剩余秒数，-1 无过期，-2 不存在
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async ttl(prefix, key, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('ttl', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      return await withTimeout(redis, r => r.ttl(fullKey), timeout);
    } catch (err) {
      _wrapRedisError(err, 'ttl', prefix);
    }
  },

  /**
   * 修改已存在 key 的过期时间
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {number} ttl - 过期时间（秒）
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @throws {RedisRequiredError} Redis 不可用时
   * @throws {TypeError} key 不存在时
   */
  async expire(prefix, key, ttl, timeout, useBackup) {
    _validateInput(prefix, key, ttl);
    const redis = _getRedis('expire', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      const result = await withTimeout(redis, r => r.expire(fullKey, ttl), timeout);
      if (!result) {
        throw new TypeError(`RedisStore: key 不存在 ${fullKey}`);
      }
    } catch (err) {
      _wrapRedisError(err, 'expire', prefix);
    }
  },

  /**
   * 列出指定命名空间下的键（使用 SCAN 游标，避免 KEYS 阻塞）
   * 注意：返回的键是完整 Redis key（含 prefix:），如需原始 key 请自行截取
   * @param {string} prefix - 命名空间
   * @param {number} [limit=100] - 返回条数上限，0 返回全部
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @returns {Promise<string[]>} 完整 Redis key 列表
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async list(prefix, limit = 100, timeout, useBackup) {
    _validateInput(prefix);
    const redis = _getRedis('list', prefix, useBackup);
    const pattern = _keyPattern(prefix);
    const keys = [];
    let cursor = 0;
    const deadline = Date.now() + (timeout ?? REDIS_OP_TIMEOUT);
    const MIN_REMAINING = 500;
    try {
      do {
        if (Date.now() + MIN_REMAINING >= deadline) {
          _log(`[RedisStore] LIST ${prefix} 达到总超时，返回部分结果`);
          break;
        }
        const remaining = deadline - Date.now();
        const [nextCursor, batch] = await withTimeoutPromise(
          redis.scan(cursor, { MATCH: pattern, COUNT: 100 }),
          remaining
        );
        cursor = nextCursor;
        for (const key of batch) {
          keys.push(key);
          if (limit > 0 && keys.length >= limit) {
            cursor = 0;
            break;
          }
        }
      } while (cursor !== 0);
      return keys;
    } catch (err) {
      _wrapRedisError(err, 'list', prefix);
    }
  },

  /**
   * 获取指定命名空间的条目数量
   * @param {string} prefix - 命名空间
   * @param {number} [limit=10000] - 扫描上限，避免大数据集长耗时
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @returns {Promise<number>} 条目数（达到上限时返回近似值）
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async size(prefix, limit = 10000, timeout, useBackup) {
    _validateInput(prefix);
    const redis = _getRedis('size', prefix, useBackup);
    const pattern = _keyPattern(prefix);
    let total = 0;
    let cursor = 0;
    const deadline = Date.now() + (timeout ?? REDIS_OP_TIMEOUT);
    const MIN_REMAINING = 500;
    try {
      do {
        if (Date.now() + MIN_REMAINING >= deadline) {
          _log(`[RedisStore] SIZE ${prefix} 达到总超时，返回近似值 ${total}`);
          break;
        }
        const remaining = deadline - Date.now();
        const [nextCursor, batch] = await withTimeoutPromise(
          redis.scan(cursor, { MATCH: pattern, COUNT: 1000 }),
          remaining
        );
        cursor = nextCursor;
        total += batch.length;
        if (total >= limit) break;
      } while (cursor !== 0);
      return total;
    } catch (err) {
      _wrapRedisError(err, 'size', prefix);
    }
  },

  /**
   * 销毁指定命名空间下所有数据
   * 使用 SCAN + DEL 逐步删除，避免 KEYS 阻塞
   * @param {string} prefix - 命名空间
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @returns {Promise<number>} 删除的键数量
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async destroy(prefix, timeout, useBackup) {
    _validateInput(prefix);
    const redis = _getRedis('destroy', prefix, useBackup);
    const pattern = _keyPattern(prefix);
    let deleted = 0;
    let cursor = 0;
    const deadline = Date.now() + (timeout ?? REDIS_OP_TIMEOUT);
    const MIN_REMAINING = 500;
    try {
      do {
        if (Date.now() + MIN_REMAINING >= deadline) {
          _log(`[RedisStore] DESTROY ${prefix} 达到总超时，已删除 ${deleted} 个键`);
          break;
        }
        const remaining = deadline - Date.now();
        const [nextCursor, batch] = await withTimeoutPromise(
          redis.scan(cursor, { MATCH: pattern, COUNT: 500 }),
          remaining
        );
        cursor = nextCursor;
        if (batch.length > 0) {
          const count = await withTimeoutPromise(redis.del(batch), remaining);
          deleted += count;
        }
      } while (cursor !== 0);
      _log(`[RedisStore] DESTROY ${prefix} → 删除 ${deleted} 个键`);
      return deleted;
    } catch (err) {
      _wrapRedisError(err, 'destroy', prefix);
    }
  },

  /**
   * 清空所有 RedisStore 数据
   * 使用 SCAN 遍历所有 key，按 prefix 筛选后批量删除
   * 注意：此操作不调用 FLUSHDB，仅删除符合 prefix:* 模式的键
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @returns {Promise<number>} 删除的键数量
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async clear(timeout, useBackup) {
    const redis = _getRedis('clear', '*', useBackup);
    let deleted = 0;
    let cursor = 0;
    const deadline = Date.now() + (timeout ?? REDIS_OP_TIMEOUT);
    const MIN_REMAINING = 500;
    try {
      do {
        if (Date.now() + MIN_REMAINING >= deadline) {
          _log(`[RedisStore] CLEAR 达到总超时，已删除 ${deleted} 个键`);
          break;
        }
        const remaining = deadline - Date.now();
        const [nextCursor, batch] = await withTimeoutPromise(
          redis.scan(cursor, { MATCH: '*:*', COUNT: 500 }),
          remaining
        );
        cursor = nextCursor;
        if (batch.length > 0) {
          const count = await withTimeoutPromise(redis.del(batch), remaining);
          deleted += count;
        }
      } while (cursor !== 0);
      _log(`[RedisStore] CLEAR → 删除 ${deleted} 个键`);
      return deleted;
    } catch (err) {
      _wrapRedisError(err, 'clear', '*');
    }
  },

  /**
   * 获取命名空间容量使用情况
   * Redis 模式下无固定容量上限，capacity 和 free 为 null
   * @param {string} prefix - 命名空间
   * @param {number} [scanLimit=10000] - 扫描上限，避免大数据集长耗时
   * @returns {Promise<{ capacity: null, used: number, free: null, percent: null }>}
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async usage(prefix, scanLimit = 10000, useBackup) {
    const used = await this.size(prefix, scanLimit, useBackup);
    return { capacity: null, used, free: null, percent: null };
  },

  /**
   * 原子读取并删除（一次性消费，带重放检测）
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {number} [timeout] - 超时毫秒，默认 3000
   * @returns {Promise<any>} 值，不存在或已删除返回 null
   * @throws {RedisRequiredError} Redis 不可用时
   */
  async getDel(prefix, key, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('getDel', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      const raw = await withTimeout(redis, r => r.getDel(fullKey), timeout);
      if (!raw) return null;
      return safeParse(raw);
    } catch (err) {
      _wrapRedisError(err, 'getDel', prefix);
    }
  },

  // ========== Hash 操作 ==========

  /**
   * 设置哈希字段
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {string} field - 字段名
   * @param {any} value - 字段值
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @throws {RedisRequiredError}
   */
  async hset(prefix, key, field, value, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('hset', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      await withTimeout(redis, r => r.hSet(fullKey, field, value), timeout);
      _log(`[RedisStore] HSET ${fullKey} ${field}`);
    } catch (err) {
      _wrapRedisError(err, 'hset', prefix);
    }
  },

  /**
   * 获取哈希字段
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {string} field - 字段名
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @returns {Promise<string|undefined>}
   * @throws {RedisRequiredError}
   */
  async hget(prefix, key, field, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('hget', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      return await withTimeout(redis, r => r.hGet(fullKey, field), timeout);
    } catch (err) {
      _wrapRedisError(err, 'hget', prefix);
    }
  },

  /**
   * 获取所有哈希字段
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @returns {Promise<object>}
   * @throws {RedisRequiredError}
   */
  async hgetall(prefix, key, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('hgetall', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      return await withTimeout(redis, r => r.hGetAll(fullKey), timeout);
    } catch (err) {
      _wrapRedisError(err, 'hgetall', prefix);
    }
  },

  /**
   * 删除哈希字段
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {string|string[]} fields - 字段名（可多个）
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @returns {Promise<number>} 删除的字段数量
   * @throws {RedisRequiredError}
   */
  async hdel(prefix, key, fields, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('hdel', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      return await withTimeout(redis, r => r.hDel(fullKey, ...fields), timeout);
    } catch (err) {
      _wrapRedisError(err, 'hdel', prefix);
    }
  },

  /**
   * 判断哈希字段是否存在
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {string} field - 字段名
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @returns {Promise<boolean>}
   * @throws {RedisRequiredError}
   */
  async hexists(prefix, key, field, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('hexists', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      return await withTimeout(redis, r => r.hExists(fullKey, field), timeout);
    } catch (err) {
      _wrapRedisError(err, 'hexists', prefix);
    }
  },

  // ========== 通用 Redis 操作 ==========

  /**
   * 判断 key 是否存在
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @returns {Promise<boolean>}
   * @throws {RedisRequiredError}
   */
  async exists(prefix, key, timeout, useBackup) {
    _validateInput(prefix, key);
    const redis = _getRedis('exists', prefix, useBackup);
    const fullKey = makeKey(prefix, key);
    try {
      const result = await withTimeout(redis, r => r.exists(fullKey), timeout);
      return result === 1;
    } catch (err) {
      _wrapRedisError(err, 'exists', prefix);
    }
  },

  /**
   * Redis SCAN 命令（底层游标扫描）
   * @param {string} prefix - 命名空间
   * @param {number} cursor - 游标
   * @param {object} [opts] - SCAN 选项
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @returns {Promise<[number, string[]]>} [nextCursor, keys]
   * @throws {RedisRequiredError}
   */
  async scan(prefix, cursor, opts, timeout, useBackup) {
    _validateInput(prefix);
    const redis = _getRedis('scan', prefix, useBackup);
    const match = opts?.MATCH ? makeKey(prefix, opts.MATCH) : undefined;
    try {
      return await withTimeout(redis, r => r.scan(cursor, { ...opts, MATCH: match }), timeout);
    } catch (err) {
      _wrapRedisError(err, 'scan', prefix);
    }
  },

  /**
   * 通用 Redis 命令执行器
   * @param {string} prefix - 命名空间
   * @param {Function} fn - 接收 client 并返回 Promise 的函数
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @returns {Promise<any>}
   * @throws {RedisRequiredError}
   */
  async call(prefix, fn, timeout, useBackup) {
    const redis = _getRedis('call', prefix, useBackup);
    try {
      return await withTimeout(redis, fn, timeout);
    } catch (err) {
      _wrapRedisError(err, 'call', prefix);
    }
  },

  // ========== 批量操作 ==========

  /**
   * 批量读取（MGET）
   * @param {string} prefix - 命名空间
   * @param {string[]} keys - 键数组
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @returns {Promise<any[]>}
   * @throws {RedisRequiredError}
   */
  async mget(prefix, keys, timeout, useBackup) {
    _validateInput(prefix);
    if (!Array.isArray(keys)) throw new TypeError('RedisStore: keys 必须是数组');
    const redis = _getRedis('mget', prefix, useBackup);
    const fullKeys = keys.map(k => makeKey(prefix, k));
    try {
      const raw = await withTimeout(redis, r => r.mGet(fullKeys), timeout);
      return raw.map(v => (v === null ? null : safeParse(v)));
    } catch (err) {
      _wrapRedisError(err, 'mget', prefix);
    }
  },

  /**
   * 批量写入（MSET），所有 key 共享同一 TTL
   * @param {string} prefix - 命名空间
   * @param {Array<[string, any]>} entries - [key, value] 数组
   * @param {number} [ttl=600] - 过期时间（秒）
   * @param {number} [timeout] - 超时毫秒
   * @param {boolean} [useBackup] - 是否使用备用 Redis
   * @throws {RedisRequiredError}
   */
  async mset(prefix, entries, ttl = 600, timeout, useBackup) {
    _validateInput(prefix);
    if (!Array.isArray(entries)) throw new TypeError('RedisStore: entries 必须是数组');
    for (const item of entries) {
      if (!Array.isArray(item) || item.length < 2) {
        throw new TypeError('RedisStore: entries 每项必须是 [key, value] 数组');
      }
    }
    const redis = _getRedis('mset', prefix, useBackup);
    const kvPairs = entries.flatMap(([k, v]) => [makeKey(prefix, k), serialize(v)]);
    try {
      await withTimeout(redis, r => r.mSet(kvPairs), timeout);
      // 逐 key 设置 TTL（Pipeline 批量，一次往返）
      if (ttl > 0) {
        const pipe = redis.multi();
        for (const [k] of entries) {
          pipe.expire(makeKey(prefix, k), ttl);
        }
        await withTimeout(pipe, p => p.exec(), timeout);
      }
    } catch (err) {
      _wrapRedisError(err, 'mset', prefix);
    }
  }
};

/**
 * 创建 Redis 模式的 store 对象
 * 所有操作委托给 RedisStore，useBackup 控制主备切换
 * @param {string} resolvedPrefix - 已解析的 key 前缀
 * @param {number} timeout - 操作超时（毫秒）
 * @param {boolean} [useBackup] - 是否允许降级到备用 Redis
 */
function getRedisStore(resolvedPrefix, timeout, useBackup) {
  const store = {
    // ========== KV 操作 ==========
    get: key => RedisStore.get(resolvedPrefix, key, timeout, useBackup),
    set: (key, value, ttl) => RedisStore.set(resolvedPrefix, key, value, ttl, timeout, useBackup),
    delete: key => RedisStore.delete(resolvedPrefix, key, timeout, useBackup),
    has: key => RedisStore.has(resolvedPrefix, key, timeout, useBackup),
    ttl: key => RedisStore.ttl(resolvedPrefix, key, timeout, useBackup),
    expire: (key, ttl) => RedisStore.expire(resolvedPrefix, key, ttl, timeout, useBackup),
    getDel: key => RedisStore.getDel(resolvedPrefix, key, timeout, useBackup),

    // ========== 批量操作 ==========
    list: (limit = 100) => RedisStore.list(resolvedPrefix, limit, timeout, useBackup),
    size: (limit = 10000) => RedisStore.size(resolvedPrefix, limit, timeout, useBackup),
    sizeValid: () => RedisStore.size(resolvedPrefix, 10000, timeout, useBackup),
    usage: scanLimit => RedisStore.usage(resolvedPrefix, scanLimit, useBackup),
    mget: keys => RedisStore.mget(resolvedPrefix, keys, timeout),
    mset: (entries, ttl) => RedisStore.mset(resolvedPrefix, entries, ttl, timeout),
    destroy: () => RedisStore.destroy(resolvedPrefix, timeout, useBackup),
    clear: () => RedisStore.clear(timeout, useBackup),
    config: () => {},

    // ========== Hash 操作 ==========
    hset: (key, field, value) => RedisStore.hset(resolvedPrefix, key, field, value, timeout, useBackup),
    hget: (key, field) => RedisStore.hget(resolvedPrefix, key, field, timeout, useBackup),
    hgetall: key => RedisStore.hgetall(resolvedPrefix, key, timeout, useBackup),
    hdel: (key, ...fields) => RedisStore.hdel(resolvedPrefix, key, fields, timeout, useBackup),
    hexists: (key, field) => RedisStore.hexists(resolvedPrefix, key, field, timeout, useBackup),

    // ========== 通用 Redis 操作 ==========
    exists: key => RedisStore.exists(resolvedPrefix, key, timeout, useBackup),
    scan: (cursor, opts) => RedisStore.scan(resolvedPrefix, cursor, opts, timeout, useBackup),
    get redis() {
      return _getRedisClient(useBackup);
    },
    call: (fn, opTimeout) => RedisStore.call(resolvedPrefix, fn, opTimeout ?? timeout, useBackup),
    // ========== 后端类型标记（用于缓存失效判断） ==========
    _backend: 'redis'
  };

  // Proxy 自动转发未定义的命令到 Redis 客户端
  // 如 store.hlen('key') → client.hLen('key')
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      try {
        const client = _getRedisClient(useBackup);
        const val = client[prop];
        return typeof val === 'function' ? (...args) => val.apply(client, args) : val;
      } catch {
        return undefined;
      }
    }
  });
}

export { RedisStore, getRedisStore, setLogger, getCacheStats, setTtlJitter };
