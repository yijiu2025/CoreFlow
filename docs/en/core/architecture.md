# Architecture {#architecture}

## System layers

CoreFlow is a **layered** framework — every layer has one job:

```
┌─────────────────────────────────────────────────────────────┐
│                     Clients (not in this repo)               │
│  Web app / mini program / desktop / third party — any stack   │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP / WebSocket (session cookie + signature headers)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Request pipeline                        │
│  Cookie → Auth → RateLimit → Firewall → Guard → Handler      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Application layer                           │
│   oauth21 (authz) │ user │ admin │ firewall                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               Framework layer  src/framework/                │
│   auth │ db │ redis │ loader │ log │ verify │ websocket      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Storage layer                           │
│              MySQL 8.0  │  Redis 7                            │
└─────────────────────────────────────────────────────────────┘
```

## Request pipeline

The complete path of one HTTP request:

```
onRequest[0]  →  @fastify/cookie     parse cookies
onRequest[1]  →  auth                session validation (sid cookie → Redis → request.state.user)
onRequest[2]  →  @fastify/rateLimit  global rate limiting
onRequest[3]  →  firewall            five-stage interception pipeline
preHandler    →  guard               three-level permission guard
preHandler    →  verifySignature     H5 signature check (OAuth 2.1 routes only)
handler       →  business route
onSend        →  logging + connection release
onResponse    →  scan trap (404/403 detection)
```

## Module loading

The engine scans `src/framework/loader/registry/` and runs files in numeric-prefix order:

```
00-globals.js     → decorate reply.result
01-monitor.js     → request metrics + slow-request warnings
02-redis.js       → Redis connection + health monitoring (app.redis = null when unreachable)
03-db.js          → Sequelize connection (configured but unreachable → boot fails)
04-auth.js        → auth plugin
05-firewall.js    → firewall
06-models.js      → load models
07-keys.js        → JWT keys + startup self-check (KEK / active key)
08-api.js         → load routes
09-notice.js      → SMTP config seed
10-apps.js        → app config + permissions + roles + OAuth clients
```

**Failure semantics**: only `01-monitor` / `02-redis` / `09-notice` are listed in
`OPTIONAL_LOADERS` (`src/framework/loader/engine.js`) — their failure costs one auxiliary
capability. Every other loader is **fail-fast**: a process missing auth, firewall, models,
routes or apps can bind a port but cannot serve correct requests, and "booted successfully" is
the worst possible failure shape. `03-db` only fails when the database is **configured but
unreachable**; with no DB configured, local and test runs still start.

**Redis degradation boundary** (easy to get wrong; this is the measured behaviour):

- **Not configured** (`REDIS_ENABLED` not `true`, or no `REDIS_HOST`) → `getStore()` returns
  the in-process `MapStore`.
- **Configured but unreachable at boot** → `app.redis = null`, and the access layer **still
  selects the Redis implementation**; operations throw `RedisRequiredError`
  (`statusCode = 503`). It does **not** fall back to memory.
- At runtime this is a "503", not a "degrade": `redis-store.js` deliberately refuses to reuse
  the in-memory fallback, because per-instance counters, rate limits and sessions silently
  diverge across replicas. For short-lived data that needs resilience, use
  `getStore(prefix, { backup: true })` with a standby Redis — if both are down it is still 503.

Every loader exports a default function that receives the `app` instance; errors are caught and
logged without blocking other modules.

## Model namespaces

Models are registered as `app.db.<namespace>.<ModelName>`, one namespace per domain directory:

| Namespace | Models | Tables |
| --- | --- | --- |
| `db.user` | User, UserIdentity | user_user, user_identity |
| `db.iam` | Role, UserRole, InlinePolicy, Permission | iam_role, iam_user_role, iam_inline_policy, permissions |
| `db.oauth21` | OauthClient, OauthCode, OauthToken, OauthApproval, OauthConsent | oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents |
| `db.notice` | EmailCode, NoticeConfig | notice_email_codes, notice_configs |
| `db.session` | UserSession, SessionToken, SessionLog, AuditLog | session_user_session, session_tokens, session_logs, session_audit_logs |

## Directory conventions

| Path | Purpose | Required |
| --- | --- | --- |
| `src/app/{name}/config.js` | app config | ✅ |
| `src/app/{name}/permission/` | permission definitions | optional |
| `src/api/{name}/system.json` | route-domain config | ✅ |
| `src/api/{name}/v1/*.js` | route files | ✅ |
| `src/models/{name}/` | models | optional |

## Next steps

- [Auth integration](/en/standards/auth-integration) — the frontend/backend wire protocol
- [Project structure](/en/guide/project-structure) — the full directory tree
- [Quick start](/en/guide/quick-start) — boot an instance
