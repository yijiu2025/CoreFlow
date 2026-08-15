# Redis 模块使用教程

## 快速开始

### 安装与配置

```env
# .env 文件
REDIS_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_password
```

### 基础用法

```js
import { getStore } from './redis/index.js';

// 获取一个存储实例（自动选择 Redis 或 MapStore）
const store = getStore('captcha', { timeout: 3000 });

// KV 操作
await store.set('user@example.com', { code: '123456' }, 600);
const data = await store.get('user@example.com');
await store.delete('user@example.com');
await store.has('user@example.com');
await store.ttl('user@example.com');
```

---

## 存储选择

### 统一存储工厂 `getStore`（推荐）

```js
// 自动选择：Redis 已配置 → RedisStore，否则 → MapStore
const store = getStore('captcha');

// 指定超时（毫秒）
const store = getStore('captcha', { timeout: 3000 });

// 主备模式：主库不通自动切备库
const store = getStore('rl', { backup: true });

// TTL 随机抖动防雪崩
const store = getStore('captcha', { ttlJitter: 60 });
```

### 链式子前缀

```js
const fw = getStore('fw');
const blocks = fw.setPrefix('block');   // fw:block:key
const whitelist = fw.setPrefix('allow'); // fw:allow:key
await blocks.set('ip:1.2.3.4', value);
```

### 未定义命令自动转发

```js
const store = getStore('fw');
await store.hlen('myhash');   // → client.hLen('fw:myhash')
await store.zAdd('ranking', { score: 1, value: 'a' });  // Proxy 自动转发
```

### 通用命令执行器

```js
const store = getStore('captcha');
await store.call(client => client.ping());
await store.call(client => client.zRange('key', 0, -1));
```

---

## 缓存模式

### Cache-Aside + 防击穿

```js
import { cacheThrough } from './redis/index.js';

// 热点数据查询：缓存命中直接返回，未命中加锁查 DB
const user = await cacheThrough(
  'user:1001',
  () => db.findUser(1001),   // 数据获取函数
  600,                        // TTL（秒）
  { prefix: 'user' }          // 缓存前缀
);

// 并发 100 个请求同时打这里，只有 1 个查 DB，其余等待后读缓存
```

### TTL 随机抖动防雪崩

```js
// 全局配置
import { setTtlJitter } from './redis/index.js';
setTtlJitter(60); // 所有 set 操作的 TTL 增加 0~60 秒随机值

// 或通过 getStore 配置
const store = getStore('captcha', { ttlJitter: 30 });
await store.set('key', value, 600); // 实际 TTL = 600 + random(0~30)
```

---

## 分布式锁

```js
import { createLock } from './redis/index.js';

const lock = createLock('task:sync-users', { ttl: 30000 });

// 非阻塞尝试
if (await lock.tryAcquire()) {
  try { await syncUsers(); } finally { await lock.release(); }
}

// 长时间任务 + 自动续期
const longLock = createLock('task:backup', { ttl: 60000 });
if (await longLock.tryAcquire()) {
  longLock.startRenew();  // 每 20s 自动续期
  try { await backupDatabase(); } finally {
    longLock.stopRenew();
    await longLock.release();
  }
}

// 阻塞等待（最多 10s）
if (await lock3.acquire(10000)) {
  try { await rebuildCache(); } finally { await lock3.release(); }
}
```

---

## 消息队列

### FIFO 队列

```js
import { createQueue } from './redis/index.js';

// MapStore 版（默认，单进程）
const queue = createQueue('notify', { maxSize: 100000 });

// Redis 版（多实例共享）
const queue = createQueue('notify', { maxSize: 100000, backend: 'redis' });

queue.push({ id: 1, text: 'hello' });
const msg = queue.shift(); // { data: { id: 1, text: 'hello' }, createdAt: ... }
queue.length();
queue.list(10);    // 列出最近 10 条
queue.clear();     // 清空
```

### 循环队列（满时自动覆盖最旧）

```js
import { createRingQueue } from './redis/index.js';

const ring = createRingQueue('audit', { maxSize: 1000 });
ring.push({ event: 'login', user: 'alice' });
ring.push({ event: 'logout', user: 'alice' });
ring.toArray(10);   // 返回最近 10 条
ring.length();       // 当前条数
```

### Stream 消息队列（持久化 + 消费者组）

```js
import { createStream } from './redis/index.js';

const stream = createStream('email', { maxLen: 50000 });

// 生产者
await stream.add({ to: 'user@a.com', subject: '欢迎' });

// 消费者组
await stream.ensureGroup('email-sender', { start: '0' });

// 消费消息
const msgs = await stream.readGroup('email-sender', 'worker-1', { count: 10 });
for (const msg of msgs) {
  await process(msg.data);
  await stream.ack('email-sender', msg.id);
}

// 失败重试：认领超时消息
const pending = await stream.pending('email-sender', { count: 10 });
for (const p of pending) {
  const claimed = await stream.claim('email-sender', 'worker-2', 60000, p.id);
  await process(claimed[0].data);
  await stream.ack('email-sender', claimed[0].id);
}
```

---

## 防重放

```js
import { createNonceStore } from './redis/index.js';

// 多种调用方式
createNonceStore(60)                  // ttl
createNonceStore('nonce', 60)         // prefix + ttl
createNonceStore({ ttl: 60 })         // options 对象
createNonceStore('nonce', { ttl: 60 }) // prefix + options
createNonceStore()                     // 默认 prefix='nonce', ttl=60

// 使用
const nonceStore = createNonceStore(60);
const isReplay = await nonceStore.checkAndMark(nonce);
if (isReplay) return reply.code(403).send({ error: 'replay_detected' });
```

---

## 限流

```js
import { createBoundStore } from './redis/index.js';
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  store: createBoundStore(app, { getWindowMs: () => 60_000 }),
  max: 100,
  timeWindow: '1 minute'
});
```

---

## 纯内存存储

```js
import { MapStore } from './redis/index.js';

MapStore.config('email_code', { maxSize: 5000, ttl: 300, clone: true });
MapStore.set('email_code', 'user@example.com', { code: '123456' }, 600);
const data = MapStore.get('email_code', 'user@example.com');
MapStore.delete('email_code', 'user@example.com');

// 迭代方法
MapStore.forEach('email_code', (value, key) => console.log(key, value));
MapStore.keys('email_code');
MapStore.values('email_code', true);  // true = 清理过期
MapStore.entries('email_code');
```

---

## 指标监控

```js
// 获取 Redis 连接指标
const metrics = app.redisMetrics();
// { healthy: true, host, port, backupHealthy, cache: { hits, misses, ratio } }
```

## 健康监控

```js
// 注册健康回调
app.onRedisHealthChange(healthy => {
  if (healthy) console.log('Redis 已恢复');
  else console.warn('Redis 已中断');
});
```

---

## 错误处理

| 错误类型 | statusCode | 含义 | 处理方式 |
|---------|:----------:|------|---------|
| `RedisRequiredError` | 503 | Redis 不可用 | 降级或重试 |
| `TypeError` | 400 | 参数无效 | 修复调用代码 |
| 超时 | 503 | 操作超时 | 重试 |

```js
import { RedisRequiredError } from './redis/index.js';

try {
  await store.get('key');
} catch (err) {
  if (err instanceof RedisRequiredError) {
    // Redis 不可用，走降级方案
    return fallbackData();
  }
  throw err;
}
```