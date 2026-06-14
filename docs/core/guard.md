# 三级守卫 {#guard}

## 守卫层级

三级守卫系统实现级联访问控制：

| 级别 | 来源 | 配置项 |
|------|------|--------|
| System | `system.json` | enabled, allowIps, requireLogin |
| Group | `registerGroupMetadata()` | enabled, allowIps, allowRoles |
| API | `registerSecureRoute()` | enabled, allowIps, allowRoles, requireLogin, permission |

每级可独立拦截，任一级拒绝则请求被拦截。

## 校验流程

```
请求到达
  │
  ▼
System 级 (system.json)
  ├─ enabled: true?     → 否 → 返回 403
  ├─ allowIps 匹配?     → 不匹配 → 返回 403
  └─ requireLogin?      → 未登录 → 返回 401
  │
  ▼
Group 级 (registerGroupMetadata)
  ├─ enabled: true?     → 否 → 返回 403
  ├─ allowRoles 匹配?   → 不匹配 → 返回 403
  └─ requireLogin?      → 未登录 → 返回 401
  │
  ▼
API 级 (registerSecureRoute)
  ├─ enabled: true?     → 否 → 返回 403
  ├─ permission 匹配?   → 不匹配 → 返回 403
  └─ requireLogin?      → 未登录 → 返回 401
  │
  ▼
放行到 handler
```

## 配置示例

### System 级（system.json）

```json
{
  "name": "myapp",
  "alias": "我的应用",
  "prefix": "/myapp",
  "enabled": true,
  "requireLogin": false,
  "allowIps": [],
  "allowRoles": []
}
```

### Group 级（路由文件中）

```js
registerGroupMetadata({
  name: 'article',
  description: '文章管理',
  prefix: '/v1',
  requireLogin: true,
  allowRoles: ['myapp_user', 'myapp_admin']
});
```

### API 级（路由文件中）

```js
registerSecureRoute(fastify, {
  name: 'deleteArticle',
  method: 'DELETE',
  url: '/articles/:id',
  requireLogin: true,
  allowRoles: ['myapp_admin'],
  permission: 'myapp:article:delete',
  handler: async (request, reply) => { ... }
});
```

## 权限配置

`permission` 支持三种格式：

```js
// 单个权限
permission: 'fw:config:read'

// 任一满足（OR）
permission: { any: ['fw:block:write', 'fw:admin:*'] }

// 全部满足（AND）
permission: { all: ['fw:admin:reset', 'fw:admin:*'] }
```

## IP 匹配

支持通配符和 CIDR：

```js
allowIps: [
  '192.168.1.100',      // 精确匹配
  '192.168.1.*',        // 通配符
  '10.0.0.0/8',         // CIDR
  '*'                    // 全部允许
]
```

## WebSocket 守卫

WebSocket 路由同样支持三级守卫：

```js
registerSecureWebSocket(fastify, {
  url: '/ws/monitor',
  requireLogin: true,
  allowRoles: ['fw_viewer'],
  handler: (connection, req, client) => { ... }
});
```

## URL 拼接规则

```
最终 URL = system.json.prefix + registerGroupMetadata.prefix + registerSecureRoute.url
```

示例：
```json
// system.json
{ "prefix": "/blog" }
```
```js
registerGroupMetadata({ prefix: '/v1' });
registerSecureRoute(fastify, { url: '/posts', ... });
// 最终：GET /blog/v1/posts
```

## 配置持久化

Guard 配置持久化到 `data/guard_config.json`，支持运行时动态修改。
