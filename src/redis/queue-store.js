/* eslint-disable no-console */

/**
 * FIFO 消息队列
 *
 * 支持 MapStore 和 Redis 双后端：
 * - MapStore（默认）：内存存储，不依赖 Redis，适合单进程
 * - Redis：通过 getStore 使用 Redis，适合多实例共享
 *
 * 内部结构（基于 MapStore 的 prefix 隔离 / Redis 的 key 前缀）：
 *   prefix:meta     → { head, tail }  头尾指针
 *   prefix:data:N   → { data, createdAt } 消息内容 + 创建时间戳
 *
 * @example
 * const queue = createQueue('notify', { maxSize: 100000 });
 * queue.push({ id: 1, text: 'hello' });
 * const msg = queue.shift(); // { data: { id: 1, text: 'hello' }, createdAt: 1745678901234 }
 *
 * @author yijiu2025
 * @since 2026-07-25
 */

import { MapStore } from './map-store.js';
import { getStore } from './get-store.js';
import { isRedisConfigured } from './utils.js';

/**
 * 创建 FIFO 消息队列
 * @param {string} prefix - 队列命名空间
 * @param {object} [options]
 * @param {number} [options.maxSize=100000] - 队列最大长度
 * @param {number} [options.dataTtl=0] - 数据条目 TTL（秒），0 永不过期
 * @param {'map'|'redis'} [options.backend='map'] - 存储后端
 * @param {number} [options.timeout=3000] - Redis 操作超时（毫秒），仅 Redis 后端有效
 * @returns {{ push: Function, tryPush: Function, shift: Function, peek: Function, list: Function, length: Function, usage: Function, clear: Function }}
 */
function createQueue(prefix, options = {}) {
  const { maxSize = 100000, dataTtl = 0, backend = 'map', timeout = 3000 } = options;

  if (backend === 'redis') {
    if (!isRedisConfigured()) {
      throw new Error(`Queue[${prefix}]: Redis 未配置，无法使用 Redis 后端`);
    }
    return _createRedisQueue(prefix, maxSize, dataTtl, timeout);
  }
  return _createMapQueue(prefix, maxSize, dataTtl);
}

// ===== MapStore 版 =====

function _createMapQueue(prefix, maxSize, dataTtl) {
  MapStore.config(prefix, {
    maxSize: maxSize + 1000,
    ttl: 0
  });

  function _meta() {
    const m = MapStore.get(prefix, 'meta');
    if (m) return m;
    const init = { head: 0, tail: 0 };
    MapStore.set(prefix, 'meta', init);
    return init;
  }

  return {
    push(data) {
      const m = _meta();
      const len = m.tail - m.head;

      if (len >= maxSize) {
        if (MapStore.sizeValid(prefix, false) <= 1) {
          m.head = 0;
          m.tail = 0;
        } else {
          throw new TypeError(`Queue[${prefix}]: 已达上限 ${maxSize}，拒绝写入`);
        }
      }

      MapStore.set(prefix, `data:${m.tail}`, { data, createdAt: Date.now() }, dataTtl);
      m.tail++;
      MapStore.set(prefix, 'meta', m);
      return m.tail - m.head;
    },

    tryPush(data) {
      try {
        this.push(data);
        return true;
      } catch {
        return false;
      }
    },

    shift() {
      const m = _meta();
      let skipped = 0;
      while (m.head < m.tail) {
        const key = `data:${m.head}`;
        const item = MapStore.get(prefix, key);
        MapStore.delete(prefix, key);
        m.head++;

        if (item !== null) {
          if (skipped > 0) {
            console.warn(`[Queue] ${prefix} shift 跳过 ${skipped} 个空洞索引`);
          }
          MapStore.set(prefix, 'meta', m);
          return item;
        }
        skipped++;
      }

      if (skipped > 0) {
        console.warn(`[Queue] ${prefix} shift 全部跳过 ${skipped} 个空洞，重置指针`);
      }
      m.head = 0;
      m.tail = 0;
      MapStore.set(prefix, 'meta', m);
      return null;
    },

    peek() {
      const m = _meta();
      let i = m.head;
      while (i < m.tail) {
        const item = MapStore.get(prefix, `data:${i}`);
        if (item !== null) return item;
        i++;
      }
      return null;
    },

    list(limit = 0) {
      const m = _meta();
      const result = [];
      for (let i = m.head; i < m.tail; i++) {
        const item = MapStore.get(prefix, `data:${i}`);
        if (item !== null) {
          result.push(item);
          if (limit > 0 && result.length >= limit) break;
        }
      }
      return result;
    },

    length() {
      const m = _meta();
      return m.tail - m.head;
    },

    usage() {
      const used = this.length();
      const free = Math.max(0, maxSize - used);
      const percent = maxSize > 0 ? Math.round((used / maxSize) * 100) : 0;
      return { capacity: maxSize, used, free, percent };
    },

    clear() {
      MapStore.destroy(prefix);
      MapStore.config(prefix, { maxSize: maxSize + 1000, ttl: 0 });
    }
  };
}

// ===== Redis 版 =====

function _createRedisQueue(prefix, maxSize, dataTtl, timeout) {
  const store = getStore(prefix, { timeout });

  // meta 本地缓存，减少 Redis 往返
  let _metaCache = null;

  async function _meta() {
    if (_metaCache) return _metaCache;
    const m = await store.get('meta');
    if (m) {
      _metaCache = m;
      return m;
    }
    const init = { head: 0, tail: 0 };
    await store.set('meta', init);
    _metaCache = init;
    return init;
  }

  function _saveMeta(m) {
    _metaCache = m;
  }

  return {
    async push(data) {
      const m = await _meta();
      const len = m.tail - m.head;

      if (len >= maxSize) {
        // 先检查实际数据量，如果只剩 meta 说明队列已空，重置指针
        const remaining = await store.size();
        if (remaining <= 1) {
          m.head = 0;
          m.tail = 0;
        } else {
          throw new TypeError(`Queue[${prefix}]: 已达上限 ${maxSize}，拒绝写入`);
        }
      }

      // MULTI 原子写入：data + meta 在一次往返中完成
      await store.call(redis => {
        const multi = redis
          .multi()
          .set(`data:${m.tail}`, JSON.stringify({ data, createdAt: Date.now() }))
          .set('meta', JSON.stringify({ head: m.head, tail: m.tail + 1 }));
        if (dataTtl > 0) multi.expire(`data:${m.tail}`, dataTtl);
        return multi.exec();
      });
      m.tail++;
      _saveMeta({ head: m.head, tail: m.tail });
      return m.tail - m.head;
    },

    async tryPush(data) {
      try {
        await this.push(data);
        return true;
      } catch {
        return false;
      }
    },

    async shift() {
      const m = await _meta();
      let skipped = 0;
      while (m.head < m.tail) {
        const key = `data:${m.head}`;
        const item = await store.getDel(key);
        m.head++;

        if (item !== null) {
          if (skipped > 0) {
            console.warn(`[Queue] ${prefix} shift 跳过 ${skipped} 个空洞索引`);
          }
          await store.set('meta', m);
          _saveMeta(m);
          return item;
        }
        skipped++;
      }

      if (skipped > 0) {
        console.warn(`[Queue] ${prefix} shift 全部跳过 ${skipped} 个空洞，重置指针`);
      }
      m.head = 0;
      m.tail = 0;
      await store.set('meta', m);
      _saveMeta(m);
      return null;
    },

    async peek() {
      const m = await _meta();
      let i = m.head;
      while (i < m.tail) {
        const item = await store.get(`data:${i}`);
        if (item !== null) return item;
        i++;
      }
      return null;
    },

    async list(limit = 0) {
      const m = await _meta();
      const result = [];
      for (let i = m.head; i < m.tail; i++) {
        const item = await store.get(`data:${i}`);
        if (item !== null) {
          result.push(item);
          if (limit > 0 && result.length >= limit) break;
        }
      }
      return result;
    },

    async length() {
      const m = await _meta();
      return m.tail - m.head;
    },

    async usage() {
      const used = await this.length();
      const free = Math.max(0, maxSize - used);
      const percent = maxSize > 0 ? Math.round((used / maxSize) * 100) : 0;
      return { capacity: maxSize, used, free, percent };
    },

    async clear() {
      _metaCache = null;
      await store.destroy();
    }
  };
}

export { createQueue };
