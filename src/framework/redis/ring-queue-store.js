/**
 * 循环队列（Ring Queue）
 *
 * 固定大小的 FIFO 队列，满时自动覆盖最旧数据。
 * 适合日志缓冲、操作历史、事件记录等"只保留最近 N 条"的场景。
 *
 * 支持 MapStore 和 Redis 双后端：
 * - MapStore（默认）：内存存储，不依赖 Redis
 * - Redis：通过 getStore 使用 Redis，适合多实例共享
 *
 * 内部结构：
 *   prefix:meta     → { head, tail, count }  头尾指针 + 有效条目数
 *   prefix:data:N   → { data, createdAt }     消息内容
 *
 * @example
 * const ring = createRingQueue('audit', { maxSize: 100 });
 * ring.push({ event: 'login', user: 'alice' });
 * ring.push({ event: 'logout', user: 'alice' });
 * ring.toArray(); // [{ data: {...}, createdAt: ... }, ...]
 * ring.length();  // 2
 *
 * @author yijiu2025
 * @since 2026-08-05
 */

import { MapStore } from './map-store.js';
import { getStore } from './get-store.js';
import { isRedisConfigured } from './utils.js';

/**
 * 创建循环队列
 * @param {string} prefix - 队列命名空间
 * @param {object} [options]
 * @param {number} [options.maxSize=1000] - 最大条目数，满时自动覆盖最旧
 * @param {number} [options.dataTtl=0] - 数据 TTL（秒），0 永不过期
 * @param {'map'|'redis'} [options.backend='map'] - 存储后端
 * @param {number} [options.timeout=3000] - Redis 操作超时（毫秒）
 * @returns {{ push: Function, shift: Function, toArray: Function, length: Function, usage: Function, clear: Function }}
 */
function createRingQueue(prefix, options = {}) {
  const { maxSize = 1000, dataTtl = 0, backend = 'map', timeout = 3000 } = options;

  // 环形指针在 Lua 里做 `% maxSize`：0 会让脚本直接报错，负数会让 head/tail 变成负数索引。
  if (!Number.isInteger(maxSize) || maxSize <= 0) {
    throw new TypeError(`RingQueue[${prefix}]: maxSize 必须是正整数（收到 ${maxSize}）`);
  }

  if (backend === 'redis') {
    if (!isRedisConfigured()) {
      throw new Error(`RingQueue[${prefix}]: Redis 未配置，无法使用 Redis 后端`);
    }
    return _createRedisRing(prefix, maxSize, dataTtl, timeout);
  }
  return _createMapRing(prefix, maxSize, dataTtl);
}

// ===== MapStore 版 =====

function _createMapRing(prefix, maxSize, dataTtl) {
  MapStore.config(prefix, {
    maxSize: maxSize + 100,
    ttl: 0
  });

  function _meta() {
    const m = MapStore.get(prefix, 'meta');
    if (m) return m;
    const init = { head: 0, tail: 0, count: 0 };
    MapStore.set(prefix, 'meta', init);
    return init;
  }

  return {
    /**
     * 写入数据，满时自动覆盖最旧条目
     * 注意：被覆盖的旧数据可能仍在存储中残留，但不会被 toArray 访问到
     * @param {any} data
     * @returns {number} 当前有效条目数
     */
    push(data) {
      const m = _meta();

      MapStore.set(prefix, `data:${m.tail}`, { data, createdAt: Date.now() }, dataTtl);
      m.tail = (m.tail + 1) % maxSize;

      if (m.count >= maxSize) {
        // 队列已满，覆盖最旧
        m.head = (m.head + 1) % maxSize;
      } else {
        m.count++;
      }

      MapStore.set(prefix, 'meta', m);
      return m.count;
    },

    /**
     * 取出最旧条目（非必须，主要用于主动消费）
     * @returns {{ data: any, createdAt: number }|null}
     */
    shift() {
      const m = _meta();
      if (m.count === 0) return null;

      const key = `data:${m.head}`;
      const item = MapStore.get(prefix, key);
      MapStore.delete(prefix, key);
      m.head = (m.head + 1) % maxSize;
      m.count--;
      MapStore.set(prefix, 'meta', m);
      return item;
    },

    /**
     * 按从旧到新的顺序返回所有条目
     * 注意：count 是逻辑值，外部删除或 TTL 过期可能导致实际返回条数少于 count
     * @param {number} [limit=0] - 返回条数，0 返回全部
     * @returns {Array<{ data: any, createdAt: number }>}
     */
    toArray(limit = 0) {
      const m = _meta();
      if (m.count === 0) return [];

      const result = [];
      for (let i = 0; i < m.count; i++) {
        const idx = (m.head + i) % maxSize;
        const item = MapStore.get(prefix, `data:${idx}`);
        if (item !== null) {
          result.push(item);
          if (limit > 0 && result.length >= limit) break;
        }
      }
      return result;
    },

    /**
     * 当前有效条目数（逻辑值，不精确反映存储中的实际条目数）
     * @returns {number}
     */
    length() {
      return _meta().count;
    },

    /**
     * 容量使用情况（基于逻辑 count，非实际存储条目数）
     * @returns {{ capacity: number, used: number, free: number, percent: number }}
     */
    usage() {
      const used = this.length();
      return {
        capacity: maxSize,
        used,
        free: maxSize - used,
        percent: maxSize > 0 ? Math.round((used / maxSize) * 100) : 0
      };
    },

    /**
     * 清空所有数据（保留配置）
     */
    clear() {
      MapStore.destroy(prefix);
      MapStore.config(prefix, { maxSize: maxSize + 100, ttl: 0 });
    }
  };
}

// ===== Redis 版 =====

/**
 * push：写 data → 推进 tail → 满则推进 head（覆盖最旧）→ 回写计数，全部在 Redis 内完成。
 * 环形的指针是「共享可变状态」，任何一步落到脚本外都会让两个实例把同一个 index 当成
 * 不同的落点（互相覆盖）或把 count 算成 2 倍。
 */
const PUSH_SCRIPT = `
  local metaRaw = redis.call('GET', KEYS[1])
  local m = cjson.decode(metaRaw or '{"head":0,"tail":0,"count":0}')
  local maxSize = tonumber(ARGV[1])
  local dkey = KEYS[2] .. m.tail
  redis.call('SET', dkey, ARGV[2])
  if tonumber(ARGV[3]) > 0 then
    redis.call('EXPIRE', dkey, tonumber(ARGV[3]))
  end
  m.tail = (m.tail + 1) % maxSize
  if m.count >= maxSize then
    m.head = (m.head + 1) % maxSize
  else
    m.count = m.count + 1
  end
  redis.call('SET', KEYS[1], cjson.encode(m))
  return m.count
`;

/** shift：取 head 条目 + 推进 head + 减 count 同一事务。 */
const SHIFT_SCRIPT = `
  local metaRaw = redis.call('GET', KEYS[1])
  if not metaRaw then
    return nil
  end
  local m = cjson.decode(metaRaw)
  if m.count <= 0 then
    return nil
  end
  local dkey = KEYS[2] .. m.head
  local val = redis.call('GET', dkey)
  if val then
    redis.call('DEL', dkey)
  end
  m.head = (m.head + tonumber(ARGV[1])) % tonumber(ARGV[1])
  m.count = m.count - 1
  redis.call('SET', KEYS[1], cjson.encode(m))
  return val or false
`;

function _createRedisRing(prefix, maxSize, dataTtl, timeout) {
  const store = getStore(prefix, { timeout });
  // 裸客户端不自动加前缀，key 必须手工拼全；store.get/set 则自动加，两边要一致。
  const metaKey = `${prefix}:meta`;
  const dataKeyPrefix = `${prefix}:data:`;

  /**
   * 每次读 Redis，不用进程内缓存：缓存会把本实例最后写入的 tail/count 当全局真相，
   * 其他实例写入后本地一写回就把它们的指针抹掉（`toArray` 直接少数据）。
   */
  async function _meta() {
    const m = await store.get('meta');
    return m || { head: 0, tail: 0, count: 0 };
  }

  return {
    async push(data) {
      const payload = JSON.stringify({ data, createdAt: Date.now() });
      const count = await store.call(redis =>
        redis.eval(PUSH_SCRIPT, {
          keys: [metaKey, dataKeyPrefix],
          arguments: [String(maxSize), payload, String(dataTtl)]
        })
      );
      return Number(count);
    },

    async shift() {
      const item = await store.call(redis =>
        redis.eval(SHIFT_SCRIPT, {
          keys: [metaKey, dataKeyPrefix],
          arguments: [String(maxSize)]
        })
      );
      return item ?? null;
    },

    async toArray(limit = 0) {
      const m = await _meta();
      if (m.count === 0) return [];

      const result = [];
      for (let i = 0; i < m.count; i++) {
        const idx = (m.head + i) % maxSize;
        const item = await store.get(`data:${idx}`);
        if (item !== null) {
          result.push(item);
          if (limit > 0 && result.length >= limit) break;
        }
      }
      return result;
    },

    async length() {
      return (await _meta()).count;
    },

    async usage() {
      const used = await this.length();
      return {
        capacity: maxSize,
        used,
        free: maxSize - used,
        percent: maxSize > 0 ? Math.round((used / maxSize) * 100) : 0
      };
    },

    async clear() {
      await store.destroy();
    }
  };
}

export { createRingQueue };
