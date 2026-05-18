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
2. `02-redis.js` — Redis connection, health monitor (injects `null` if unavailable)
3. `03-db.js` — Sequelize connection, `app.db` decorated with instance + transaction helper
4. `04-auth.js` — ALS initialization + JWT verification in single onRequest hook
5. `05-firewall.js` — rate limiting, bot detection, geo-fencing, connection tracking
6. `06-models.js` — auto-loads `src/models/` into `app.db[namespace][ModelName]`; runs `sequelize.sync({ alter: true })` when `DB_SYNC=true` (blocked in production)
7. `07-api.js` — auto-loads API routes from `src/api/` (reads `system.json` for system name/prefix per subfolder)

Each loader module exports a default function receiving the Fastify `app` instance. Errors in individual loaders are caught and logged without stopping the process.

### Hook Execution Order

```
onRequest[0]  →  @fastify/cookie     解析 cookies
onRequest[1]  →  auth                ALS 初始化 + JWT 验证 → request.state.user 就绪
onRequest[2]  →  @fastify/rateLimit  keyGenerator 可读 req.state.user.id
onRequest[3]  →  firewall            五层拦截管道（连接→封禁→挑战→Bot→地理围栏）
preHandler    →  guard               权限守卫（3 级级联）
handler       →  业务路由
onSend        →  日志 + 连接释放
onResponse    →  扫描陷阱（404/403 检测）
```

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

- **onRequest hook**: creates `request.state`, runs ALS context, extracts JWT from cookie/Authorization/header, verifies, checks Redis blacklist — all in a single hook
- **`app.auth`** (from `src/auth/xToken.js`): `login()`, `check()`, `getLoginId()`, `checkRole()`, `checkPermission()`
- **ALS accessors** (`src/auth/als.js`): `getCtx()`, `getDb()`, `getRedis()`, `getServerResource()`

## Redis System (`src/redis/`)

```
src/redis/
├── index.js              # Fastify 插件：创建连接、注入 app.redis
├── health.js             # 事件驱动健康监控（error/ready/end 事件，非轮询）
├── resilient-store.js    # @fastify/rate-limit 存储后端，Redis↔内存自动切换
└── safe-redis.js         # safeRedis() 安全包装，操作失败返回 fallback
```

- `reconnectStrategy: false` — 不自动重连，依赖进程重启
- 健康状态通过 `app.redisHealthy` 和 `app.onRedisHealthChange()` 通知所有依赖模块
- `02-redis.js` loader 是薄代理：`export { default } from '../../redis/index.js'`

## Firewall System (`src/firewall/`)

分层架构，每层职责单一：

```
src/firewall/
├── index.js                          # 插件入口（纯钩子注册，零业务逻辑）
├── config/
│   └── config.js                     # 默认安全策略矩阵、IP 解析 API、常量
├── data/
│   ├── store.js                      # 流量统计（10000 条环形缓冲、WebSocket 广播）
│   └── challenge-template.js         # 人机挑战页模板（HMAC 签名 + 指纹采集）
├── dao/
│   ├── dao.js                        # 配置持久化（JSON）、名单同步、节点定位
│   └── block-manager.js              # 封禁/白名单查询 + API 操作封装
├── util/
│   ├── shared.js                     # 共享状态（内存 Map、Redis Key、Lua 脚本）
│   ├── connection-tracker.js         # 并发连接追踪 + 僵尸清理
│   └── fingerprint.js                # 请求指纹（IP+UA+Lang+Enc → SHA256）
└── engine/
    ├── index.js                      # barrel 导出
    ├── pipeline.js                   # onRequest 五层拦截管道
    ├── detectors/
    │   ├── first-ratelimit.js        # 第一层：@fastify/rate-limit 插件注册
    │   ├── rate-limiter.js           # 滑窗限频（Redis sorted-set + 内存降级）
    │   ├── scan-trap.js              # 404/403 扫描陷阱
    │   ├── brute-force.js            # 登录暴力破解防护
    │   ├── geo-filter.js             # 地理围栏 + GeoIP
    │   └── bot-detector.js           # Bot/僵尸网络检测
    └── dao/
        └── block-manager.js          # 封禁核心（checkGlobalBlock + CRUD）
```

五层拦截流程：连接追踪 → 全局封禁 → 挑战 Cookie → Bot 检测 → 地理围栏/端点限频

Config persisted to `data/firewall_config.json`, traffic stats to `data/traffic_stats.json` (in-memory ring buffer, max 10k records).

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

## 特殊指令
- 注释和文档全部使用中文 每个函数都写文档和注释，每次在合适的位置更新README.md文件
- 修改现有代码时，先说明改动计划再执行
- 遇到不确定的业务逻辑，先提问再写代码
- 所有中文注释使用简体中文
- 每一个函数功能使用一个单独的文件
- 函数命名使用小驼峰命名法
