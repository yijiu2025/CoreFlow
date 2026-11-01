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

Single source of truth: `src/framework/auth/permission/wildcard-match.js` (`isWildcardMatch`),
shared by the `api/guard.js` route guard and `StpUtil._isMatch` (previously two drifting copies).

```js
// src/framework/auth/permission/wildcard-match.js (actual source)
function isWildcardMatch(pattern, target) {
  if (typeof pattern !== 'string' || typeof target !== 'string') return false;
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (!pattern.includes('*')) return false;
  // escape all regex metacharacters first, then rejoin segments with .*
  const regex = new RegExp(
    '^' + pattern.split('*').map(seg => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'
  );
  return regex.test(target);
}

// deny first (direction: pattern = held permission pattern, target = concrete permission under test)
function matchSingle(perm, allows, denies) {
  if (denies.some(d => isWildcardMatch(d, perm))) return false;
  return allows.some(a => isWildcardMatch(a, perm));
}
```

Semantics:

| Pattern | Meaning |
| --- | --- |
| `*` | matches everything |
| `user:*` | anything starting with `user:` (`*` spans `:` segments) |
| `user:*:read` | mid-segment wildcards supported |
| otherwise | literal match — **metacharacters are not interpreted**; `user:read` never matches `userXread` (fixed 2026-11-01: the old implementation did not escape regex metacharacters) |

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

Source: `src/framework/auth/context/stp-util.js` (business code should import it through the
`framework/auth/index.js` facade re-export, not the subpath directly). Modeled after Java
Sa-Token: all static methods, resolves the current request via AsyncLocalStorage —
**must be called inside an HTTP request context** (throws outside ALS).

::: warning Two meanings of loginId — passing the wrong one fails silently
- **Permission / role series** operate on the current request user: no issue;
- **Ban series (`disable` / `untieDisable` / `isDisable` / `checkDisable` / `getDisableTime`)**:
  `loginId` must be the **numeric primary key** (the ban store keys by numeric `userId:service`)
  — passing the uid string returned by `getLoginId()` does not error but **never matches**;
  resolve `user.id` from uid in the admin DAO first;
- **Second-auth series (`openSafe` etc.)** already uses `state.user.userId` (numeric) internally;
  just pass `service`.
:::

### Authentication & identity

| Method | Purpose | On failure |
| --- | --- | --- |
| `getLoginId()` | current user identifier (**uid UUID**; client token context returns the client name) | — |
| `check()` | enforce login | throws 401 when not logged in |
| `checkRole(role)` | role check (**exact match**, no wildcards; roles have no deny dimension) | throws 403 |

### Permission checks (deny-first + wildcards)

Permission source is decoupled from the auth path: Session path reads the snapshot warmed at
createSession; JWT path reads a real-time snapshot via perm-cache (numeric key + fingerprint
check) — **JWTs never embed permissions**, so permission changes take effect immediately.
Incomplete shapes are treated as empty sets (fail-closed); auth failures never masquerade as 500.

| Method | Purpose | On failure |
| --- | --- | --- |
| `getPermissionList()` | returns `{ allows, denies }` (**read-only reference**, do not mutate) | — |
| `hasPermission(perm)` | boolean test | — |
| `checkPermission(perm)` | enforce one | throws `NotPermissionException` (403) |
| `checkPermissionAnd(...perms)` | AND: all must pass | throws 403 on first failure; **zero args throws explicitly** (vacuous truth = no guard, likely a typo) |
| `checkPermissionOr(...perms)` | OR: any must pass | throws 403 when none pass; **zero args throws explicitly** |

```js
import { StpUtil } from '../../src/framework/auth/index.js';

StpUtil.hasPermission('user:admin:*');   // test: true / false
StpUtil.checkPermission('user:write');   // enforce: throws 403
StpUtil.checkPermissionAnd('a', 'b');    // AND: all must pass
StpUtil.checkPermissionOr('a', 'b');     // OR: any must pass
```

### Account bans (disable series, async)

Stored in Redis keyed by numeric `userId:service`, auto-unbanned at TTL expiry;
`service='login'` blocks new logins, `'access'` blocks requests, custom dimensions allowed.
See the header of `src/framework/auth/security/ban.js`.

| Method | Purpose |
| --- | --- |
| `disable(loginId, service, time, opts?)` | ban (seconds; `-1` = permanent), opts: `{ reason, level, operator }` |
| `disableLevel(loginId, service, level, time, opts?)` | tiered ban by punishment level (level ≥ 1, business-defined) |
| `untieDisable(loginId, ...services)` | unban, returns number of services actually untied |
| `isDisable(loginId, service)` | banned? (ignores level) |
| `checkDisable(loginId, ...services)` | enforce not banned; throws 403 (code=`ACCOUNT_BANNED`) |
| `getDisableTime(loginId, service)` | remaining seconds: `-2` = not banned, `-1` = permanent |

### Second authentication (openSafe series, async)

"Confirm again" mechanism for sensitive operations: after the business route verifies identity
(re-enter password / OTP), `openSafe` opens a time window; `safe` routes pass inside the window,
`checkSafe` throws 403 (code=`SECOND_AUTH_REQUIRED`) outside. Operates on the **current request
user**; Redis failures fail closed (treated as not opened). See `src/framework/auth/security/safe.js`.

| Method | Purpose |
| --- | --- |
| `openSafe(service, safeTime?)` | open the window (default 1800s), returns `{ openedAt, expireAt }` |
| `isSafe(service)` | inside the window? |
| `checkSafe(service)` | enforce; throws 403 when not opened/expired (`details.service` for the frontend) |
| `closeSafe(service)` | close proactively (after the sensitive operation, to shrink exposure) |
| `getSafeTime(service)` | remaining seconds: `-1` = not opened |

::: tip Why there is no `StpUtil.login()`
The login entry point is oauth21's `login.service` (full orchestration of password verification +
createSession + cookie issuance). A placeholder `login()` once existed, but the ALS context only
has the request — no reply — so cookies could never be sent; removed after the 2026-11-01 review.
:::
