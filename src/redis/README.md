# Redis 模块

统一的 Redis 客户端管理模块，提供主 Redis 连接+可选备用 Redis 连接、健康监控、存储等能力。

**主 Redis**：严格模式，重连失败直接报错，不静默降级，确保数据一致性。
**备用 Redis**：可选独立连接，仅用于限流计数、验证码等短时效数据，需按 store 粒度显式启用。

## 使用建议

| 场景                     | 推荐方式                                          | 说明                             |
| ------------------------ | ------------------------------------------------- | -------------------------------- |
| 便捷存储（推荐）         | `getStore('prefix')`                              | 自动选择 Redis 或 MapStore       |
| 短时效数据（备用 Redis） | `getStore('prefix', { backup: true })`            | 使用备用 Redis，未配置时回退主库 |
| 纯内存临时数据           | `MapStore`                                        | 不依赖 Redis，全局单例           |
| 防重放（nonce）          | `createNonceStore(app, ttl)`                      | Lua 原子操作，Redis 不可用时抛错 |
| 限流                     | `createBoundStore(app)`                           | 使用主 Redis，故障时降级内存 |
| 消息队列                 | `createQueue('prefix')`                           | 基于 MapStore 的 FIFO 队列       |
| 直接操作 `app.redis`     | 允许，但建议加超时保护                            | 简单场景直接调更快               |

## 目录

- [模块结构](#模块结构)
- [导入指南](#导入指南)
- [API 参考](#api-参考)
  - [redisPlugin — 连接管理插件](#redisplugin--连接管理插件)
  - [app.redis — Redis 客户端](#appredis--redis-客户端)
  - [app.redisHealthy — 健康状态](#appredischealthy--健康状态)
  - [app.onRedisHealthChange — 健康回调](#apponredischealthchange--健康回调)
  - [app.redisMetrics — 连接池指标](#appredismetrics--连接池指标)
  - [getStore — 统一存储工厂](#getstore--统一存储工厂)
  - [app.backupRedis / app.backupRedisHealthy — 备用 Redis](#appbackupredis--appbackupredischealthy--备用-redis)
  - [MapStore — 纯内存存储](#mapstore--纯内存存储)
  - [RedisStore — Redis 会话存储](#redisstore--redis-会话存储)
  - [createNonceStore — Nonce 防重放](#createnoncestore--nonce-防重放)
  - [createBoundStore / ResilientStore — 限流存储](#createboundstore--resilientstore--限流存储)
  - [createQueue — FIFO 消息队列](#createqueue--fifo-消息队列)
  - [RedisRequiredError — 错误类](#redisrequirederror--错误类)
- [环境变量](#环境变量)
- [降级策略](#降级策略)
- [健康监控](#健康监控)

---

## 模块结构

```
src/redis/
├── index.js              ← 统一出口，所有 API 从这里导出
├── plugin.js             ← 连接管理：创建、主备切换、优雅关闭
├── health.js             ← 事件驱动健康监控
├── utils.js              ← 共享工具函数（超时、序列化、key 构建）
├── errors.js             ← RedisRequiredError 错误类
├── get-store.js          ← 统一存储工厂（推荐入口）
├── redis-store.js        ← Redis 会话存储（强制 Redis 模式）
├── map-store.js          ← 纯内存 Map 存储（单例，不依赖 Redis）
├── nonce-store.js        ← Nonce 去重存储（Lua 原子防重放）
├── resilient-store.js    ← 限流存储后端（@fastify/rate-limit）
├── queue-store.js        ← 基于 MapStore 的 FIFO 消息队列
└── README.md             ← 本文档
```

---

## 导入指南

所有 API 从 `index.js` 统一导出，外部只需导入这一个文件：

```js
// 作为 Fastify 插件注册
import redisPlugin from './redis/index.js';

// 同时导入插件和工具函数
import redisPlugin, { getStore, createNonceStore } from './redis/index.js';

// 仅导入工具函数
import { getStore, createNonceStore, createBoundStore } from './redis/index.js';

// 导入错误类
import { RedisRequiredError } from './redis/index.js';
```

---

## API 参考

### redisPlugin — 连接管理插件

**Fastify 插件**，负责创建 Redis 连接、注入装饰器、注册 `onClose` 清理。

```js
import redisPlugin from './redis/index.js';

// 在 loader 中注册
app.register(redisPlugin);
```

注册后注入以下装饰器：`app.redis`、`app.redisHealthy`、`app.onRedisHealthChange()`、`app.redisMetrics()`。

---

### app.redis — Redis 客户端

**类型**: `RedisClientType | null`

Fastify 装饰器，注入的 Redis 客户端实例。连接失败时为 `null`。

```js
if (app.redis) {
  await app.redis.set('key', 'value', { EX: 60 });
  const val = await app.redis.get('key');
}
```

**注意**: 主备切换后 `app.redis` 自动指向新客户端，无需重新获取。

---

### app.redisHealthy — 健康状态

**类型**: `boolean`

Redis 当前是否可用。由健康监控器自动维护。

```js
if (app.redisHealthy) {
  // 走 Redis
} else {
  // 走降级方案
}
```

---

### app.onRedisHealthChange — 健康回调

**签名**: `(cb: (healthy: boolean) => void) => () => void`

注册健康状态变化回调，返回取消订阅函数。

```js
const unsubscribe = app.onRedisHealthChange(healthy => {
  if (healthy) {
    console.log('Redis 已恢复');
  } else {
    console.warn('Redis 已中断');
  }
});

// 取消监听
unsubscribe();
```

---

### app.redisMetrics — 连接池指标

**签名**: `() => RedisMetrics`

返回当前连接池状态指标，适合 Prometheus 等监控系统接入。

```js
const metrics = app.redisMetrics();
// {
//   healthy: true,
//   host: '127.0.0.1',
//   port: 6379,
//   backupHealthy: true,
//   backupHost: '192.168.1.100'
// }
```

---

### app.backupRedis / app.backupRedisHealthy — 备用 Redis

**类型**: `RedisClientType | null` / `boolean`

可选备用 Redis 连接，通过 `REDIS_BACKUP_HOST` 配置。仅用于短时效数据，需在 `getStore()` 中显式指定 `{ backup: true }` 才会使用。

```js
const store = getStore('rl', { backup: true });
await store.set('key', value, 60);
```

---

### getStore — 统一存储工厂

**签名**: `getStore(prefix, options?) => Store`

**推荐入口**。根据配置自动选择存储后端：Redis 可用时使用 Redis，否则使用 MapStore。

**参数**:

| 参数              | 类型      | 默认值   | 说明                             |
| ----------------- | --------- | -------- | -------------------------------- |
| `prefix`          | `string`  | `''`     | Key 前缀，用于命名空间隔离       |
| `options.timeout` | `number`  | `5000`   | 操作超时（毫秒），MapStore 忽略  |
| `options.backup`  | `boolean` | `false`  | 使用备用 Redis（需配置 `REDIS_BACKUP_HOST`） |

**备用 Redis 模式**: 传 `{ backup: true }` 时使用备用 Redis 连接，适用于限流计数、验证码等短时效数据。备用 Redis 未配置时自动回退到主 Redis。

**缓存策略**: 相同 prefix + timeout + backup 返回同一个 store 实例，Redis 健康状态变更时自动失效重建。

**返回值**: `Store` 对象:

| 方法     | 签名                                                       | 说明                              |
| -------- | ---------------------------------------------------------- | --------------------------------- |
| `get`    | `(key: string) => Promise<any>`                            | 读取值，不存在或已过期返回 `null` |
| `set`    | `(key: string, value: any, ttl?: number) => Promise<void>` | 写入值，ttl 默认 600 秒           |
| `delete` | `(key: string) => Promise<void>`                           | 删除值                            |
| `has`    | `(key: string) => Promise<boolean>`                        | 判断 key 是否存在                 |
| `ttl`    | `(key: string) => Promise<number>`                         | 获取剩余过期时间                  |
| `expire` | `(key: string, ttl: number) => Promise<void>`              | 修改过期时间                      |
| `getDel` | `(key: string) => Promise<any>`                            | 原子读取并删除                    |
| `list`   | `(limit?: number) => Promise<string[]>`                    | 列出键（Redis 模式）              |
| `count`  | `(limit?: number) => Promise<number>`                      | 条目数（Redis 模式）              |
| `destroy`| `() => Promise<void>`                                      | 销毁命名空间                      |
| `clear`  | `() => Promise<void>`                                      | 销毁所有数据                      |
| `hset`   | `(key, field, value) => Promise<number>`                   | **仅 Redis** Hash 写入            |
| `hget`   | `(key, field) => Promise<string>`                          | **仅 Redis** Hash 读取            |
| `hgetall`| `(key) => Promise<object>`                                 | **仅 Redis** 获取所有 Hash 字段   |
| `hdel`   | `(key, ...fields) => Promise<number>`                      | **仅 Redis** 删除 Hash 字段       |
| `scan`   | `(cursor, opts?) => Promise<[number, string[]]>`           | **仅 Redis** 游标扫描             |
| `getStore`| `(subPrefix, opts?) => Store`                             | 嵌套前缀创建子 Store              |

```js
import { getStore } from './redis/index.js';

// 自动选择存储后端（Redis 或 MapStore）
const captchaStore = getStore('captcha');

// 写入
await captchaStore.set('user@example.com', { code: '123456' }, 600);

// 读取
const data = await captchaStore.get('user@example.com');

// 嵌套前缀
const fw = getStore('fw');
const blocks = fw.getStore('block');
await blocks.set('ip:192.168.1.1', val);  // → Redis: fw:block:ip:192.168.1.1
```

---

### MapStore — 纯内存存储

**纯内存 Map 存储（单例模式）**，不依赖 Redis，全局共用一个 MapStore，按 prefix 自动隔离命名空间。

```js
import { MapStore } from './redis/index.js';

MapStore.set('email_code', 'user@example.com', { code: '123456' }, 600);
const data = MapStore.get('email_code', 'user@example.com');
MapStore.delete('email_code', 'user@example.com');
```

**内存安全机制：**

| 机制               | 说明                                   |
| ------------------ | -------------------------------------- |
| `maxSize` 上限保护 | 写入前检查，超限时拒绝（不丢数据）     |
| TTL 自动过期       | 游标分批清理，Symbol 隔离内部属性      |
| 异步后台清理       | 超限时后台自动清理过期条目，不阻塞请求 |
| 兜底定时器         | 每小时清理一次，作为安全网             |

**配置项：**

| 参数              | 默认值    | 说明                               |
| ----------------- | --------- | ---------------------------------- |
| `maxSize`         | `10000`   | 最大条目数                         |
| `ttl`             | `0`       | 默认过期时间（秒），0 永不过期     |
| `cleanupInterval` | `3600000` | 兜底清理间隔（毫秒），0 不自动清理 |
| `batchSize`       | `1000`    | `set()` 触发清理时每次扫描条数     |
| `timerBatchSize`  | `10000`   | 兜底定时器每次扫描条数             |

```js
MapStore.config('email_code', { maxSize: 5000, ttl: 300 });
```

**API 一览：**

| 方法         | 签名                         | 说明                               |
| ------------ | ---------------------------- | ---------------------------------- |
| `get`        | `(prefix, key)`              | 读取，不存在或已过期返回 `null`    |
| `set`        | `(prefix, key, value, ttl?)` | 写入，新 key 写入前检查上限        |
| `has`        | `(prefix, key)`              | 判断是否存在且未过期               |
| `delete`     | `(prefix, key)`              | 删除                               |
| `ttl`        | `(prefix, key)`              | 剩余秒数，`-1` 无过期，`-2` 不存在 |
| `expire`     | `(prefix, key, ttl)`         | 修改已存在 key 的过期时间          |
| `getDel`     | `(prefix, key)`              | 原子读取并删除                     |
| `list`       | `(prefix, limit?, offset?)`  | 列出键（无固定顺序，可能含过期）   |
| `listValid`  | `(prefix, limit?)`           | 列出有效（未过期）键，附带清理     |
| `count`      | `(prefix)`                   | 条目数（含过期）                   |
| `countValid` | `(prefix, skipCleanup?)`     | 有效条目数，默认清理过期           |
| `config`     | `(prefix, options)`          | 动态配置命名空间                   |
| `destroy`    | `(prefix)`                   | 销毁指定命名空间                   |
| `clear`      | `()`                         | 销毁所有数据                       |

---

### RedisStore — Redis 会话存储

基于 Redis 的临时数据存储，适用于验证码、登录凭证、扫码状态等。Redis 不可用时抛出 `RedisRequiredError`，不使用内存降级。

所有 KV 方法支持可选的 `timeout` 参数，调用方可按需覆盖默认超时（3000ms）。

```js
import { RedisStore } from './redis/index.js';

RedisStore.set('email_code', 'user@example.com', { code: '123456' }, 600);
const data = await RedisStore.get('email_code', 'user@example.com');
const exists = await RedisStore.has('email_code', 'user@example.com');
const remaining = await RedisStore.ttl('email_code', 'user@example.com');
await RedisStore.delete('email_code', 'user@example.com');

// 指定超时
const data = await RedisStore.get('email_code', 'user@example.com', 5000);
```

**架构说明**: `getStore()` 的主 Redis 模式底层委托给 `RedisStore`，复用其冷却机制、超时保护和错误包装。备用 Redis 模式及 Hash/Scan 操作保持内联实现。

**日志注入**: 可通过 `setLogger()` 注入 Fastify 日志器，替换默认的 `console.log` 调试输出：

```js
import { setLogger } from './redis/index.js';
setLogger(app.log);  // 由 plugin.js 自动调用
```

**注意**: 大多数场景推荐使用 `getStore`，它自动处理 Redis 与 MapStore 的选择。仅在需要明确保证 Redis 可用时（如防重放、跨实例共享）才直接使用 `RedisStore`。

---

### createNonceStore — Nonce 防重放

用于 RSA 加密登录等安全场景。核心方法 `checkAndMark` 使用 Lua 脚本保证原子性，消除并发窗口。

```js
import { createNonceStore, RedisRequiredError } from './redis/index.js';

const nonceStore = createNonceStore(app, 60);

try {
  const isReplay = await nonceStore.checkAndMark(nonce);
  if (isReplay) {
    return reply.code(403).send({ error: 'replay_detected' });
  }
} catch (err) {
  if (err instanceof RedisRequiredError) {
    return reply.code(503).send({ error: 'service_unavailable' });
  }
  throw err;
}
```

**Lua 脚本**: 使用 `EVALSHA` 缓存编译后的脚本，`NOSCRIPT` 错误时自动回退到 `EVAL`。

---

### createBoundStore / ResilientStore — 限流存储

为 `@fastify/rate-limit` 提供的弹性存储后端，Redis 故障时自动切换为内存计数。

```js
import { createBoundStore } from './redis/index.js';
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  store: createBoundStore(app, { getWindowMs: () => 60_000 }),
  max: 100,
  timeWindow: '1 minute'
});
```

**降级机制**:
- Redis 正常：`MULTI` → `INCR` + `PEXPIRE`（原子性）
- Redis 故障：单次失败后冷却 5 秒，期间走内存 Map
- Redis 恢复：自动切回分布式模式

**资源释放**: 每个实例持有全局引用，不再需要时应调用 `close()` 释放：

```js
const store = new ResilientStore(app);
// ... 使用完毕
store.close();  // 从全局集合移除，允许 GC 回收
```

---

### createQueue — FIFO 消息队列

基于 MapStore 实现，不依赖 Redis，所有数据在进程内存中。适合消息推送、任务队列、事件缓冲等场景。

```js
import { createQueue } from './redis/index.js';

const queue = createQueue('notify', { maxSize: 100000 });
queue.push({ id: 1, text: 'hello' });
const msg = queue.shift(); // { data: { id: 1, text: 'hello' }, createdAt: 1745678901234 }
queue.length();            // 0
```

---

### RedisRequiredError — 错误类

Redis 不可用且不允许降级时抛出的错误。

```js
import { RedisRequiredError } from './redis/index.js';
```

| 属性         | 类型     | 说明                                            |
| ------------ | -------- | ----------------------------------------------- |
| `code`       | `string` | `'REDIS_REQUIRED'`                              |
| `statusCode` | `number` | `503`                                           |
| `operation`  | `string` | 失败的操作（`get`、`set`、`checkAndMark` 等）   |
| `store`      | `string` | 存储名称（`nonce`、`session`、`email_code` 等） |

---

## 环境变量

| 变量                    | 默认值  | 说明                            |
| ----------------------- | ------- | ------------------------------- |
| `REDIS_ENABLED`         | `false` | 是否启用 Redis                  |
| `REDIS_HOST`            | —       | Redis 主机地址                  |
| `REDIS_PORT`            | `6379`  | Redis 端口                      |
| `REDIS_PASSWORD`        | —       | Redis 密码（可选）              |
| `REDIS_USERNAME`        | —       | Redis 6 ACL 用户名（可选）      |
| `REDIS_DB`              | `0`     | 默认数据库编号（0-15）          |
| `REDIS_TLS`             | `false` | 是否启用 TLS                    |
| `REDIS_TLS_CA`          | —       | TLS CA 证书路径（自签证书场景） |
| `REDIS_BACKUP_HOST`     | —       | 备库主机地址（可选，独立连接，不承担主库 failover） |
| `REDIS_BACKUP_PORT`     | `6379`  | 备库端口                        |
| `REDIS_CONNECT_TIMEOUT` | `5000`  | 连接超时毫秒                    |
| `REDIS_MAX_RETRIES`     | `10`    | 运行期重连最大次数              |

---

## 主备架构说明

### 主 Redis — 严格模式

- 启动时重试连接，失败则降级为不可用
- 运行期自动重连，超限后标记不健康
- 所有 Redis 操作抛 `RedisRequiredError`（503）
- **不自动切换到备用服务器**，防止数据不一致

### 备用 Redis — 短时效数据

- 通过 `REDIS_BACKUP_HOST` 配置，独立连接
- 仅用于限流计数、验证码等短时效数据
- 需在 `getStore()` 中传 `{ backup: true }` 显式启用
- 备用未配置或不可用时，自动回退到主 Redis
- `ResilientStore`（限流）自动优先使用备用 Redis

---

## 降级策略

| 存储                                 | 默认     | 行为                                           |
| ------------------------------------ | -------- | ---------------------------------------------- |
| `getStore('prefix')`                 | 自动降级 | Redis 可用 → Redis，不可用 → MapStore          |
| `createNonceStore(app, 60)`          | 禁止降级 | Redis 不可用时抛出 `RedisRequiredError`（503） |
| `RedisStore`                         | 禁止降级 | Redis 不可用时抛出 `RedisRequiredError`（503） |

**安全模式**（`RedisStore` / `createNonceStore`）：

- 适用于防重放、跨实例共享数据等场景
- Redis 不可用时立刻失败，业务层收到 `RedisRequiredError`（statusCode 503）
- 避免多实例下内存数据不一致导致的安全漏洞

**自动降级模式**（`getStore` / `MapStore`）：

- 适用于验证码、单实例临时状态等场景
- Redis 不可用时自动降级到内存 Map，业务无感知
- Redis 恢复后自动切换回分布式存储

---

## 健康监控

```
Redis 正常 → 零开销（仅事件监听）
    ↓ error/end 事件
标记不健康 → 启动 30s 间隔 ping 探测（复用持久连接）
    ↓ ping 成功
标记健康 → 停止探测，通知所有监听者
```

- 事件驱动：`error` / `ready` / `end` 事件触发状态切换
- 持久探活连接：避免每 10 秒建连/断连的开销
- 回调通知：通过 `app.onRedisHealthChange()` 注册回调