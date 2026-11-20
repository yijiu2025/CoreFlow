# API routes {#api-routes}

## Registering a route

Routes go through `registerSecureRoute()`, which attaches the three-level guard automatically:

```js
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getModel } from '../../../framework/persistence/db/index.js';

export default async function (fastify) {
  registerSecureRoute(fastify, {
    name: 'getUsers',
    alias: 'List users',
    method: 'GET',
    url: '/users',
    requireLogin: true,
    permission: 'admin:user:read',
    handler: async (request, reply) => {
      // `app.db` only exists during loader startup; at request time take models via getModel()
      // Business code normally pushes this line down into a DAO
      // (see "Building an app module" for the DAO / Service split)
      const users = await getModel('User').findAll({
        attributes: ['uid', 'username', 'email', 'status'],
        limit: 20
      });
      return reply.result.success('ok', users);
    }
  });
}
```

## Options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `name` | string | – | unique route identifier |
| `alias` | string | – | display name |
| `method` | string | – | HTTP method |
| `url` | string | – | route path |
| `handler` | function | – | request handler |
| `requireLogin` | boolean | `false` | require an authenticated session |
| `permission` | string / object | `null` | permission check |
| `allowRoles` | string[] | `[]` | role allowlist |
| `allowIps` | string[] | `[]` | IP allowlist |
| `schema` | object | `{}` | JSON Schema validation |

## Permissions

```js
// single permission
permission: 'fw:config:read';

// any of (OR)
permission: {
  any: ['fw:block:write', 'fw:admin:*'];
}

// all of (AND)
permission: {
  all: ['fw:admin:reset', 'fw:admin:*'];
}
```

## Self-service vs admin endpoints {#self-service-boundary}

**Changing "my own" data and changing "someone else's" data must be two endpoints.** A permission
code says *what* you may do — never *to whom*. Hanging the same `posecraft:user:changename` on
`PUT /posecraft/v1/profile/:userId` means "anyone allowed to rename themselves can rename anybody".

The boundary is pinned by three statically checkable shapes
(enforced by `src/__tests__/conventions/user-data-route-boundary.test.js`):

| Rule | Criterion |
| --- | --- |
| ① Writes on others are admin-only | target-user URL (`/users/:id`, `/:uid`, `/:userId`) + write method ⇒ permission must live in `ADMIN_PERMISSIONS` |
| ② Target user travels in the path | the body schema must not declare a singular `userId` / `user_id` / `uid` (batches use `userIds` arrays) |
| ③ App-level user codes are self-service only | non-admin `*_PERMISSIONS.USER.*` codes may only guard routes **without** a target-user parameter |

Preferred shape for self-service:

```js
registerSecureRoute(fastify, {
  name: 'posecraftRenameSelf',
  method: 'PUT',
  url: '/posecraft/v1/profile',           // no :id — the target is the caller
  requireLogin: true,
  schema: {
    body: {
      type: 'object',
      properties: { nickname: { type: 'string', maxLength: 64 } },
      additionalProperties: false          // an extra field fails validation instead of slipping a userId through
    }
  }
});
```

Admin-side writes live under the admin domain, use `ADMIN_PERMISSIONS.*` codes, and reuse
`assertCanManageUser` to decide whether this actor may touch that user.

::: warning The one allowed exception: writing a relation, not user data
`POST /posecraft/v1/follow/:userId` carries a target user but mutates **my relationship to them**,
not their profile. Such exceptions must be listed one by one with a reason in
`ALLOWED_WRITE_ON_OTHER`; a reverse guard goes red if a whitelisted route disappears.
:::

## Response envelope

```js
reply.result.success(message, data);    // 200
reply.result.fail(message, data, code); // 400 business failure
reply.result.unauth(message);           // 401
reply.result.forbidden(message);        // 403
```

Shape:

```json
{
  "code": 200,
  "message": "ok",
  "data": { },
  "timestamp": 1717000000,
  "requestId": "uuid-xxx"
}
```

## Schema validation

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
  handler: async (request, reply) => { /* ... */ }
});
```

## Group-level config

```js
registerGroupMetadata({
  name: 'user',
  description: 'User management',
  prefix: '/v1',
  requireLogin: true,
  allowRoles: ['admin']
});
```

Group config applies to every route in the group; API-level config can override it.

## WebSocket routes

```js
import { registerSecureWebSocket } from '../../guard.js';

registerSecureWebSocket(fastify, {
  url: '/ws/monitor',
  requireLogin: true,
  allowRoles: ['fw_viewer'],
  handler: (connection, req, client) => {
    client.on('message', (msg) => { /* ... */ });
  }
});
```

## Error handling

```js
registerSecureRoute(fastify, {
  handler: async (request, reply) => {
    try {
      const result = await someService.doSomething();
      return reply.result.success('ok', result);
    } catch (err) {
      return reply.result.fail(err.message, null, 400);
    }
  }
});
```

Business errors follow a `PREFIX:message` convention:

```js
throw new Error('VERIFY_FAILED:invalid code');
throw new Error('PARAM_ERROR:email is required');
throw new Error('BUSINESS_ERROR:email already registered');
```
