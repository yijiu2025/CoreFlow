# Redis 模块

统一的 Redis 客户端管理模块，提供连接初始化、健康监控、自动降级、会话存储等能力。所有组件均支持 Redis 不可用时自动降级到内存模式，确保业务不中断。

## 文件结构

```
src/redis/
├── index.js              # 插件入口：连接初始化、注入 app.redis
├── health.js             # 事件驱动健康监控（零轮询开销）
├── safe-redis.js         # 安全操作包装（错误隔离 + 降级）
├── resilient-store.js    # 限流存储（Redis ↔ 内存自动切换）
├── session-store.js      # 统一会话管理（验证码、凭证、扫码状态）
└── nonce-store.js        # Nonce 去重存储（Lua 原子防重放）
```

## 环境变量

| 变量             | 默认值  | 说明               |
| ---------------- | ------- | ------------------ |
| `REDIS_ENABLED`  | `false` | 是否启用 Redis     |
| `REDIS_HOST`     | -       | Redis 主机地址     |
| `REDIS_PORT`     | `6379`  | Redis 端口         |
| `REDIS_PASSWORD` | -       | Redis 密码（可选） |
| `REDIS_TLS`      | `false` | 是否启用 TLS       |

## 启动流程

```
02-redis.js → index.js → createClient() → connect()
                                         ↓
                                setupRedisHealthMonitor()
                                         ↓
                              注入 app.redis / app.redisHealthy
                                         ↓
                              注册 onClose → redis.quit()
```

连接失败时自动降级：`app.redis = null`，业务层通过各 Store 的内存模式继续运行。

## 核心 API

### app.redis

Fastify 装饰器，注入的 Redis 客户端实例。连接失败时为 `null`。

```js
// 在路由或插件中使用
if (app.redis) {
  await app.redis.set('key', 'value', { EX: 60 });
  const val = await app.redis.get('key');
}
```

### app.redisHealthy

布尔值，表示 Redis 当前是否可用。由健康监控器自动维护。

### app.onRedisHealthChange(cb)

注册健康状态变化回调，返回取消函数。

```js
const unsubscribe = app.onRedisHealthChange((healthy) => {
  console.log('Redis 状态:', healthy ? '恢复' : '中断');
});

// 取消监听
unsubscribe();
```

## 组件使用指南

### 1. safeRedis — 安全操作包装

防止 Redis 异常扩散到业务层，自动降级返回 fallback 值。

```js
import { safeRedis } from './redis/safe-redis.js';

// Redis 不可用时返回 null（第二个参数）
const value = await safeRedis(app.redis, (r) => r.get('key'), null);

// 区分网络错误（warn）和程序错误（error）
```

### 2. getSessionStore — 统一会话管理

适配器模式，调用方无需关心底层是 Redis 还是内存。适合存储验证码、登录凭证、扫码状态等临时数据。

```js
import { getSessionStore } from './redis/session-store.js';

const store = getSessionStore(app, 'email_code');

await store.set('user@example.com', { code: '123456' }, 600); // TTL 10分钟
const data = await store.get('user@example.com');
await store.delete('user@example.com');
```

**特性：**

- Redis 模式：`SET key JSON EX ttl`
- 内存模式：Map + 定时清理（10 分钟间隔）
- Redis 操作失败时自动降级到内存

### 3. createNonceStore — Nonce 去重存储

工厂函数，用于防重放校验。核心方法 `checkAndMark` 使用 Lua 脚本保证原子性。

```js
import { createNonceStore } from './redis/nonce-store.js';

const nonceStore = createNonceStore(app.redis, 60); // 60秒 TTL

// 推荐：原子性检查+标记
const isReplay = await nonceStore.checkAndMark(nonce);
if (isReplay) {
  return reply.code(403).send({ error: 'replay_detected' });
}

// 也支持分离式调用（存在并发窗口，仅用于非安全场景）
const exists = await nonceStore.check(nonce);
await nonceStore.mark(nonce);
```

**Lua 脚本逻辑：**

```lua
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('SETEX', KEYS[1], ARGV[1], '1')
  return 0  -- 首次使用
else
  return 1  -- 重放攻击
end
```

### 4. ResilientStore — 限流存储

为 `@fastify/rate-limit` 提供的弹性存储后端。Redis 故障时自动切换到内存计数。

```js
import { createBoundStore } from './redis/resilient-store.js';

// 注册限流插件时传入
await app.register(rateLimit, {
  store: createBoundStore(app, { getWindowMs: () => 60_000 }),
  max: 100,
  timeWindow: '1 minute'
});
```

**特性：**

- `MULTI/EXEC` 保证 INCR + PEXPIRE 原子性
- 内存模式：30 秒定时清理过期记录
- `child()` 返回隔离实例，避免跨路由计数干扰

## 健康监控机制

```
Redis 正常 → 零开销（仅事件监听）
    ↓ error/end 事件
标记不健康 → 启动 30s 间隔 ping 探测
    ↓ ping 成功
标记健康 → 停止探测，通知所有监听者
```

- 事件驱动：`error` / `ready` / `end` 事件触发状态切换
- 恢复探测：不健康时每 30 秒 ping 一次，成功后自动恢复
- 回调通知：通过 `app.onRedisHealthChange()` 注册的回调会收到状态变更

## 降级策略总览

| 组件            | Redis 模式           | 内存降级模式   |
| --------------- | -------------------- | -------------- |
| session-store   | `SET/GET/DEL` + TTL  | Map + 定时清理 |
| nonce-store     | `SETEX/EXISTS` + Lua | Map + 定时清理 |
| resilient-store | `MULTI` INCR+PEXPIRE | Map + 定时清理 |
| safe-redis      | 执行传入函数         | 返回 fallback  |

所有降级自动发生，业务层无需额外处理。

## 注意事项

1. **推荐使用 `app.redis`** 而非导入 `globalRedis`，后者仅用于向后兼容
2. **防重放场景**务必使用 `nonceStore.checkAndMark()` 而非分离的 `check()` + `mark()`
3. **限流场景**使用 `createBoundStore()` 而非直接实例化 `ResilientStore`
4. 所有内存降级的定时器均已 `.unref()`，不阻塞进程退出
5. `onClose` hook 会自动清理连接和定时器，无需手动处理
