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
const cacheKey = `perm:${userData.id}:${appId}`;
const cached = await redis.get(cacheKey);
if (cached) {
  const { roles, permissions } = JSON.parse(cached);
} else {
  const loaded = await loadUserPermissions(userId, appId);
  await redis.set(cacheKey, JSON.stringify(loaded), { EX: 300 }); // 5分钟
}
```

### 连接池配置

```ini
DB_POOL_MAX=10
DB_POOL_MIN=2
```

### 优雅关闭

```js
const shutdown = async (signal) => {
  await server.close();           // 停止接受新请求
  await server.db?.sequelize?.close();
  await server.redis?.quit();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## 前端优化

| 优化项 | 做法 |
|--------|------|
| 路由懒加载 | `component: () => import('./views/X.vue')` |
| 组件异步加载 | `defineAsyncComponent(() => import('./HeavyChart.vue'))` |
| 虚拟滚动 | `@tanstack/vue-virtual` 替代全量渲染 |
| 图表按需加载 | ECharts tree-shaking |
| 图片/字体优化 | 字体 `font-display: swap` |
| Service Worker | PWA 离线缓存静态资源 |

## 慢请求告警

```js
// onResponse 钩子
const ms = performance.now() - request.startTime;
if (ms > 2000) {
  request.log.warn({ duration: `${ms}ms`, method: request.method, url: request.url });
}
```
