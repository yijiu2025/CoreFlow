# Redis 规范

## 数据结构与键值设计

### 选择合适的数据结构

| 场景 | 推荐类型 | 原因 |
|------|----------|------|
| 用户对象/配置 | Hash | 单 Key 多 Field，节省内存，可单独读写 Field |
| 排行榜/延迟队列 | Sorted Set | 按 Score 排序，范围查询 O(log N) |
| 消息队列 | Stream | 消费者组、ACK 机制、持久化 |
| 计数器 | String | INCR/DECR 原子操作 |
| 去重/集合运算 | Set | 交集/并集/差集 O(N) |
| 位图统计 | Bitmap | 日活/签到，内存极省 |

### 键命名

```
格式：service:module:entity:id[:sub]
示例：fw:block:ip:1.2.3.4
     auth:session:abc123
     captcha:email:user@example.com
```

- 统一使用冒号 `:` 分隔
- 小写字母 + 数字 + 连字符
- 避免超过 128 字节

### 过期时间（TTL）

- 所有缓存键必须设置 TTL
- 添加随机抖动防雪崩：`TTL = baseTTL + Math.floor(Math.random() * 300)`
- 避免同一批键同时过期

### 大 Key 治理

| 类型 | 上限 |
|------|------|
| String | ≤ 10 KB |
| Hash/Set/ZSet/List | ≤ 5000 元素 |
| 单个 Key 内存 | ≤ 1 MB |

超出上限时拆分为多个 Key，或使用 Hash 分片。

## 命令与性能

### 禁止使用的命令

| 命令 | 替代方案 |
|------|----------|
| `KEYS` | `SCAN` 游标迭代 |
| `FLUSHALL` | 生产环境禁用，或 rename |
| `CONFIG` | 生产环境禁用 |
| `MONITOR` | 仅调试环境，不用于生产 |

### 批量操作优先级

1. `MGET`/`MSET`、`HMGET`/`HMSET` — 单次往返批量读写
2. Pipeline — 多条命令打包，减少网络往返
3. 逐条发送 — 仅对实时性要求极低的场景

### 连接管理

- 连接由框架统一管理（`node-redis` 单连接多路复用 + 主备切换，见 `src/framework/redis/plugin.js`）
- 禁止每次操作创建/销毁连接
- 连接池大小：`max: 10-50`，根据业务 QPS 调整

## 高可用

### 内存淘汰策略

| 策略 | 适用场景 |
|------|----------|
| `allkeys-lru` | 纯缓存，淘汰最久未使用的 Key |
| `volatile-lru` | 有 TTL 的缓存，淘汰最久未使用的 Key |
| `volatile-ttl` | 优先淘汰即将过期的 Key |
| `noeviction` | 数据不可丢失，写满时报错 |

### 持久化

| 方式 | 优点 | 缺点 |
|------|------|------|
| RDB | 性能好，启动快 | 可能丢数据 |
| AOF | 数据安全，每秒 fsync | 文件大，启动慢 |
| RDB + AOF | 兼顾性能和安全性 | 推荐生产环境使用 |

### 主备架构

- 主库：读写，严格模式，数据一致性
- 备库：只读，短时效数据（限流计数、验证码）
- 显式指定 `backup: true` 启用备库降级
- 主库故障时自动切备库，备库不可用时回退主库

## 安全

- 启用 `requirepass` 密码认证
- 生产环境使用 TLS 1.2+ 加密
- ACL 最小权限原则（Redis 6.0+）
- 敏感数据（Token、Session）在应用层加密后存储

## 监控

- `INFO` — 查看内存/连接/命中率
- `SLOWLOG` — 分析慢查询，阈值 ≥ 10ms
- `redis-cli --bigkeys` — 排查大 Key
- 告警指标：内存 > 80%、命中率 < 90%、延迟 > 50ms

## 本项目 Redis 模块规则

### 核心原则：所有 Redis 操作必须经过 Redis 模块

**禁止直接操作 `request.server.redis` 或 `app.redis` 等原始客户端。**

所有 Redis 操作必须通过 `src/framework/redis/` 模块暴露的 API 执行：

```js
// ✅ 正确：通过 Redis 模块
import { getStore } from '../../framework/redis/index.js';
const store = getStore('captcha');
await store.get('key');

// ❌ 禁止：直接操作原始客户端
const redis = request.server.redis;
await redis.get('session:key');
```

### 功能缺失时的处理

如果 Redis 模块缺少某个 Redis 命令，**不得绕过模块直接调用**，而应**在 `RedisStore` 中补充该方法**，走统一的超时保护和错误包装：

```js
// 在 src/framework/redis/redis-store.js 中添加新方法
async zAdd(prefix, key, score, value, timeout, useBackup) {
  _validateInput(prefix, key);
  const redis = _getRedis('zAdd', prefix, useBackup);
  const fullKey = makeKey(prefix, key);
  try {
    await withTimeout(redis, r => r.zAdd(fullKey, { score, value }), timeout);
  } catch (err) {
    _wrapRedisError(err, 'zAdd', prefix);
  }
}
```

### 存储选择

```js
import { getStore } from '../../framework/redis/index.js';

// 自动选择 Redis 或 MapStore（根据环境变量）
const store = getStore('captcha', { timeout: 3000 });

// 主备模式：主库不通切备库，都不行抛 503
const rl = getStore('rl', { backup: true });
```

### API 使用原则

- 优先使用 `getStore()` 统一接口，不直接操作 `RedisStore` 或 `MapStore`
- 需要在 store 上调用未包装的 Redis 命令时，直接调用即可（Proxy 自动转发）
- 批量读写使用 `mget`/`mset`，不使用循环逐条 `get`/`set`
- 所有操作必须设置 `timeout`（默认 5000ms），防止阻塞
- 不使用 `KEYS` 命令，使用 `list()` / `scan()` 代替
- `key` 由 store 自动加 prefix，业务代码只传原始 key

### 错误处理

| 错误类型 | statusCode | 含义 |
|----------|------------|------|
| `RedisRequiredError` | 503 | Redis 不可用，配置了 Redis 但连接失败 |
| `TypeError` | 400 | 参数无效，如 prefix/key 类型错误 |
| 超时 | 503 | 操作超时 |

### 代码规范

- `map-store.js` 中 `list()` 带 `offset` 参数，`listValid()` 倒序遍历避免交换删除跳过
- `_deleteKey` 先 pop 再 swap，数据不一致时 cascade swap 修复
- `keys/values/entries` 在 `clean=true` 时倒序遍历
- `config.clone` 自动配置 `serializer`/`deserializer` 成对
- `usage()` 抽样估算内存，循环引用 `try-catch` 兜底