# CoreFlow

<p align="center">
  <strong>A backend framework on Fastify v5 + Sequelize v6: authentication · PBAC permissions · five-layer firewall · OAuth 2.1</strong>
</p>

<p align="center">
  <b>English</b> · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://yijiu2025.github.io/CoreFlow/"><img src="https://img.shields.io/badge/docs-read%20online-4FC08D?logo=vitepress&logoColor=white" /></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Fastify-v5-000000?logo=fastify&logoColor=white" />
  <img src="https://img.shields.io/badge/MySQL-%E2%89%A58.0-4479A1?logo=mysql&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-optional-DC382D?logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue" />
</p>

---

> The documentation site is currently written in Chinese. This README and the doc map
> ([docs/README.md](./docs/README.md)) are the English entry points.

## What this is

A **backend skeleton you can actually boot**, taking the parts every project rewrites from
scratch — auth, authorization, rate limiting, request interception, audit — and shipping
them as framework capabilities:

- **Authentication**: session cookie (default) or JWT bearer, RSA-encrypted login,
  HMAC-signed cookies, nonce-based replay protection
- **Permissions (PBAC)**: `app:resource:action` triples with wildcards, **deny-before-allow**
  precedence and role weights; three guard levels (System → Group → API)
- **Firewall**: a five-stage pipeline (connection tracking → blocking → challenge → bot
  detection → geo/endpoint rate limiting), tunable at runtime from the admin API
- **OAuth 2.1**: authorization code + PKCE, client credentials, device code, OIDC discovery,
  refresh-token rotation with reuse detection
- **Redis is optional, but the semantics are explicit**: with no Redis configured it runs on
  in-process implementations (single instance, zero setup); once configured it must be
  reachable — otherwise the access layer returns **503** instead of silently falling back to
  memory, because a quiet downgrade breaks sessions and rate limiting across instances

## What this is **not**

> Since **2026-10-31** this repository contains **the backend only**. The frontend projects
> (`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`) have been
> removed from the index and are maintained separately
> (`oauth21` → [oauth-web](https://github.com/yijiu2025/oauth-web)).
>
> Frontend and backend are coupled through an **HTTP wire protocol only**: session cookies,
> the `x-sign` header, the `x-csrf-token` header. The contract lives in
> [Authentication integration](https://yijiu2025.github.io/CoreFlow/standards/auth-integration);
> any frontend stack will do.

## Quick start

```bash
# 1. Clone (theme-core is a git submodule)
git clone --recurse-submodules https://github.com/yijiu2025/CoreFlow.git
cd CoreFlow

# 2. Install dependencies
npm install

# 3. Configure the environment (three secrets MUST be changed; weak values refuse to boot
#    in production)
cp .env.example .env

# 4. Create the schema
npm run migrate

# 5. Create a super admin
npm run setup:admin -- --email admin@example.com

# 6. Boot (dev mode, nodemon hot reload)
npm run dev
```

Verify:

```bash
curl -i http://localhost:3000/v1/health/live    # liveness (200 while the process runs)
curl -i http://localhost:3000/v1/health/ready   # readiness (503 when a critical dependency is down)
```

> Every response is wrapped as `{ code, message, data, timestamp, requestId }` — never a bare object.
> Requirements: **Node ≥ 20.19** (ESM; CI and the image both run 22 — see the note below),
> MySQL ≥ 8.0; Redis optional (mandatory for multi-instance).
>
> Node 18 is no longer supported: `@fastify/static@10` pulls the ESM-only
> `content-disposition@3`, which needs `require(esm)` support (Node ≥ 20.19 / 22.12).
> Full walkthrough and troubleshooting:
> [Quick start](https://yijiu2025.github.io/CoreFlow/guide/quick-start).

## Project layout

```
src/
├── app.js              # Fastify instance creation + lifecycle orchestration
├── framework/          # Infrastructure (15 sub-domains, no business logic)
│   ├── auth/  jwt/  keys/            # Session / cookies / signatures / passwords / keys
│   ├── db/  redis/                   # Sequelize connection / cache · locks · queues · pubsub
│   ├── loader/  config/  log/  ops/  # Loader / env validation / logging / readiness
│   ├── verify/  notice/  scheduler/  # CAPTCHA / mail / cron jobs
│   └── websocket/  cli/  release/
├── app/                # Business apps (one directory = one app: oauth21 / user / admin /
│                       #   firewall / guard / notice / posecraft / retroweb)
├── api/                # Route layer (domain/version); guard.js is the three-level guard engine
├── models/             # Sequelize models (user / iam / oauth21 / session / key /
│                       #   notice / guard / posecraft / retroweb)
├── data/               # Runtime default config (firewall / scheduler / traffic stats)
└── shared/  utils/  public/
```

For the full tree (including loader order and fail-fast semantics) see
[Project structure](https://yijiu2025.github.io/CoreFlow/guide/project-structure).

## What happens on boot

`index.js → createApp() → initLoader()`, loading in filename-prefix order from
`src/framework/loader/registry/`:

```
00-globals   decorate reply.result       06-models   scan src/models/ and register every model
01-monitor   request metrics / slow-request warnings   07-keys   JWT keys + startup self-check
02-redis     connect + health monitoring 08-api      scan src/api/ and register routes
03-db        Sequelize connection        09-notice  seed SMTP config
04-auth      session validation + ALS    10-apps    app config + roles + OAuth clients
05-firewall  five-stage pipeline
```

`01-monitor` / `02-redis` / `09-notice` are optional loaders (failures only warn); everything
else is **fail-fast** — a process that binds a port but cannot serve correct responses is
harder to diagnose than one that exits.

## Permissions: three guard levels

| Level | Declared in | Options |
| --- | --- | --- |
| **System** | `src/api/<domain>/system.json` | `enabled` / `allowIps` / `requireLogin` |
| **Group** | `registerGroupMetadata()` | `enabled` / `allowIps` / `allowRoles` |
| **API** | `registerSecureRoute()` | `requireLogin` / `requirePermission` / `requireSignature` / `config.rateLimit` |

```js
// Single permission (deny beats allow; wildcards are suffix-only `:*`)
registerSecureRoute(fastify, {
  name: 'readConfig',
  method: 'GET',
  url: '/config',
  requirePermission: 'fw:config:read',
  handler: async (req, reply) => reply.result.success(await readConfig())
});

// Any of (OR)
requirePermission: { any: ['fw:block:write', 'fw:admin:*'] }

// All of (AND)
requirePermission: { all: ['fw:config:read', 'fw:config:write'] }
```

Evaluation order: `enabled → IP/roles → login → permissions (a deny short-circuits)`.
Not logged in returns **401**, insufficient permissions **403**, and a malformed permission
string **fails closed** (also 403).

## Firewall: five-stage pipeline

```
request → ① connection tracking (concurrency cap) → ② global blocking (IP/device/fingerprint lists)
        → ③ human challenge (challenge cookie) → ④ bot detection (UA patterns + burst behaviour)
        → ⑤ geo-fencing / endpoint rate limiting
```

Detectors live in `src/app/firewall/engine/detectors/`: `rate-limiter` (sliding window, one
Redis Lua round-trip + in-memory fallback), `bot-detector`, `brute-force`, `scan-trap`
(404/403 scan trap), `geo-filter`. Rules and thresholds come from
`src/data/firewall_config.json` and can be hot-edited through the admin API
(`PATCH /api/firewall/v1/monitor/settings`).

## API domains

| Domain | Prefix | Capabilities |
| --- | --- | --- |
| `oauth21` | `/oauth2.1` | Authorization code + PKCE / login / token / revocation / device code / OIDC |
| `user` | `/user/v1` | Profile, permissions, sessions, devices, registration, password reset |
| `auth` | `/auth/v1` | Session binding / account switching / H5 signed tokens / challenge verification |
| `admin` | `/admin/v1` | IAM roles, policies, client management |
| `notice` | `/notice/v1` | Notification channels and templates |
| `verify` | `/verify/v1` | Image CAPTCHA, email verification codes |
| `firewall` | `/api/firewall/v1` | Monitoring, blocks, allowlists, config, WebSocket |
| `system` | `/v1` | Health probes, system info |
| `posecraft` / `retroweb` | `/posecraft` · `/retroweb` | Bundled business apps (removable) |

Endpoint details: [OAuth 2.1 API report](https://yijiu2025.github.io/CoreFlow/oauth21-api-report)
and [API route conventions](https://yijiu2025.github.io/CoreFlow/development/api-routes).

## Environment variables

62 configurable keys, all documented with defaults in `.env.example`. The **three secrets you
must set in production**:

```ini
APP_SECRET=       # ≥ 32 chars; weak/default values are rejected by validateEnv at boot
SESSION_SECRET=   # cookie signing (rotating it logs everyone out)
FIREWALL_SECRET=  # challenge-cookie signing

DB_HOST=127.0.0.1
DB_NAME=your_database_name
DB_USER=root

CORS_ORIGINS=https://your-domain.com   # required in production: sensitive endpoints fail closed when empty
```

Two more that commonly bite:

- `PROXY_TRUST_CIDR`: set it only when a reverse proxy really sits in front, and list the
  proxy's **exact address** (e.g. `172.18.0.2/32`). Trusting a whole subnet lets clients forge
  `X-Forwarded-For`, which defeats IP allowlists, rate-limit keys and block records.
- `REDIS_ENABLED`: if set, Redis must be reachable (otherwise 503 at the access layer); if
  unset, in-process implementations are used.

## Commands

```bash
npm run dev            # development (nodemon hot reload)
npm start              # production start (reads .env.production)
npm run migrate        # run database migrations
npm run setup:admin    # create / grant a super admin
npm run revoke:admin   # revoke a super admin (the last one is refused)
npm run cli            # interactive admin terminal
npm test               # Jest (105 suites / 1250 tests)
npm run lint           # ESLint (auto-fix)
npm run verify:all     # cross-process gates (locks / queues / guard sync / metrics / WS fan-out)
npm run docs:dev       # serve the documentation site locally
```

## Documentation

| Entry | What it covers |
| --- | --- |
| [docs/README.md](./docs/README.md) | Documentation map — read this before searching |
| [Online docs](https://yijiu2025.github.io/CoreFlow/) | Full VitePress site (Chinese) |
| [Architecture](https://yijiu2025.github.io/CoreFlow/core/architecture) | Layering and dependency direction |
| [Request pipeline](https://yijiu2025.github.io/CoreFlow/core/request-pipeline) | The full path of one request |
| [Auth integration](https://yijiu2025.github.io/CoreFlow/standards/auth-integration) | Frontend/backend wire protocol (cookies / signatures / CSRF) |

## Contributing

Run `npm run lint && npm test` before committing. Commit messages follow Conventional Commits
(`fix` → patch, `feat` → minor, breaking change → major); releases are cut by
`node scripts/release.mjs --apply`. Details:
[Git commit and release rules](https://yijiu2025.github.io/CoreFlow/standards/git-release-rules).

Translations are welcome — add `README.<locale>.md` next to this file and link it in the
language switcher at the top.

## License

[GPL-3.0](./LICENSE)
