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
import { isRedisConfigured, safeParse } from './utils.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.redis.queue-store');

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

  if (!Number.isInteger(maxSize) || maxSize <= 0) {
    throw new TypeError(`Queue[${prefix}]: maxSize 必须是正整数（收到 ${maxSize}）`);
  }

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
            log.warn(`[Queue] ${prefix} shift 跳过 ${skipped} 个空洞索引`);
          }
          MapStore.set(prefix, 'meta', m);
          return item;
        }
        skipped++;
      }

      if (skipped > 0) {
        log.warn(`[Queue] ${prefix} shift 全部跳过 ${skipped} 个空洞，重置指针`);
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

/** push：读 meta → 上限检查 → 写 data → 自增 tail，全部在 Redis 内一步完成。 */
const PUSH_SCRIPT = `
  local metaRaw = redis.call('GET', KEYS[1])
  local m = cjson.decode(metaRaw or '{"head":0,"tail":0}')
  local len = m.tail - m.head
  if len >= tonumber(ARGV[1]) then
    return -1
  end
  local dkey = KEYS[2] .. m.tail
  redis.call('SET', dkey, ARGV[2])
  if tonumber(ARGV[3]) > 0 then
    redis.call('EXPIRE', dkey, tonumber(ARGV[3]))
  end
  m.tail = m.tail + 1
  redis.call('SET', KEYS[1], cjson.encode(m))
  return m.tail - m.head
`;

/**
 * shift：读 meta → 逐个 index 取值并前移 head（跳过 TTL 空洞）→ 写回 meta。
 * 指针推进必须与取值同一事务，否则两个消费者会各自从同一 head 取值、各自写回 head+1，
 * 其中一个消息被读走但 head 只前进一格；更糟的是把**过期的旧 tail** 写回 Redis，
 * 直接截断其他实例刚 push 的消息（消息在 Redis 里存在但指针永远走不到）。
 */
const SHIFT_SCRIPT = `
  local metaRaw = redis.call('GET', KEYS[1])
  if not metaRaw then
    return nil
  end
  local m = cjson.decode(metaRaw)
  if m.head >= m.tail then
    return nil
  end
  while m.head < m.tail do
    local dkey = KEYS[2] .. m.head
    m.head = m.head + 1
    local val = redis.call('GET', dkey)
    if val then
      redis.call('DEL', dkey)
      redis.call('SET', KEYS[1], cjson.encode(m))
      return val
    end
  end
  m.head = 0
  m.tail = 0
  redis.call('SET', KEYS[1], cjson.encode(m))
  return nil
`;

function _createRedisQueue(prefix, maxSize, dataTtl, timeout) {
  const store = getStore(prefix, { timeout });

  // meta/data key 必须带 prefix：store.call 的客户端是裸客户端，不会自动加前缀，
  // 而 store.get/set 会自动加。两边不统一就会出现「push 写进去、shift 读不到」。
  const metaKey = `${prefix}:meta`;
  const dataKeyPrefix = `${prefix}:data:`;

  /**
   * 读 meta：不再使用进程内缓存。缓存会把「本实例最后一次写入的 tail」当成全局真相，
   * 其他实例 push 之后本地 shift 一写回就把它们的消息指针抹掉。多实例下每次读 Redis 是
   * 唯一正确的做法（GET 的成本远低于丢消息）。
   */
  async function _meta() {
    const m = await store.get('meta');
    return m || { head: 0, tail: 0 };
  }

  return {
    async push(data) {
      const payload = JSON.stringify({ data, createdAt: Date.now() });

      const result = await store.call(redis =>
        redis.eval(PUSH_SCRIPT, {
          keys: [metaKey, dataKeyPrefix],
          arguments: [String(maxSize), payload, String(dataTtl)]
        })
      );

      if (Number(result) === -1) {
        throw new TypeError(`Queue[${prefix}]: 已达上限 ${maxSize}，拒绝写入`);
      }
      return Number(result);
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
      const item = await store.call(redis =>
        redis.eval(SHIFT_SCRIPT, {
          keys: [metaKey, dataKeyPrefix],
          arguments: []
        })
      );
      // 🔴 必须 parse：`push` 写进 Redis 的是 `JSON.stringify({ data, createdAt })`，
      //    Lua 返回的是**原始字符串**；MapStore 版存的本来就是对象，直接返回。
      //    不 parse 时 Redis 后端的 `shift()` 永远返回字符串，调用方读 `msg.data` 得到
      //    undefined —— 表现为"消息消费到了，但内容全是空的"，而且不报错。
      //    同文件的 `peek()` / `list()` 走 `store.get` 已被 safeParse 过，只有这里走 Lua。
      return safeParse(item);
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
      await store.destroy();
    }
  };
}

export { createQueue };
