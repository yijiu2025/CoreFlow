# 性能优化 {#performance}

## 后端优化

### Redis 缓存层

对高频读取的安全设置增加缓存：

```js
const CACHE_TTL = 30; // 秒
export async function getCachedSettings(redis) {
  const cached = await safeRedis(redis, r => r.get('fw:cache:settings'));
  if (cached) return JSON.parse(cached);
  const settings = getSecuritySettings();
  await safeRedis(redis, r => r.set('fw:cache:settings', JSON.stringify(settings), { EX: CACHE_TTL }));
  return settings;
}
```

### 权限缓存

Bearer Token 路径每次请求都查库，已添加 Redis 缓存：

```js
// 键必须是 sha256(userId \0 appId) 前 16 hex，**不能**用 `${userId}:${appId}` 明文：
// 明文键可被 `SCAN auth:perm:*oauth21*` 直接枚举出某个应用的全体用户。
// 实现见 framework/auth/perm-cache.js 的 buildPermKey()，直接用即可，不要自己拼。
const cacheKey = buildPermKey(userId, appId); // → 16 位 hex
const cached = await redis.get(`${PERM_NAMESPACE}:${cacheKey}`);
if (cached) {
  const { roles, permissions } = JSON.parse(cached);
} else {
  const loaded = await loadUserPermissions(userId, appId);
  await redis.set(`${PERM_NAMESPACE}:${cacheKey}`, JSON.stringify(loaded), { EX: PERM_TTL }); // ≤300s
}
```

> ⚠️ TTL 必须短（`PERM_TTL ≤ 300s`）且**授权变更后主动失效**：长 TTL 会把"撤销权限"推迟到
> 下次过期，等于给被撤销的人留了一个最长为 TTL 的窗口。
> 另外会话里还存了 `permFingerprint`，权限数据一变指纹就变，会话副本会立刻作废（第 3 层）。

### 连接池配置

```ini
DB_POOL_MAX=10
DB_POOL_MIN=2
```

### 优雅关闭

```js
const shutdown = async signal => {
  await server.close(); // 停止接受新请求
  await server.db?.sequelize?.close();
  await server.redis?.quit();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## 热路径与限流器

守卫 / IP 匹配 / 限流是**每个请求都走**的路径，这里的一次额外分配会乘以全站 QPS：

- `net.BlockList` 按规则缓存，不要逐请求 `new`（见 `src/utils/ip.js` 的 `getBlockList`）
- 正则、`Set`、序列化结果提到模块级，别在函数体里现编
- `createIpRateLimiter` 的 Redis 路径目前是 5 次往返（`zRemRangeByScore / zCard / zRange / zAdd / expire`），
  被刷时这 5 次往返本身就是放大倍数 —— 可 pipeline 压到 1–2 次（待办，见 `src/app/oauth21/middleware/rate-limiter.js`）

## 慢请求告警

```js
// onResponse 钩子
const ms = performance.now() - request.startTime;
if (ms > 2000) {
  request.log.warn({ duration: `${ms}ms`, method: request.method, url: request.url });
}
```

> 前端性能规则（首屏预算 / 懒加载判据 / 构建期清单）已随前端工程迁出，
> 见 [archive/legacy-frontend/frontend-performance-rules.md](../../archive/legacy-frontend/frontend-performance-rules.md)。
