/**
 * Redis 存储层运行契约测试
 *
 * ⚠️ 为什么要重写（AUDIT-REPORT-2026-09-15 🟡-7）：
 * 本文件的前身**没有 import 任何实现**：它自己在用例里 new 一个 Map、拼一个 key 字符串、
 * 断言这个字符串等于自己刚写的那串（`const key = \`session:${id}\`` 然后 `expect(key).toBe('session:abc123')`），
 * 甚至连"Lua 脚本原子性"都是断言一段**写死在测试里的字符串**是否包含 `EXISTS`。
 * 这类用例恒真，对 `framework/redis` 真身零覆盖，却让测试报告看起来是绿的。
 *
 * 现在改为对真身做契约断言，聚焦「存储层对外承诺的语义」——尤其是那些**静默失效**的形态：
 *   - 命名空间隔离：`getStore('user_sessions')` 与 `getStore('userSessions')` 是两套数据。
 *     历史事故：两处命名空间字符串不一致，注销时的会话清理**静默零执行**（既不报错也不生效）。
 *   - 能力边界：MapStore（无 Redis 时的降级实现）对 hash / 有序集合操作**抛 TypeError**，
 *     而不是返回 undefined —— 否则调用方会在 try/catch 里吞掉，索引永远写不进去。
 *   - 一次性消费：getDel 必须"读走即删"，否则重放会通过。
 *
 * Redis 特有的多实例原子性由 `nonce-store.test.js` / `lock-store.test.js` / `queue-store.test.js`
 * / `ring-queue-store.test.js` / `stream-store.test.js` 覆盖，本文件不重复。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-15 重写为真身契约测试（🟡-7）
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { getStore, MapStore } from '../framework/redis/index.js';

/** 用例用过的命名空间，逐个销毁，避免用例间通过共享静态存储互相污染 */
const usedPrefixes = new Set();

function freshStore(prefix, options) {
  usedPrefixes.add(prefix);
  MapStore.destroy(prefix);
  return getStore(prefix, options);
}

afterEach(() => {
  for (const p of usedPrefixes) MapStore.destroy(p);
  usedPrefixes.clear();
  jest.useRealTimers();
});

describe('Redis 存储层：后端选择与命名空间隔离', () => {
  it('无 Redis 配置时自动降级到 MapStore（firewall 访问层依赖的 fail-open 底座）', () => {
    const store = freshStore('ops-backend');
    expect(store._backend).toBe('map');
  });

  it('命名空间隔离：user_sessions 与 userSessions 是两套数据', async () => {
    const snake = freshStore('user_sessions');
    const camel = freshStore('userSessions');

    await snake.set('sid:1', 'snake-value');

    // 历史事故：两处命名空间字符串不一致导致清理静默零执行。名字只差大小写与下划线，
    // 一旦被"顺手统一"成同一个串，这条断言会立刻失败。
    expect(await snake.get('sid:1')).toBe('snake-value');
    expect(await camel.get('sid:1')).toBeNull();
  });

  it('同一命名空间的多个句柄共享底层数据，不同命名空间互不可见', async () => {
    const a = freshStore('ops-share');
    await a.set('k', 'v');

    const b = getStore('ops-share'); // 新句柄、同一命名空间
    expect(await b.get('k')).toBe('v');
    expect(await getStore('ops-other').get('k')).toBeNull();
    usedPrefixes.add('ops-other');
  });

  it('prefix 非字符串直接抛 TypeError（防脏输入静默造出新命名空间）', () => {
    expect(() => getStore(123)).toThrow(TypeError);
    expect(() => getStore({})).toThrow(TypeError);
  });

  it('空 prefix 归一化为 default 命名空间（与不传 prefix 等价）', async () => {
    const empty = freshStore('');
    await empty.set('k', 'v');
    expect(await getStore('').get('k')).toBe('v');
  });

  it('setPrefix 链式拼接子命名空间（aaa.setPrefix("second") → aaa:second:key）', async () => {
    const first = freshStore('ops-first');
    const second = first.setPrefix('second');
    usedPrefixes.add('ops-first:second');

    await second.set('k', 'v');
    // 子命名空间的数据对父命名空间不可见，反之亦然
    expect(await second.get('k')).toBe('v');
    expect(await first.get('k')).toBeNull();
  });
});

describe('Redis 存储层：KV 语义', () => {
  it('set / get / has / delete 基本语义', async () => {
    const store = freshStore('ops-kv');

    await store.set('k1', { nested: true });
    expect(await store.get('k1')).toEqual({ nested: true });
    expect(await store.has('k1')).toBe(true);

    await store.delete('k1');
    expect(await store.has('k1')).toBe(false);
    expect(await store.get('k1')).toBeNull();
  });

  it('写入 undefined 抛 TypeError（而不是存进去之后读到 null 分不清）', async () => {
    const store = freshStore('ops-undef');
    await expect(store.set('k', undefined)).rejects.toThrow(TypeError);
  });

  it('getDel 是"读走即删"：第二次读到 null（一次性令牌的底座）', async () => {
    const store = freshStore('ops-getdel');
    await store.set('once', 'payload');

    expect(await store.getDel('once')).toBe('payload');
    expect(await store.getDel('once')).toBeNull();
    expect(await store.has('once')).toBe(false);
  });

  it('带 TTL 的写入过期后读不到，过期时间由 ttl() 反映', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    const store = freshStore('ops-ttl');

    await store.set('k', 'v', 60);
    expect(await store.get('k')).toBe('v');
    expect(await store.ttl('k')).toBeGreaterThan(0);
    expect(await store.ttl('k')).toBeLessThanOrEqual(60);

    jest.setSystemTime(new Date('2026-01-01T00:02:00Z')); // 推进 2 分钟
    expect(await store.get('k')).toBeNull();
    expect(await store.has('k')).toBe(false);
  });

  it('mset / mget 批量写入与读取', async () => {
    const store = freshStore('ops-mset');
    await store.mset([
      ['a', 1],
      ['b', 2]
    ]);

    expect(await store.mget(['a', 'b'])).toEqual([1, 2]);
  });
});

describe('Redis 存储层：能力边界（降级实现必须「响亮地失败」）', () => {
  // 这些方法在 MapStore 下**返回 rejected Promise 而不是 undefined**：
  // 若返回 undefined，调用方 `await store.hset(...)` 会静默拿到 undefined，
  // 外面套的 try/catch 把 TypeError 吞掉 —— 索引写不进去却毫无痕迹（firewall 曾如此）。
  const redisOnlyMethods = [
    'hset',
    'hget',
    'hgetall',
    'hdel',
    'hexists',
    'exists',
    'scan',
    'call',
    'zAdd',
    'zCard',
    'zRangeByScore',
    'zRem'
  ];

  it.each(redisOnlyMethods)('MapStore 下的 %s 抛 TypeError 并说明原因', async method => {
    const store = freshStore('ops-cap');
    await expect(store[method]('a', 'b')).rejects.toThrow(TypeError);
  });

  it('抛出的错误信息点明"仅支持 Redis 模式"，便于排障时立刻定位', async () => {
    const store = freshStore('ops-cap-msg');
    await expect(store.zAdd('s', 1, 'm')).rejects.toThrow(/有序集合操作仅支持 Redis 模式/);
    await expect(store.call('GET', 'k')).rejects.toThrow(/无 Redis 客户端/);
  });
});
