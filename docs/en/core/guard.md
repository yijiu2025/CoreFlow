# Three-level guard {#guard}

## Levels

Cascading access control in three levels:

| Level | Declared in | Options |
| --- | --- | --- |
| System | `system.json` | enabled, allowIps, requireLogin |
| Group | `registerGroupMetadata()` | enabled, allowIps, allowRoles |
| API | `registerSecureRoute()` | enabled, allowIps, allowRoles, requireLogin, permission |

Each level can reject on its own; a rejection at any level stops the request.

## Evaluation flow

```
request arrives
  │
  ▼
System level (system.json)
  ├─ enabled: true?     → no  → 403
  ├─ allowIps match?    → no  → 403
  └─ requireLogin?      → anon → 401
  │
  ▼
Group level (registerGroupMetadata)
  ├─ enabled: true?     → no  → 403
  ├─ allowRoles match?  → no  → 403
  └─ requireLogin?      → anon → 401
  │
  ▼
API level (registerSecureRoute)
  ├─ enabled: true?     → no  → 403
  ├─ permission match?  → no  → 403
  └─ requireLogin?      → anon → 401
  │
  ▼
hand off to the handler
```

## Configuration

### System level (`system.json`)

```json
{
  "name": "myapp",
  "alias": "My app",
  "prefix": "/myapp",
  "enabled": true,
  "requireLogin": false,
  "allowIps": [],
  "allowRoles": []
}
```

### Group level (in a route file)

```js
registerGroupMetadata({
  name: 'article',
  description: 'Article management',
  prefix: '/v1',
  requireLogin: true,
  allowRoles: ['myapp_user', 'myapp_admin']
});
```

### API level (in a route file)

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

## Permission forms

`permission` accepts three shapes:

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

## IP matching

Wildcards and CIDR are supported:

```js
allowIps: [
  '192.168.1.100', // exact
  '192.168.1.*',   // wildcard (matched per segment, not by string prefix)
  '10.0.0.0/8',    // CIDR
  '*'              // allow everything
];
```

## WebSocket guard

WebSocket routes go through the same three levels:

```js
registerSecureWebSocket(fastify, {
  url: '/ws/monitor',
  requireLogin: true,
  allowRoles: ['fw_viewer'],
  handler: (connection, req, client) => { ... }
});
```

## URL composition

```
final URL = system.json.prefix + registerGroupMetadata.prefix + registerSecureRoute.url
```

Example:

```json
// system.json
{ "prefix": "/blog" }
```

```js
registerGroupMetadata({ prefix: '/v1' });
registerSecureRoute(fastify, { url: '/posts', ... });
// → GET /blog/v1/posts
```

## Persistence

Guard configuration is persisted in the **database**, table `guard_configs`
(`loadFromDB()` / `saveToDB()` in `src/app/guard/dao/guard-config.dao.js`, scheduled by
`src/api/guard-config.js` after boot), so it can be changed at runtime.

> ⚠️ `data/guard_config.json` was the local-file approach **before** the move to the database and
> is **deprecated** — editing it has no effect, and the service no longer reads or writes it.
