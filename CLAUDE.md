# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with nodemon (loads .env)
npm start            # Production start (loads .env.production)
npm run migrate      # Run Umzug DB migrations
npm run lint         # ESLint flat config with auto-fix
npm run format       # Prettier format all files
npm test             # Jest in ESM mode (--experimental-vm-modules)
node src/test-db.js  # Test DB connection standalone
```

Run a single test: `node --experimental-vm-modules npx jest --testPathPattern <pattern>`

## Tech Stack

- **Runtime**: Node.js ESM (`"type": "module"`)
- **Framework**: Fastify v5 (migrated from Koa — legacy Koa code in `src/validator/` and `src/auth/sso.js` is unused)
- **ORM**: Sequelize v6 + MySQL2
- **Cache**: Redis v5 (node-redis)
- **Auth**: JWT (jsonwebtoken) + AsyncLocalStorage context
- **Migration**: Umzug v3 (files in `migrations/`)
- **Frontend**: Vue/Vite firewall dashboard lives in `firewall/`, builds to `public/firewall/`

## Boot Sequence

`index.js` → `createApp()` in `src/app.js` → `initLoader(app)` → `runEngine()` in `src/loader/engine.js`

The engine scans `src/loader/registry/` alphabetically. Numeric prefixes control load order:

1. `00-globals.js` — decorates `reply` with `.result.success()`, `.result.fail()`, `.result.unauth()`, `.result.forbidden()`
2. `02-redis.js` — Redis connection (injects `null` if unavailable)
3. `03-db.js` — Sequelize connection, `app.db` decorated with instance + transaction helper
4. `04-auth.js` — JWT verification, ALS context, token blacklist check
5. `05-firewall.js` — rate limiting, bot detection, geo-fencing
6. `06-models.js` — auto-loads `src/models/` into `app.db[namespace][ModelName]`; runs `sequelize.sync({ alter: true })` when `DB_SYNC=true` (blocked in production)
7. `07-api.js` — auto-loads API routes from `src/api/` (reads `system.json` for system name/prefix per subfolder)

Each loader module exports a default function receiving the Fastify `app` instance. Errors in individual loaders are caught and logged without stopping the process.

## API Route Convention

Each API domain lives in `src/api/<domain>/` with:
- `system.json` — defines `name`, `prefix`, and security defaults
- `v1/<route>.js` — exports a Fastify plugin; uses `registerSecureRoute()` from `src/api/guard.js`

Route files use `registerSecureRoute(app, systemKey, groupKey, { method, url, handler, schema?, ... })` which auto-constructs the full URL and attaches the 3-level cascade guard as a `preHandler`.

## 3-Level Guard System

`src/api/guard.js` implements cascading access control:
1. **System level** — from `system.json` (enable/disable, IP whitelist, login requirement)
2. **Group level** — from `registerGroupMetadata()` calls in route files
3. **API level** — from `registerSecureRoute()` config

Each level can independently block based on: `enabled`, `allowIps` (wildcard + CIDR), `allowRoles`, `requireLogin`.

Guard config is persisted to `data/guard_config.json` after boot.

## Model Namespace Convention

Models are organized by domain subdirectories under `src/models/`. The auto-loader registers them as `app.db.<namespace>.<ModelName>`. Current namespaces:
- `db.user` — User, UserIdentity, Group, Permission, UserGroup, GroupPermission, EmailCode, Rbac
- `db.sso` — SsoUser, SsoSession, SsoLog

Associations are defined via each model's `static associate(db)` method.

## Auth System (`src/auth/`)

- **onRequest hook**: creates `request.state`, runs request inside `AsyncLocalStorage`
- **preHandler hook**: extracts JWT from cookie/Authorization/header, verifies, checks Redis blacklist
- **`app.auth`** (from `src/auth/xToken.js`): `login()`, `check()`, `getLoginId()`, `checkRole()`, `checkPermission()`
- **ALS accessors** (`src/auth/als.js`): `getCtx()`, `getDb()`, `getRedis()`, `getServerResource()`

## Firewall System (`src/firewall/`)

Registered as a Fastify plugin. Every request passes through: connection tracking → global block check → challenge cookie verify → bot detection → geo reputation → endpoint-specific rate limits.

Config persisted to `data/firewall_config.json`, traffic stats to `data/traffic_stats.json` (in-memory ring buffer, max 10k records).

Rate limiting uses Redis sorted-set sliding window with automatic in-memory fallback via `src/firewall/utils/resilient-store.js`.

## Response Pattern

Use `reply.result` convenience methods (decorated by `00-globals.js`):
```js
reply.result.success(data)
reply.result.fail(message)
reply.result.unauth()
reply.result.forbidden()
```

The `Result` class lives in `src/core/result.js`.

## Environment Variables

See `.env.example` for the full list. Key vars: `PORT`, `DB_*`, `REDIS_*`, `APP_SECRET`, `DB_SYNC`, `FIREWALL_SECRET`.

## Notes

- No build step — runs directly as ESM JavaScript
- `src/validator/` is legacy Koa-era code; active routes use Fastify's AJV JSON Schema validation
- `firewall/` root directory is a separate Vite/Vue project with its own `node_modules`
