# Permissions (PBAC) {#permission}

## Design principles

1. **RBAC + ABAC hybrid**: roles carry the standard grants, inline policies allow ad-hoc wildcard
   grants
2. **Weight precedence**: an admin can only delegate permissions below their own rank
3. **App isolation with global visibility**: expressed through the `GLOBAL` placeholder
4. **Deny first**: a Deny statement always overrides Allow
5. **Permission points live in code, role policies live in the database**

## Permission registry

Codes follow the lowercase `{app}:{resource}:{action}` triple:

```js
// src/app/firewall/permission/index.js
export const FIREWALL_PERMISSIONS = createPermissionRegistry('firewall', 'Firewall module', {
  MONITOR: {
    READ: { code: 'fw:monitor:read', label: 'View monitoring data', type: 'read' },
    LOGS: { code: 'fw:monitor:logs', label: 'View access logs', type: 'read' }
  },
  BLOCK: {
    READ: { code: 'fw:block:read', label: 'View block list', type: 'read' },
    WRITE: { code: 'fw:block:write', label: 'Add / remove blocks', type: 'write' }
  },
  ADMIN: {
    ALL: { code: 'fw:admin:*', label: 'Admin wildcard', type: 'wildcard' }
  }
});
```

## Roles

### Hierarchy

```
superadmin (rank:99) → admin of every app (inherited automatically)
  ├── fw_admin (rank:90)    → firewall admin
  ├── fw_operator (rank:50) → firewall operator
  └── fw_viewer (rank:1)    → observer (granted by default)
```

### Definition

```js
// src/app/firewall/permission/roles.js
defineRoles([
  {
    code: 'fw_viewer',
    app_id: 'firewall',
    name: 'Firewall viewer',
    rank_level: 1,
    policy: {
      Version: '2026-06-06',
      Statement: [{ Effect: 'Allow', Action: [FIREWALL_PERMISSIONS.MONITOR.READ] }]
    }
  }
]);
```

::: warning `rank_level` has a hard ceiling
The range comes from `src/models/iam/Role.js` (`validate: { min: 0, max: 99 }`) — **99 is the
maximum**. Writing 100 does not fail locally, because once the role exists
`Role.findOrCreate()` only takes the "update policy" branch. But **a first deployment against an
empty database** (new environment, CI compose smoke test) really inserts, and then throws
`SequelizeValidationError: Validation max on rank_level failed` — and because `appsLoader` is
fail-fast, the application never boots. `src/__tests__/permission/role-rank-levels.test.js`
guards this using the model's own boundaries (derived, not hard-coded 0/99).
:::

### Policy format

**Statement form (recommended):**

```json
{
  "Version": "2026-06-06",
  "Statement": [
    { "Effect": "Allow", "Action": ["fw:config:read", "fw:config:write"] },
    { "Effect": "Deny", "Action": ["fw:config:delete"] }
  ]
}
```

## Loading permissions

```
loadUserPermissions(userId, appId)
  → query UserRole (current app + GLOBAL)
  → parse role.policy
  → superadmin gets the {appId}_admin role injected
  → query InlinePolicy (current app + GLOBAL)
  → merge allows / denies
  → cache in Redis for 5 minutes
```

## Matching engine

```js
function isPermissionMatch(pattern, target) {
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (pattern.endsWith(':*')) {
    return target.startsWith(pattern.slice(0, -1));
  }
  return false;
}

// deny first
function matchSingle(perm, allows, denies) {
  if (denies.some(d => isPermissionMatch(d, perm))) return false;
  return allows.some(a => isPermissionMatch(a, perm));
}
```

## Delegation tiers

| Level | Rank | Scope | Authority |
| --- | --- | --- | --- |
| L1: super admin | 99 | GLOBAL | everything |
| L2: global admin | 80 | GLOBAL | cross-app administration |
| L3: app admin | 60 | specific_app | one app |
| L4: module admin | 40 | specific_app | part of one app |

## OAuth 2.1 × PBAC

```
OAuth token scope      = what the client asked for
PBAC allows / denies   = what the user actually holds

effective permissions  = token scope ∩ PBAC allows − PBAC denies
```

Even a token with the highest scope is blocked once an administrator issues a Deny statement.

## StpUtil

```js
import StpUtil from '../../src/framework/auth/stp-util.js'; // repo path: src/framework/auth/stp-util.js

StpUtil.hasPermission('user:admin:*');   // test: true / false
StpUtil.checkPermission('user:admin:*'); // enforce: throws 403
StpUtil.checkPermissionAnd('a', 'b');    // all must pass
StpUtil.checkPermissionOr('a', 'b');     // any must pass
```
