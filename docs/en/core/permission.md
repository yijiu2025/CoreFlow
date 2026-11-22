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
// src/app/oauth21/permission/index.js
const OAUTH_PERMISSIONS = createPermissionRegistry('oauth21', 'OAuth 2.1 authorization server', {
  CLIENT: {
    READ: { code: 'oauth:client:read', label: 'View clients', type: 'read' },
    UPDATE: { code: 'oauth:client:update', label: 'Edit clients', type: 'write' }
  },
  TOKEN: {
    READ: { code: 'oauth:token:read', label: 'View tokens', type: 'read' },
    REVOKE: { code: 'oauth:token:revoke', label: 'Revoke tokens', type: 'high_risk' }
  },
  ADMIN: {
    ALL: { code: 'oauth:admin:*', label: 'Admin wildcard', type: 'wildcard' }
  }
});
```

## Roles

### Hierarchy

```
superadmin (rank:99) → admin of every app (inherited automatically)
  ├── oauth_admin (rank:80)  → authorization server admin
  └── oauth_viewer (rank:10) → observer (granted by default)
```

### Definition

```js
// src/app/oauth21/permission/roles.js
defineRoles([
  {
    code: 'oauth_viewer',
    app_id: 'oauth21',
    name: 'OAuth viewer',
    rank_level: 10,
    is_default: true, // granted automatically on authorization (see below)
    policy: {
      Version: '2026-06-06',
      Statement: [{ Effect: 'Allow', Action: [OAUTH_PERMISSIONS.CLIENT.READ, OAUTH_PERMISSIONS.TOKEN.READ] }]
    }
  }
]);
```

### Default role (granted on authorization)

When a user authorizes an application for the first time, one "normal tier" role is granted
automatically. It is declared in **two places**, resolved **config first, code second**:

1. `default_role` in `src/app/<app>/config.js` — the primary source; editing config overrides code;
2. `is_default: true` on the role in `roles.js` — the secondary source, written next to the definition
   so it is hard to forget.

```js
// src/app/oauth21/config.js
default_role: 'oauth_viewer',
```

Resolution order (`src/app/oauth21/dao/approval.dao.js`):
`config.default_role` → `is_default` → the **lowest-ranked** role in that permission namespace
(must be `rank_level <= 20`). `default_role: null` means "intentionally grant nothing" (e.g. `notice`,
which only has an admin role).

#### Closed applications: use `null`, assign roles manually

Some applications must not be reachable just because someone registered — the admin console is the
obvious case: `config.access` declares a gate (`anyPermission: ['admin:*']`), and accounts without
management capability are rejected during `bind-session` with `access.denyMessage`.

Such applications must use `default_role: null` **and** must not mark the role `is_default`:

- If the default role satisfies the gate (`admin_viewer` holds every read code, so `admin:*` matches),
  any registered user who clicks "authorize" can browse users, departments, roles and logs — the gate
  is decoration;
- If it does not satisfy the gate, the user receives a role that cannot open a single page and gets a
  403 on login — more confusing than granting nothing.

How roles are granted instead:

1. an administrator assigns them in "Users → Assign roles"
   (`POST /admin/v1/users/roles/batch`, append/remove, cross-application);
2. GLOBAL `superadmin` inherits every application's `{appId}_admin` automatically via
   `permission-loader` — no per-role assignment needed.

The boot-time `auditDefaultRoles` reports an **error** for "gate + default role", and
`__tests__/permission/role-rank-levels.test.js` runs it against the real config.

::: warning Declaring roles means declaring the default role too

- **Throws at registration** (import time = boot failure): missing `app_id` / `rank_level` /
  `policy.Statement`, two `is_default` roles for one app, or a default role above the normal tier (20).
- **Logged at boot** (`auditDefaultRoles`): a typo in `config.default_role`, a mismatch between the
  two declarations, or no declaration at all (falls back to lowest rank). The first two are errors,
  the last one is a warning.
- `src/__tests__/permission/role-rank-levels.test.js` runs the audit against the real config and the
  real `roles.js`, so a mistake fails the test suite instead of a deployment.

Namespace note: the admin console's app id, OAuth client id and role namespace are **all
`admin`** (the former `console` app was merged into `admin` on 2026-11-21; `permission_app_id`
is gone). `default_role` uses a code from the `admin` namespace (e.g. `admin_viewer`).
:::

::: warning `rank_level` has a hard ceiling
The range comes from `src/models/iam/Role.js` (`validate: { min: 0, max: 99 }`) — **99 is the
maximum**. Writing 100 does not fail locally, because once the role exists
`Role.findOrCreate()` only takes the "update policy" branch. But **a first deployment against an
empty database** (new environment, CI compose smoke test) really inserts, and then throws
`SequelizeValidationError: Validation max on rank_level failed` — and because `appsLoader` is
fail-fast, the application never boots. `src/__tests__/permission/role-rank-levels.test.js`
guards this using the model's own boundaries (derived, not hard-coded 0/99).
:::

::: tip A new rank must be **strictly below** your own
Both create-role and change-rank go through `assertRankBelowActor`: `new rank < my highest rank`,
**equal is rejected too**. Rank is the gate for "who may manage whom" — same-rank roles are
`manageable: false` in the list and rejected on the grant side (`rank >= maxRank`). Allowing
"equal to myself" at write time therefore mints a role nobody can manage. That is why 99 only
comes from code declarations (`superadmin`, poseadmin); the UI caps at 98.

On edit the check only fires when the value actually changes — the dialog re-submits untouched
fields, and echoing the same rank is not "adjusting a rank".
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

## Menu visibility (default deny)

`GET /admin/v1/session/routes` decides the sidebar. Only three cases are admitted:

1. **Exempt accounts**: role includes `superadmin`, or the policy holds `*` → the whole tree (including brand-new, not-yet-granted menus — otherwise nobody could ever grant them).
2. **Self-service area**: a page whose `path` starts with `/settings/` **and** declares no permission code (profile / notification preferences / appearance / account security). A directory is admitted only when every child is a self-service page.
3. **Explicit grant**: a `sys_role_menu` row for that role × menu.

Nothing else is visible by default. `admin:*` is **not** a menu exemption — it means "all APIs and buttons allowed"; menus are the navigation layer, a different concern.

> 2026-11-22: `App management` (menu 54) had zero `sys_role_menu` rows, yet accounts holding `admin_admin` (policy = `admin:*`) could see it. Two causes stacked: pruning treated `admin:*` as "superadmin, take the whole tree", and a fallback rule treated "top-level + no permission code" as a self-service entry.

### Conventions

| Case                        | Rule                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New page menu (`type=menu`) | **Must** declare a permission code; otherwise rejected with `INVALID_PARAM` (`api/admin/v1/menus.js` → `assertMenuDeclaresPermission`)                                                                                   |
| Self-service page           | Only under `/settings/` and without a code; that prefix is a **reserved namespace**, admin pages must not use it                                                                                                         |
| Granting a new menu         | Starts with zero grants → invisible to everyone → superadmin ticks it in Roles → Menu grants                                                                                                                             |
| Empty directory             | Directory granted but **no** child page granted → the whole group is dropped. An expandable group that opens to nothing reads as a rendering bug (that is exactly what `admin_operator` saw with `System` on 2026-11-22) |
| Unpublish                   | `visible=0` outranks grants: even granted users stop seeing it, while `sys_role_menu` rows are kept (set back to 1 to restore)                                                                                           |

Single source of truth: `src/app/admin/console/services/menu-visibility.service.js`, shared by the read-side pruning and the write-side validation. Regression guards: `src/__tests__/app/admin/console/session-routes.test.js` and `menu-visibility.test.js`.

## Admission gate vs. self-service

Two layers, **never mixed**:

| Layer      | Question                                   | Rule                                                         | Implementation                                     |
| ---------- | ------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------- |
| Admission  | May this account enter the console at all? | `config.access`: `anyPermission` / `anyRole` / `selfService` | `framework/security/auth/permission/app-access.js` |
| Capability | What may it do once inside?                | PBAC `allows` / `denies` + role→menu grants                  | `api/guard.js` + `sys_role_menu`                   |

`bind-session` (at login) and `GET /session/me` (on every refresh) read the **same** policy. Writing it twice produces either "logs in, then 403 on refresh" or the reverse.

### Why personal settings is not a permission code

Profile / notification preferences / appearance / account security are visible to **every account that can enter the console**. That comes from two things only: the `/settings/` prefix on the menu side, and `requireLogin` plus a "read only `request.state.user.uid`" scope on the API side.

It is deliberately **not** a grantable code (such as `admin:self`): codes get granted and revoked by roles, and one unticked box turns into "login succeeds, sidebar is blank". Worse, that failure only reproduces on accounts **without** `admin:*` — test accounts hold `admin:*`, so tests never catch it.

`access.selfService` is an **admission** switch, not a permission:

- `false` (default, current state) = **closed app**: an account without `admin:*` / `superadmin` cannot even call `/session/me`; the four personal pages are visible only to accounts already granted management capability;
- `true` = **semi-open**: any fully authenticated account may enter, but sees only those four pages; every other endpoint still answers 403 through its own `requirePermission`.

`denies` outranks `selfService`: a banned account does not gain self-service access by being logged in. The switch only accepts a strict `true` (`'true'`, `1` count as off), because flipping it by accident opens the console to every registered user.

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

Single source of truth: `src/framework/security/auth/permission/wildcard-match.js` (`isWildcardMatch`),
shared by the `api/guard.js` route guard and `StpUtil._isMatch` (previously two drifting copies).

```js
// src/framework/security/auth/permission/wildcard-match.js (actual source)
function isWildcardMatch(pattern, target) {
  if (typeof pattern !== 'string' || typeof target !== 'string') return false;
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (!pattern.includes('*')) return false;
  // escape all regex metacharacters first, then rejoin segments with .*
  const regex = new RegExp(
    '^' +
      pattern
        .split('*')
        .map(seg => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$'
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

| Pattern       | Meaning                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `*`           | matches everything                                                                                                                                                           |
| `user:*`      | anything starting with `user:` (`*` spans `:` segments)                                                                                                                      |
| `user:*:read` | mid-segment wildcards supported                                                                                                                                              |
| otherwise     | literal match — **metacharacters are not interpreted**; `user:read` never matches `userXread` (fixed 2026-11-01: the old implementation did not escape regex metacharacters) |

## Delegation tiers

| Level            | Rank | Scope        | Authority                |
| ---------------- | ---- | ------------ | ------------------------ |
| L1: super admin  | 99   | GLOBAL       | everything               |
| L2: global admin | 80   | GLOBAL       | cross-app administration |
| L3: app admin    | 60   | specific_app | one app                  |
| L4: module admin | 40   | specific_app | part of one app          |

## OAuth 2.1 × PBAC

```
OAuth token scope      = what the client asked for
PBAC allows / denies   = what the user actually holds

effective permissions  = token scope ∩ PBAC allows − PBAC denies
```

Even a token with the highest scope is blocked once an administrator issues a Deny statement.

## StpUtil

Source: `src/framework/security/auth/context/stp-util.js` (business code should import it through the
`framework/security/auth/index.js` facade re-export, not the subpath directly). Modeled after Java
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

| Method            | Purpose                                                                              | On failure                    |
| ----------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| `getLoginId()`    | current user identifier (**uid UUID**; client token context returns the client name) | —                             |
| `check()`         | enforce login                                                                        | throws 401 when not logged in |
| `checkRole(role)` | role check (**exact match**, no wildcards; roles have no deny dimension)             | throws 403                    |

### Permission checks (deny-first + wildcards)

Permission source is decoupled from the auth path: Session path reads the snapshot warmed at
createSession; JWT path reads a real-time snapshot via perm-cache (numeric key + fingerprint
check) — **JWTs never embed permissions**, so permission changes take effect immediately.
Incomplete shapes are treated as empty sets (fail-closed); auth failures never masquerade as 500.

| Method                         | Purpose                                                               | On failure                                                                                             |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `getPermissionList()`          | returns `{ allows, denies }` (**read-only reference**, do not mutate) | —                                                                                                      |
| `hasPermission(perm)`          | boolean test                                                          | —                                                                                                      |
| `checkPermission(perm)`        | enforce one                                                           | throws `NotPermissionException` (403)                                                                  |
| `checkPermissionAnd(...perms)` | AND: all must pass                                                    | throws 403 on first failure; **zero args throws explicitly** (vacuous truth = no guard, likely a typo) |
| `checkPermissionOr(...perms)`  | OR: any must pass                                                     | throws 403 when none pass; **zero args throws explicitly**                                             |

```js
import { StpUtil } from '../../src/framework/security/auth/index.js';

StpUtil.hasPermission('user:admin:*'); // test: true / false
StpUtil.checkPermission('user:write'); // enforce: throws 403
StpUtil.checkPermissionAnd('a', 'b'); // AND: all must pass
StpUtil.checkPermissionOr('a', 'b'); // OR: any must pass
```

### Account bans (disable series, async)

Stored in Redis keyed by numeric `userId:service`, auto-unbanned at TTL expiry;
`service='login'` blocks new logins, `'access'` blocks requests, custom dimensions allowed.
See the header of `src/framework/security/auth/security/ban.js`.

| Method                                               | Purpose                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `disable(loginId, service, time, opts?)`             | ban (seconds; `-1` = permanent), opts: `{ reason, level, operator }` |
| `disableLevel(loginId, service, level, time, opts?)` | tiered ban by punishment level (level ≥ 1, business-defined)         |
| `untieDisable(loginId, ...services)`                 | unban, returns number of services actually untied                    |
| `isDisable(loginId, service)`                        | banned? (ignores level)                                              |
| `checkDisable(loginId, ...services)`                 | enforce not banned; throws 403 (code=`ACCOUNT_BANNED`)               |
| `getDisableTime(loginId, service)`                   | remaining seconds: `-2` = not banned, `-1` = permanent               |

### Second authentication (openSafe series, async)

"Confirm again" mechanism for sensitive operations: after the business route verifies identity
(re-enter password / OTP), `openSafe` opens a time window; `safe` routes pass inside the window,
`checkSafe` throws 403 (code=`SECOND_AUTH_REQUIRED`) outside. Operates on the **current request
user**; Redis failures fail closed (treated as not opened). See `src/framework/security/auth/security/safe.js`.

| Method                         | Purpose                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `openSafe(service, safeTime?)` | open the window (default 1800s), returns `{ openedAt, expireAt }`                |
| `isSafe(service)`              | inside the window?                                                               |
| `checkSafe(service)`           | enforce; throws 403 when not opened/expired (`details.service` for the frontend) |
| `closeSafe(service)`           | close proactively (after the sensitive operation, to shrink exposure)            |
| `getSafeTime(service)`         | remaining seconds: `-1` = not opened                                             |

::: tip Why there is no `StpUtil.login()`
The login entry point is oauth21's `login.service` (full orchestration of password verification +
createSession + cookie issuance). A placeholder `login()` once existed, but the ALS context only
has the request — no reply — so cookies could never be sent; removed after the 2026-11-01 review.
:::
