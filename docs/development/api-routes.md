# API 路由 {#api-routes}

## 路由注册

使用 `registerSecureRoute()` 注册路由，自动附加三级安全守卫：

```js
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';

export default async function (fastify) {
  registerSecureRoute(fastify, {
    name: 'getUsers',
    alias: '获取用户列表',
    method: 'GET',
    url: '/users',
    requireLogin: true,
    permission: 'admin:user:read',
    handler: async (request, reply) => {
      const users = await app.db.user.User.findAll();
      return reply.result.success('获取成功', users);
    }
  });
}
```

## 配置项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | string | - | 路由唯一标识 |
| `alias` | string | - | 显示名称 |
| `method` | string | - | HTTP 方法 |
| `url` | string | - | 路由路径 |
| `handler` | function | - | 处理函数 |
| `requireLogin` | boolean | `false` | 是否需要登录 |
| `permission` | string/object | `null` | 权限校验 |
| `allowRoles` | string[] | `[]` | 角色白名单 |
| `allowIps` | string[] | `[]` | IP 白名单 |
| `schema` | object | `{}` | JSON Schema 校验 |

## 权限配置

```js
// 单个权限
permission: 'fw:config:read'

// 任一满足（OR）
permission: { any: ['fw:block:write', 'fw:admin:*'] }

// 全部满足（AND）
permission: { all: ['fw:admin:reset', 'fw:admin:*'] }
```

## 响应格式

```js
reply.result.success(message, data)    // 200 成功
reply.result.fail(message, data, code) // 400 业务失败
reply.result.unauth(message)           // 401 未登录
reply.result.forbidden(message)        // 403 权限不足
```

响应结构：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": { ... },
  "timestamp": 1717000000,
  "requestId": "uuid-xxx"
}
```

## Schema 校验

```js
registerSecureRoute(fastify, {
  name: 'createUser',
  method: 'POST',
  url: '/users',
  schema: {
    body: {
      type: 'object',
      required: ['username', 'email'],
      properties: {
        username: { type: 'string', minLength: 2, maxLength: 50 },
        email: { type: 'string', format: 'email' }
      }
    }
  },
  handler: async (request, reply) => { ... }
});
```

## Group 级配置

```js
registerGroupMetadata({
  name: 'user',
  description: '用户管理',
  prefix: '/v1',
  requireLogin: true,
  allowRoles: ['admin']
});
```

Group 级配置对组内所有路由生效，API 级配置可覆盖。

## WebSocket 路由

```js
import { registerSecureWebSocket } from '../../guard.js';

registerSecureWebSocket(fastify, {
  url: '/ws/monitor',
  requireLogin: true,
  allowRoles: ['fw_viewer'],
  handler: (connection, req, client) => {
    client.on('message', (msg) => { ... });
  }
});
```

## 错误处理

```js
registerSecureRoute(fastify, {
  handler: async (request, reply) => {
    try {
      const result = await someService.doSomething();
      return reply.result.success('操作成功', result);
    } catch (err) {
      // 业务错误返回 400
      return reply.result.fail(err.message, null, 400);
    }
  }
});
```

业务错误前缀约定：

```js
throw new Error('VERIFY_FAILED:验证码错误');
throw new Error('PARAM_ERROR:邮箱不能为空');
throw new Error('BUSINESS_ERROR:该邮箱已注册');
```
