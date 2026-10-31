# Project structure {#project-structure}

> Since 2026-10-31 this repository is **backend-only**. The frontend projects (`oauth21` /
> `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`) are maintained separately;
> their names remain in `package.json` `workspaces` so that a local checkout of both sides
> shares one dependency tree — npm simply skips them when the directories are absent.

## Overview

```
CoreFlow/
├── index.js                    # entry point
├── package.json                # workspaces: packages/* + three (already removed) frontend names
├── .env                        # environment (templates: .env.example / .env.docker.example)
│
├── src/
│   ├── app.js                  # Fastify instance + lifecycle orchestration
│   │
│   ├── framework/              # infrastructure layer (no business logic)
│   │   ├── auth/               # session / cookie / signature / password / device
│   │   ├── jwt/                # JWT signing and verification (keys from framework/keys)
│   │   ├── keys/               # RSA key store (private keys envelope-encrypted at rest)
│   │   ├── loader/             # loader engine + registry/ ordering table
│   │   ├── db/                 # Sequelize connection + migration entry
│   │   ├── redis/              # connection / getStore / locks / queues / pubsub
│   │   ├── log/  notice/  verify/  ops/  scheduler/  websocket/  cli/  config/  release/
│   │   └── ...
│   │
│   ├── app/                    # application modules (one directory = one app)
│   │   ├── oauth21/            # OAuth 2.1 app
│   │   ├── user/               # users
│   │   ├── admin/              # administration
│   │   ├── firewall/           # firewall (engine + detectors live here)
│   │   ├── guard/              # three-level guard
│   │   ├── notice/             # notifications
│   │   ├── posecraft/          # posecraft backend
│   │   └── retroweb/           # retroweb backend
│   │
│   ├── api/                    # routes (domain directory, then version)
│   │   ├── auth/v1/
│   │   ├── oauth21/v1/
│   │   ├── user/v1/
│   │   ├── admin/v1/
│   │   ├── firewall/
│   │   ├── system/v1/          # health / config
│   │   ├── verify/v1/
│   │   └── guard.js            # three-level guard engine
│   │
│   ├── models/                 # Sequelize models, grouped by domain
│   │   ├── user/  iam/  oauth21/  session/  key/  notice/  guard/  posecraft/  retroweb/
│   │
│   ├── data/                   # runtime state (default config JSON)
│   ├── shared/                 # cross-layer helpers
│   └── public/                 # runtime upload directory (uploads/)
│
├── public/                     # static root (served by @fastify/static, prefix `/`)
│   └── uploads/                # uploaded files (gitignored; only a .gitkeep placeholder is tracked)
│
├── migrations/                 # database migrations (by domain)
├── packages/                   # npm workspace packages
│   ├── log/                    # wb-logkit (nested repo, gitignored locally; CI pulls ^0.5.0 from the registry)
│   ├── theme-core/             # skinsuite (git submodule)
│   └── shared-device/          # stable-deviceid
│
├── scripts/                    # ops scripts (release / migrations / verification gates)
├── docker/                     # image + dependency self-check
├── reports/                    # one-off review reports (gitignored, not shipped)
└── docs/                       # documentation
```

> `packages/theme-core` is a **git submodule** — clone with `--recurse-submodules`.
>
> **`public/` now only holds `uploads/`**: it used to carry 190 legacy frontend build artifacts
> (`posecraft/` 107, `models/` 37, `firewall/` 24, `poseadmin/` 22 — about 152 MB), removed on
> 2026-10-31 because each of them belongs to a frontend repository and must not ship with the
> backend. Only `uploads/.gitkeep` is tracked: `@fastify/static` needs its `root` to exist and
> `Dockerfile` runs `COPY public ./public`, so a clean checkout without a placeholder file would
> fail the image build.

## Boot sequence

```
index.js → createApp() (src/app.js) → initLoader(app) → runEngine() (src/framework/loader/engine.js)
```

The engine scans `src/framework/loader/registry/` and runs files in numeric-prefix order:

| # | File | Responsibility |
| --- | --- | --- |
| 00 | `00-globals.js` | decorate `reply.result` (success/fail/unauth/forbidden) |
| 01 | `01-monitor.js` | request metrics + slow-request warnings |
| 02 | `02-redis.js` | Redis connection + health monitoring; `app.redis = null` when unreachable |
| 03 | `03-db.js` | Sequelize connection + `app.db` decorator (configured but unreachable → boot fails) |
| 04 | `04-auth.js` | session validation + ALS initialisation |
| 05 | `05-firewall.js` | five-stage interception pipeline |
| 06 | `06-models.js` | load `src/models/` |
| 07 | `07-keys.js` | JWT keys + startup self-check (KEK / active key) |
| 08 | `08-api.js` | load `src/api/` routes |
| 09 | `09-notice.js` | SMTP config seed |
| 10 | `10-apps.js` | scan `src/app/` for app config, permissions, roles, OAuth clients |

Failures are not always swallowed: `01-monitor` / `02-redis` / `09-notice` are in
`OPTIONAL_LOADERS` and only warn; every other loader (auth, firewall, models, keys, routes,
apps) is **fail-fast** — a process that binds a port but cannot serve correct requests is
harder to diagnose than one that exits.

## Infrastructure vs application layer

```
src/
│── infrastructure (`framework/`)
├── framework/auth/  jwt/  keys/      # auth, JWT, key store
├── framework/db/  redis/             # database, cache / locks / queues / pubsub
├── framework/log/  notice/  verify/  # logging, notifications, CAPTCHA
├── framework/loader/  ops/           # loader engine, dependency waiting / readiness
├── framework/scheduler/  websocket/  # cron, WS fan-out
├── models/session/                   # system models (sessions / tokens / logs)
│
│── application layer
├── app/
│   ├── oauth21/   user/   admin/     # login / SSO / authorization, users, administration
│   ├── firewall/                     # firewall (engine + detectors)
│   ├── guard/     notice/            # three-level guard, notifications
│   └── posecraft/ retroweb/          # bundled business apps
│
├── api/                              # routes (domain / version directories)
├── models/                           # business models
└── data/                             # runtime state
```

The infrastructure layer holds capabilities, never business logic. Application modules must
**not import each other** (`src/app/<A>` may not reference `src/app/<B>`); anything shared by
two apps belongs in `framework/`.
