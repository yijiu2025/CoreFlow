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

### Direction of runtime field changes (since 2026-11-07)

Only four fields are operator-adjustable (`RUNTIME_FIELDS` in `app/guard/services/direction.js`):
`enabled`, `requireLogin`, `allowIps`, `allowRoles`.
`requirePermission` / `freshPermission` are **code-level authorization declarations** that neither the
panel nor the database can change — they are the basis of PBAC itself; making them writable would
reduce the permission model to a form field.

Changes are treated by direction:

| Direction | Examples | Step-up auth | Signed envelope |
|---|---|---|---|
| Tighten | disable a module, add a role, add an IP, `requireLogin: false → true` | required | not required |
| Relax | enable a module, drop a role, clear a list, `requireLogin: true → false` | required | required |
| No auth semantics | only `description` | not required | not required |

> Tightening needs authentication too: disabling a module or removing a role has the same
> operational impact as an unauthorized relaxation. Signed envelopes are only for relaxations —
> more tightening in the database can only make things stricter.

Two semantics are easy to invert:

- `allowRoles: []` / `allowIps: []` means **unrestricted**, so clearing a list is a relaxation and
  going from empty to non-empty is a tightening;
- a patch that both adds and removes is treated as a **relaxation**, so smuggling a deletion through
  cannot bypass authentication.

### Step-up auth and signed envelopes

Any runtime-field change requires a step-up ticket first (except `description`):

```
POST /api/firewall/v1/apiconfigs/stepup/challenge   { system, group, apiKey, patch, reason, method }
POST /api/firewall/v1/apiconfigs/stepup/verify      { challengeId, code | password }
PATCH /api/firewall/v1/apiconfigs/:system/:group    Header: X-Stepup-Token: <ticket>
```

**Who can change**: superadmins only (role `superadmin`, or a wildcard `*` in the permission set).
`fw:config:write` is not enough — it can be delegated to operators, and the authority to change
security policy should not spread with operations roles.
If `GUARD_SUPERADMIN_EMAILS` is set (comma-separated, case-insensitive), the email bound to the
account **in the database** must be on the list; when unset it falls back to the superadmin own email.
The check reads the stored email rather than the session snapshot, so rebinding the address cannot
be used to slip past an existing session.


- `method` accepts `email` (6-digit code) and `password`; **SMS is not wired yet**, so `sms` is
  explicitly rejected rather than silently downgraded;
- tickets live 5 minutes, are single-use, and are bound to
  `sha256(target path + patch runtime fields)` — changing either target or content invalidates them,
  so one approval covers exactly the change it was approved for;
- a relaxed node carries `_relaxation` (`at/by/reason/sig`), and the signature covers every runtime
  field value of that node.

Boot-time and cross-instance merges verify the signature: **a relaxation with a missing or mismatched
signature causes the whole node to be skipped, with a warning**. As a result,
`UPDATE guard_configs SET config = ...` cannot loosen permissions — deliberate, because the database
must not become a bypass around step-up auth. In an emergency, re-submit through the panel; the
server signs it there.

> The signing key is derived from `APP_SECRET`. Rotating `APP_SECRET` invalidates existing
> relaxations, which fall back to the code baseline (stricter). Boot logs list each ignored node;
> re-authorize them as needed.
