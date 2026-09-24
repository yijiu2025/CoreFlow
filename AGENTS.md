# AGENTS.md

本文件为 Codex 提供项目指引，确保代码修改符合项目规范。

## 常用命令

```bash
npm run dev          # 启动开发服务器 (nodemon + .env)
npm start            # 生产启动 (.env.production)
npm run migrate      # 执行 Umzug 数据库迁移
npm run lint         # ESLint 自动修复
npm run format       # Prettier 格式化
npm test             # Jest 测试 (ESM 模式)
```

单个测试：`node --experimental-vm-modules npx jest --testPathPattern <pattern>`

## Git 提交与发版

提交并推送后，**按情况顺手发布，不必每次询问**。三条通道（git tag / GitHub Release / npm）的判断
与执行已固化成脚本，**默认只预览、不写任何东西**：

```bash
node scripts/release.mjs                        # 预览三条通道各自的决策
node scripts/release.mjs --apply                # 执行
node scripts/release.mjs --from v2.5.0          # 指定起算点（复盘/补发用，默认取最近 tag）
node scripts/release.mjs --apply --allow-dirty  # 工作区有并行任务的改动时放行
```

决策逻辑在 `src/framework/release/index.js`（有独立测试覆盖），脚本本身只做宿主职责。

**判据**（按本次推送包含的提交类型）

| 提交类型                                          | 是否发布 | 版本递增（以最新 tag 为基线） |
| ------------------------------------------------- | -------- | ----------------------------- |
| 破坏性变更（`!:` 或 footer 形式的 BREAKING CHANGE） | 发       | major                         |
| 含 `feat`                                         | 发       | minor：`v2.5.0` → `v2.6.0`    |
| 仅 `fix` / `perf`                                 | 发       | patch：`v2.5.0` → `v2.5.1`    |
| 仅 `chore` `docs` `test` `style` `ci` `refactor`  | **不发** | —                             |

> 破坏性变更**只认 footer 形式**（行首且带冒号）。不可退化成子串匹配 —— commit 正文里"提到"
> 这个关键词（例如写本条规则自身）会让 minor 被误升成 major，这在真实仓库上发生过。

**三条通道各自按情况发布**

| 通道               | 何时发                              | 要点                                                                                     |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| git tag            | 判定发版即打                        | annotated tag，随 `main` 一起推                                                          |
| GitHub Release     | 与 tag 一一对应                     | 调 REST API 创建，说明按提交类型分中文组自动生成。凭据取自 **git credential manager**，本机无 `gh` CLI 也能用；**tag 已推而 Release 缺失时，重跑脚本会自动补建** |
| npm（`packages/log`） | 该包本地 `version` 已 bump 到高于线上 | 独立嵌套仓库，走 `npm publish --access public`                                           |

**几条边界**

- **版本源是 git tag**，`package.json` 单向跟随 —— **不要反过来拿它的 `version` 推版本号**。每次发版顺手对齐。
- tag 推送同样可能极慢或零输出 → 判定一律用 `git ls-remote --tags origin`，**不信退出码**；超时不等于失败，重试是安全的。（实测：`main` push 曾 5m27s 零输出；`git push origin main v2.6.0` 25s 完成）
- 脚本 push 后会自动调 `~/.workbuddy/tools/fix-packed-refs.mjs` 同步本机 ref —— 本机 git 不写松散 ref，不修则 `git status` 长期谎报 ahead。
- **Release 说明对公网可见**：脚本会列出标题含敏感表述（漏洞 / 密钥 / token 等）的提交，发之前先确认是否适合原文外发。
- `packages/log/` 是独立嵌套仓库（`yijiu2025/log.git`），它的改动要去那个仓库提交。

## 技术栈

- **运行时**: Node.js ESM (`"type": "module"`)
- **框架**: Fastify v5
- **ORM**: Sequelize v6 + MySQL2
- **缓存**: Redis v5 (node-redis)，连接失败自动降级到内存
- **认证**: Session-based（Cookie sid + Redis）+ OAuth 2.1 JWT（对外 API）
- **迁移**: Umzug v3（`migrations/` 目录）
- **前端**: Vue 3 + Vite + TypeScript（`oauth21/`、`firewall/`、`admin/`）

## 启动流程

```
index.js → createApp() (src/app.js) → initLoader(app) → runEngine() (src/framework/loader/engine.js)
```

引擎扫描 `src/framework/loader/registry/` 目录，按文件名数字前缀顺序加载：

> 下表已于 2026-09-20 对 `src/framework/loader/registry/` 的实际文件名逐一核对。
> 此前的版本遗漏了 `01-monitor`、`07-keys`，并把已合并的 `09-pbac` / `10-seed-clients` / `11-apps`
> 当成三个独立步骤 —— 请勿再按旧表理解启动顺序。

| 顺序 | 文件            | 职责                                                                   |
| ---- | --------------- | ---------------------------------------------------------------------- |
| 00   | `00-globals.js` | 装饰 `reply.result`（success/fail/unauth/forbidden）                   |
| 01   | `01-monitor.js` | 请求耗时记录 + `X-Response-Time` 响应头 + 慢请求告警                    |
| 02   | `02-redis.js`   | Redis 连接 + 健康监控，失败注入 `null`                                 |
| 03   | `03-db.js`      | Sequelize 连接 + `app.db` 装饰器 + `onClose` 优雅退出                  |
| 04   | `04-auth.js`    | Session 验证 + ALS 初始化（`src/framework/auth/`）                     |
| 05   | `05-firewall.js`| 五层拦截管道（限频/封禁/挑战/Bot/地理围栏）—— ⚠️ **序号是功能性的，不可挪** |
| 06   | `06-models.js`  | 自动加载 `src/models/`，按命名空间注册到 `app.db`（实现住 `framework/db/models.js`） |
| 07   | `07-keys.js`    | 密钥初始化（补齐默认密钥对，依赖模型已加载）                            |
| 08   | `08-api.js`     | 自动加载 `src/api/` 路由（读 `system.json`）                           |
| 09   | `09-notice.js`  | 通知配置种子数据（SMTP）                                               |
| 10   | `10-apps.js`    | 扫描 `src/app/` 加载应用权限和配置（**合并原 09-pbac + 10-seed-clients + 11-apps**） |

每个 loader 导出默认函数接收 `app` 实例，错误被捕获并记录，不阻塞其他模块。

## 请求处理链路

```
onRequest[0]  →  @fastify/cookie     解析 cookies
onRequest[1]  →  auth                Session 验证（sid cookie → Redis → request.state.user）
                                      sid 过期时自动用 sid_r 刷新
onRequest[2]  →  @fastify/rateLimit  全局限频（所有请求）
onRequest[3]  →  firewall            五层拦截管道（所有请求都过）
                                      已登录: 基础速率限制 + bot 检测
                                      未登录: 全量拦截
preHandler    →  guard               三级权限守卫（检查 request.state.user）
preHandler    →  verifySignature     H5 签名验证（仅 OAuth21 路由）
handler       →  业务路由
onSend        →  日志 + 连接释放
onResponse    →  扫描陷阱（404/403 检测）
```

## 认证系统 (`src/framework/auth/`)

```
src/framework/auth/
├── index.js              # 独立 auth 插件：Session 验证 + ALS + app.auth 装饰
├── cookie.js             # Cookie HMAC-SHA256 签名/验证
├── session.js            # Session 管理：创建/验证/销毁/续期/刷新/踢下线
├── permission-loader.js  # 按 appId 加载用户角色和权限 (PBAC)
└── StpUtil.js            # 权限工具类（对标 Java Sa-Token）
```

### Session 双令牌机制

**短期登录（不勾选"记住我"）：**

- `sid` cookie: HMAC 签名的 sessionId，HttpOnly，Max-Age=2h
- Redis: `session:<sessionId>` = JSON（用户信息+角色+权限），TTL=2h

**长期登录（勾选"记住我"）：**

- `sid` cookie: Max-Age=30min
- `sid_r` cookie: refreshToken，Max-Age=30天
- sid 过期时自动用 sid_r 刷新，用户无感知

**踢用户下线：** Redis 删除 session + DB 标记 revoked → 立即生效

### Session 数据结构（Redis）

```json
{
  "userId": 123,
  "uid": "uuid-xxx",
  "username": "alice",
  "email": "alice@example.com",
  "appId": "firewall",
  "roles": ["admin", "operator"],
  "permissions": { "allows": ["user:read", "config:*"], "denies": ["user:delete"] },
  "ip": "192.168.1.1",
  "deviceId": "device-xxx",
  "loginAt": 1717000000,
  "rememberMe": false
}
```

### `app.auth` (StpUtil)

```js
StpUtil.getLoginId(); // 获取当前用户 ID
StpUtil.check(); // 强制登录检查（未登录抛 401）
StpUtil.checkRole('admin'); // 角色校验
StpUtil.hasPermission('user:read'); // 权限判断（支持通配符 + Deny 优先）
StpUtil.checkPermission('user:write'); // 权限校验（不通过抛 403）
StpUtil.checkPermissionAnd('a', 'b'); // 全部通过
StpUtil.checkPermissionOr('a', 'b'); // 任一通过
```

### ALS 上下文

```js
import { requestContext, getCtx, getDb, getServerResource } from './auth/index.js';
// requestContext: AsyncLocalStorage 实例
// getCtx(): 获取当前 request 对象
// getDb(): 获取 Sequelize 实例
// getServerResource(name): 获取 Fastify 插件实例
```

## OAuth 2.1 系统 (`src/oauth21/`)

```
src/oauth21/
├── config/           # OAuth 配置
├── crypto/           # RSA 密钥管理 + JWT 签发/验证
├── dao/              # 数据访问层（client, code, token, approval, consent, permission）
├── middleware/        # H5 签名验证 + scope 校验
├── services/         # 业务逻辑层
├── utils/              # PbacRegistry（权限注册中心，系统层共享工具）
└── view/             # 登录页面模板
```

### 授权流程

1. 客户端 → `/oauth/authorize`（授权码 + PKCE）
2. 用户登录 → Session 创建 → 授权码生成
3. 客户端用授权码 → `/oauth/token` 换取 Access Token + Refresh Token
4. 子服务器用公钥验证 JWT → 获取用户 claims

### H5 签名验证（防爬防篡改）

路由配置 `requireLogin: true` 时自动启用。前端用 `h5TokenMd5 + timestamp + nonce + url + body` 计算 SHA-256 签名，后端验证。

## API 路由规范

每个 API 域在 `src/api/<domain>/` 下：

- `system.json` — 定义 `name`、`prefix`、安全默认值
- `v1/<route>.js` — 导出 Fastify 插件，使用 `registerSecureRoute()` 注册

```js
registerSecureRoute(app, {
  name: 'getUser',
  method: 'GET',
  url: '/profile',
  requireLogin: true,
  permission: 'user:read',           // 单个权限
  // permission: { any: ['a', 'b'] }  // 任一满足 (OR)
  // permission: { all: ['a', 'b'] }  // 全部满足 (AND)
  handler: async (request, reply) => { ... }
});
```

## 三级守卫系统

`src/api/guard.js` 实现级联访问控制：

| 级别   | 来源                      | 配置项                                                  |
| ------ | ------------------------- | ------------------------------------------------------- |
| System | `system.json`             | enabled, allowIps, requireLogin                         |
| Group  | `registerGroupMetadata()` | enabled, allowIps, allowRoles                           |
| API    | `registerSecureRoute()`   | enabled, allowIps, allowRoles, requireLogin, permission |

每级可独立拦截：`enabled`、`allowIps`（通配符+CIDR）、`allowRoles`、`requireLogin`、`permission`（权限校验，支持通配符 + deny 优先）。

`permission` 是 `requirePermission` 的短别名。

配置持久化到**数据库** `guard_configs` 表（`src/app/guard/dao/guard-config.dao.js` 的
`loadFromDB()` / `saveToDB()`，由 `src/api/guard-config.js` 在启动后调度）。

> ⚠️ `data/guard_config.json` 是迁移到 DB **之前**的本地文件方案，**已废弃** ——
> 直接编辑它不会生效，服务也不会再读写该文件。配置项里**代码级声明**（`requirePermission`、
> `freshPermission` 等）不得持久化，只允许 `enabled`/`requireLogin`/`allowIps`/`allowRoles` 进 DB。

## 目录结构（系统层 / 应用层）

```
src/
│── 系统层（基础设施 + 通用工具）
├── framework/         # 系统层基础设施
│   ├── db/            #   数据库连接 + 迁移
│   ├── redis/         #   缓存
│   ├── log/           #   日志
│   ├── auth/          #   认证框架（Session + Cookie + ALS）
├── firewall/          # 防火墙
│   ├── notice/        #   通知工具（邮件发送等通用服务）
│   ├── verify/        #   验证码工具（通用服务）
│   ├── scheduler/     #   定时任务调度器
├── models/session/    # 系统模型（UserSession, SessionToken, SessionLog）
│
│── 应用层
├── app/
│   ├── oauth21/       # OAuth 2.1 应用（config + permission/ + crypto + dao + services）
│   ├── user/          # 用户应用（config + permission/ + dao）
│   ├── admin/         # 管理应用（config + permission/ + dao）
│   └── notice/        # 通知应用（config + permission/ + dao）
│
├── api/               # 路由（按应用分文件夹，含 guard.js）
├── models/            # 业务模型（user/, oauth21/, iam/, notice/）
├── loader/            # 加载器
└── data/              # 运行时数据
```

每个应用目录结构：`config.js`（元数据）+ `permission/`（权限/角色定义）+ 业务代码

## 模型命名空间

模型按领域子目录自动注册为 `app.db.<namespace>.<ModelName>`：

| 命名空间     | 模型                                                            | 表名                                                                          |
| ------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `db.user`    | User, UserIdentity                                              | user_user, user_identity                                                      |
| `db.iam`     | Role, UserRole, InlinePolicy, Permission                        | iam_role, iam_user_role, iam_inline_policy, permissions                       |
| `db.oauth21` | OauthClient, OauthCode, OauthToken, OauthApproval, OauthConsent | oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents |
| `db.notice`  | EmailCode, NoticeConfig                                         | notice_email_codes, notice_configs                                            |
| `db.session` | UserSession, SessionToken, SessionLog                           | session_user_session, session_tokens, session_logs                            |

关联通过 `Model.associate = (models) => {}` 定义。软删除使用 `delete_version` 模式（`src/framework/db/softDeleteHooks.js`），模型定义时 `paranoid` 必须设为 `false`（不使用 Sequelize 内置的 deletedAt 机制）。

## 数据库 (`src/framework/db/`)

```
src/framework/db/
├── index.js           # Sequelize 实例 + 环境变量校验 + 连接池配置
├── migrate.js         # Umzug 迁移运行器（--up / --down / --down-to / --status）
├── softDeleteHooks.js # 软删除 delete_version 钩子
└── README.md          # 模块文档
```

迁移命令：

```bash
npm run migrate                                                # 执行所有待运行迁移
node --env-file=.env src/framework/db/migrate.js --status      # 查看迁移状态
node --env-file=.env src/framework/db/migrate.js --down        # 回滚最近一次
node --env-file=.env src/framework/db/migrate.js --down-to <name>  # 回滚到指定版本
```

**禁止在生产环境使用 `DB_SYNC=true`**，必须通过迁移文件管理表结构变更。

### 模型获取规范

DAO/Service 层统一使用 `getModel` 获取模型，禁止动态 import 模型文件。支持 `getModel('User')`、`getModel('user.User')`、`getModel('user', 'User')` 三种写法。

### 数据库查询规范

禁止直接写 SQL 语句，必须使用 Sequelize 模型方法（`findAll`/`findOne`/`findByPk`/`create`/`update` 等）。软删除模型禁止设置 `paranoid: true`，必须使用 `delete_version` 机制 + `registerDeleteVersionHooks` 钩子。

## Redis 系统 (`src/framework/redis/`)

```
src/framework/redis/
├── index.js              # 统一出口，所有 API 从这里导出
├── plugin.js             # 连接管理：创建、主备切换、优雅关闭
├── health.js             # 事件驱动健康监控 + SLOWLOG 采集
├── utils.js              # 共享工具函数（超时、序列化、key 构建）
├── errors.js             # RedisRequiredError 错误类
├── get-store.js          # 统一存储工厂（推荐入口）
├── redis-store.js        # Redis 会话存储 + getRedisStore 工厂
├── map-store.js          # 纯内存 Map 存储（单例，不依赖 Redis）
├── cache.js              # Cache-Aside + singleflight 防击穿
├── lock-store.js         # 分布式锁（SET NX + Lua 安全释放）
├── nonce-store.js        # Nonce 防重放（双后端：Redis / MapStore）
├── resilient-store.js    # 限流弹性后端（@fastify/rate-limit）
├── queue-store.js        # FIFO 消息队列（双后端：MapStore / Redis）
├── ring-queue-store.js   # 循环队列（双后端，满时自动覆盖最旧）
├── stream-store.js       # Stream 消息队列（持久化 + 消费者组）
├── TUTORIAL.md           # 使用教程
└── README.md             # 模块文档
```

### 核心用法

```js
// 统一存储工厂（推荐入口）
const store = getStore('captcha', { timeout: 3000 });
await store.set('key', value, 600);
const data = await store.get('key');

// 缓存防击穿
const user = await cacheThrough('user:1001', () => db.findUser(1001), 600);

// 分布式锁
const lock = createLock('task:sync', { ttl: 30000 });
if (await lock.tryAcquire()) {
  try { await doWork(); } finally { await lock.release(); }
}

// 消息队列
const queue = createQueue('notify', { backend: 'redis' });
queue.push({ id: 1, text: 'hello' });
const msg = queue.shift();
```

完整教程见 [src/framework/redis/TUTORIAL.md](src/framework/redis/TUTORIAL.md)。

环境变量：`REDIS_ENABLED`、`REDIS_HOST`、`REDIS_PORT`、`REDIS_PASSWORD`、`REDIS_TLS`、
`REDIS_TLS_SKIP_VERIFY`、`REDIS_BACKUP_HOST`、`REDIS_CONNECT_TIMEOUT`、`REDIS_MAX_RETRIES`

健康状态通过 `app.redisHealthy` 和 `app.onRedisHealthChange(cb)` 通知所有依赖模块。

**铁律：所有 Redis 操作必须经过 `src/framework/redis/` 模块**，禁止直接操作 `request.server.redis`/`app.redis` 原始客户端。缺 Redis 命令时在 `RedisStore` 补充，不绕过模块。

## 防火墙系统 (`src/firewall/`)

```
src/firewall/
├── index.js                          # 插件入口
├── config/config.js                  # 安全策略矩阵
├── data/store.js                     # 流量统计（环形缓冲 + WebSocket 广播）
├── data/challenge-template.js        # 人机挑战页模板
├── dao/dao.js                        # 配置持久化 + 名单同步
├── dao/block-manager.js              # 封禁/白名单 CRUD
├── util/shared.js                    # 共享状态（内存 Map + Redis Key）
├── util/connection-tracker.js        # 并发连接追踪
├── util/fingerprint.js               # 请求指纹（SHA256）
└── engine/
    ├── pipeline.js                   # 五层拦截管道
    └── detectors/
        ├── first-ratelimit.js        # @fastify/rate-limit 注册
        ├── rate-limiter.js           # 滑窗限频（Redis sorted-set + 内存降级）
        ├── scan-trap.js              # 404/403 扫描陷阱
        ├── brute-force.js            # 登录暴力破解防护
        ├── geo-filter.js             # 地理围栏 + GeoIP
        └── bot-detector.js           # Bot/僵尸网络检测
```

五层拦截流程：连接追踪 → 全局封禁 → 挑战 Cookie → Bot 检测 → 地理围栏/端点限频

## 环境变量

| 变量              | 默认值      | 说明                           |
| ----------------- | ----------- | ------------------------------ |
| `NODE_ENV`        | development | 运行环境                       |
| `PORT`            | 3000        | 服务端口                       |
| `DB_TYPE`         | mysql       | 数据库类型                     |
| `DB_HOST`         | -           | 数据库地址                     |
| `DB_PORT`         | 3306        | 数据库端口                     |
| `DB_NAME`         | -           | 数据库名称                     |
| `DB_USER`         | -           | 数据库用户                     |
| `DB_PASS`         | -           | 数据库密码                     |
| `DB_SYNC`         | false       | 启动时同步表结构（仅开发环境） |
| `DB_POOL_MAX`     | 10          | 连接池最大连接数               |
| `REDIS_ENABLED`   | false       | 是否启用 Redis                 |
| `REDIS_HOST`      | -           | Redis 地址                     |
| `REDIS_PORT`      | 6379        | Redis 端口                     |
| `REDIS_PASSWORD`  | -           | Redis 密码                     |
| `APP_SECRET`      | -           | JWT 签名密钥                   |
| `SESSION_SECRET`  | -           | Cookie HMAC 签名密钥           |
| `FIREWALL_SECRET` | -           | 防火墙密钥                     |
| `CORS_ORIGINS`    | -           | 允许的跨域来源（逗号分隔）     |

## 测试

```bash
npm test                    # 运行所有测试
npm test -- --coverage      # 运行并生成覆盖率报告
```

测试文件在 `src/__tests__/` 下，使用 Fastify inject 进行集成测试。完整测试规范见 [.claude/skills/fullstack-rules/references/testing.md](.claude/skills/fullstack-rules/references/testing.md)。

### 测试有效性（强制）

**测试文件必须真实加载被测代码**（相对 `import` / `await import()` / `wb-*` 工作区包）。
禁止「手写一个响应常量，再断言该常量有某字段」——这类测试不 import 任何生产代码，
**删除被测模块后仍会全绿**，属于虚假覆盖。

- 守卫：`src/__tests__/conventions/test-effectiveness.test.js`（零相对 import 且无动态 import 即报错）
- 例外：**结构守卫**类测试（读文件系统做静态断言，如 `export-placement.test.js`）
  可登记进守卫的 `STRUCTURAL_GUARD_WHITELIST` 并写明理由
- 存量遗留：16 个纯常量自测已冻结在守卫的 `KNOWN_INEFFECTIVE_TESTS` 中，**只减不增**；
  改造完一个就从清单删一条（守卫会校验清单条目的真实性）
- **禁止内联复制被测逻辑**：副本会与真身各自演化，且测试断言的是副本行为 ——
  「测试通过」不代表「真身正确」。已核对的 3 份副本全部与真身存在实质差异，
  详见 [docs/development/test-inline-copy-drift-report.md](docs/development/test-inline-copy-drift-report.md)
- 在测试里模拟已登录态时，`reply.result` 请 `import` 真实装饰器
  （`framework/loader/registry/00-globals.js`），不要手写副本
- **一个测试文件只能注册一组路由**：`registerSecureRoute` 的 `_routeRegistry` 是模块级
  全局状态且无重置入口，重复注册同一 URL 会抛错。故注册集中在顶层 `beforeAll` 一次

### 测试改造范例

`src/__tests__/api-routes.test.js`（2026-09-16 改造）
- 改造前：18 项手写常量断言，零 import，毒丸实验（把被测文件覆写成 `throw`）下**全绿**
- 改造后：17 项真实 Fastify + 真实插件 + `inject()` 驱动，毒丸实验下**必红**（已实测）

## 开发规范

- 注释和文档使用简体中文
- 修改现有代码前先说明改动计划
- 遇到不确定的业务逻辑先提问再写代码
- 每个函数写文档注释
- 函数命名使用小驼峰（camelCase）
- 每个独立功能使用单独的文件
- 修改文件后在合适位置更新 README.md
- 每次修改代码帮我主动提交github，更新commit信息
- **修复问题时先分析原因再修改**：先定位问题根源（查看日志、检查代码流程、复现步骤），明确原因后再动手修改，避免盲目尝试
- **前端组件目录架构规范**：`src/components` 下的所有组件必须按 `功能分类 -> 业务页面 -> 组件文件` 的三层结构进行放置与管理。完整规范和目录示例见 [.claude/skills/fullstack-rules/references/frontend/web/vue.md](.claude/skills/fullstack-rules/references/frontend/web/vue.md) 第七节。
  - 第一层（功能分类）：`modals/` `popovers/` `panels/` `layouts/` `cards/` `widgets/` `common/`
  - 第二层（业务页面）：`home/` `editor/` `login/` `mine/`
  - 示例：`src/components/modals/home/SettingsModal.vue`
- **新前端设备身份接入（强制）**：本仓库所有前端应用（含新建）必须接入 `stable-deviceid` 设备身份体系（后端风控/人机验证/设备管理依赖）。创建新前端时按以下清单执行：

  1. `package.json` dependencies 加 `"stable-deviceid": "*"`
  2. vite alias：`'stable-deviceid': fileURLToPath(new URL('../packages/shared-device/src/index.ts', import.meta.url))`
  3. tsconfig：paths 加 `"stable-deviceid": ["../packages/shared-device/src/index.ts"]` 与 `"stable-deviceid/*": ["../packages/shared-device/src/*"]`，并把 `"../packages/shared-device/src/**/*.ts"` 加进 include（否则 vue-tsc 类型检查不过）
  4. 应用入口（`main.ts` / `bootstrap.ts`）在 `createApp` 前调用 `initDeviceSync()`
  5. axios 实例创建后调用 `setupDeviceSync(http)`（自动注入 x-device-id 头、响应头同步、跨标签页监听；**不要手写拦截器**）
  6. SSO iframe 登录场景：`LOGIN_SUCCESS` postMessage 分支里、`bindSession` **之前**调用 `adoptDeviceId(event.data.deviceId)`
  7. 风险验证接口（`verify-challenge`）显式带 `x-device-id` 头（用 `getDeviceHeaders()`）

  详细文档：[packages/shared-device/README.zh-CN.md](packages/shared-device/README.zh-CN.md)（英文版 README.md）；参考实现：`posecraft/src/utils/request.ts`、`posecraft/src/components/modals/login/LoginModal.vue`

- **新前端跨内核渲染基线（强制）**：各浏览器内核对「规范**留白**的初始值」解释不同 —— `color-scheme` 初始值是 `normal`、根元素背景为 `transparent` 时渲染「未定义」、`vh` 等于大视口、`-webkit-text-size-adjust` 默认 `auto`。**不显式声明，就等于把渲染结果交给内核**，「电脑上正常、手机上多一条色带/比例错掉」基本都是这么来的。本仓库所有前端应用（含新建）必须实现基线，创建新前端时按以下清单执行：

  1. `<meta name="viewport">` **单行**书写，只留 `width=device-width, initial-scale=1, viewport-fit=cover`；**不加实验键**（跨行书写 → 小米丢整条；`interactive-widget` → 夸克丢整条，两者都会退化成 980px 桌面布局）
  2. 全局样式声明 `color-scheme`，**不带 `only` 与带 `only` 各一条**（带 `only` 的禁 Chrome Auto Dark，不支持 `only` 的引擎会丢整条声明），明暗两档都写
  3. 根元素显式 `background-color`，取自**画布 token**（如 `--app-canvas`），兜底值与页面底色同源 —— 根元素背景会向上传播成整个画布
  4. 根元素 `-webkit-text-size-adjust: 100%`
  5. 全屏页容器用 `align-self: flex-start` 贴顶，不依赖父级居中（消掉 `vh > dvh` 时居中留缝露出的底色）
  6. 任何让页面上沿**透明**的主题，必须自己声明画布 token（写进主题契约与主题 README）
  7. 内核丢弃 meta 的兜底：入口在 `createApp` **之前**调用视口自救；样式侧配套 `calc(<n>dvh / var(--k))` 并限定 `[data-*]` 作用域
  8. 提交前跑 `npm run check:baseline <前端目录>`，**全绿**才算完成

  规则全文（机制、禁止项、验收方法）：[docs/frontend/browser-baseline.md](docs/frontend/browser-baseline.md)

- **前端类型闸门必须"真检查"（强制）**：方案式 tsconfig（`"files": []` + `references`）下**裸 `vue-tsc` 恒 exit 0** —— 它不编译任何文件，往里写类型错误也不报，而因为是"绿的"没人会察觉。本仓 `oauth21` 曾长期如此，攒下 9 个真实错误（2026-09-23 修复）。规则：

  1. **有 `references` 的前端用 `vue-tsc -b`**，不用裸 `vue-tsc` / `vue-tsc --noEmit`（它们不跟随 references）。被引用的子项目需 `composite: true`；子项目 `include` 里是 `.js` 时必须开 `allowJs`，否则 `-b` 以 `TS18003`「No inputs were found」整体失败 —— **去掉 `-b` 就不再报错，只是静默失去检查**，这是最容易被误当成"修好了"的形态
  2. `build` 写成 `npm run type-check && vite build`：口径**只在一处定义**，避免两处各自漂移
  3. **改完口径必须毒丸验证**：`src/` 临时写 `export const __p: number = 'x';` → `npm run type-check` 必须报错且退出码非 0；撤销后恢复绿。**恒绿的闸门等于没有闸门**
  4. `TS5101`（如 `baseUrl` 弃用）这类**配置级错误**会让 TS **中止全部语义检查** —— 看着只剩一条无关报错，实际一个类型都没查，比空转更难识别，必须立刻修

  现状：`oauth21` / `admin` / `poseadmin` = `vue-tsc -b` ✅；`posecraft` = `vue-tsc --noEmit`（tsconfig 非方案式，有效）✅；`firewall` 无类型检查 ❌（另有 121 个存量错误待修）。细则见 [docs/frontend/coding-standard.md](docs/frontend/coding-standard.md) 的「类型闸门必须是"真检查"」。

- **多主题 / 多版式开发模式（强制）**：改「页面长什么样」必须走既有机制，不得复制业务。`oauth21` 的认证页（登录 / 注册 / 重置密码）已全部接入；**手机端已完整，电脑端目前只有目录骨架**（`themes/default/web/`：三页最小占位版式 + `colors/mono/`，无消费方 —— 核心组件仍是业务与 UI 揉在一起、尚未拆成「容器 + 版式」的单体）。四条铁律：

  1. **三个正交维度 + 一个设备轴**：① token 基线 —— `assets/styles/mobile-auth.scss` 的 `mauth-*` 类与 `--mauth-*` 变量，是**所有呈现取值的唯一出口**；② 配色 `theme/themes/<包>/<设备>/colors/<配色>/` —— 换颜色 / 圆角 / 背景图 / 字体，**同一套 DOM**（`?theme=` / 后端下发 / localStorage / 该设备兜底配色）；③ 版式 `theme/themes/<包>/<设备>/<page>/` —— 换 **DOM 结构与交互组织**，**同一套业务**（`?view=` / 主题包 `views.<page>` / `VITE_<PAGE>_VIEW` / `base`）。⚠️ **`<设备>` 不是独立的换装维度，而是「页面身份」**（`mobile` / `web`，白名单）：手机端页与电脑端页各住各的子树、各有配色与版式，同步由 `router/index.ts` 的 `setupThemeDeviceSync`（`watch(router.currentRoute, { immediate: true })`，必须在 `main.ts` 的 `app.use(pinia)` **之后**调用 —— 写成 `router.afterEach` 会因 Pinia `activeInstance` 未建立而抛错被吞、设备永远停默认值）在启动时一次接好，**不跑视口判定**。三者可任意组合：`?theme=ocean&view=compact`。⚠️ **`themes/` 下按主题包分文件夹，文件夹名就是 id**（`themes/<包>/`，设备在 `themes/<包>/<设备>/`，配色在 `themes/<包>/<设备>/colors/<配色>/`；各层 id 都取自目录名，配色目录名即 `data-mauth-theme` 的属性值）。包内 `meta.id` 与目录名不一致时**以目录名为准**；目录名不合 `[a-z0-9-]` / 设备段不是 `mobile`·`web` / 缺 `index.ts` / 缺 `default` 导出 / 缺 `meta` 一律**静默跳过**（一个写坏的主题不该让整页起不来）→ 所以「加了主题没生效」先核这五项。🔴 **配色 id 的唯一性作用域是「设备内」**（注册表键是 `包/设备/配色` 三段复合键；跨设备**可以**同名，`mono` 两端各一份）—— 用配色 id 单键登记会让后扫到的一端被当重名**静默丢弃**（真实踩过）。🔴 版式的契约 + 注册表收在 `theme/views/` 目录（`views/registry.ts` 工厂 + `views/pages.ts` 总览 + 每页 `views/<page>.ts`），与 `themes/` **平级**；基础版式是 `<设备>/<page>/index.vue`、变体是 `<设备>/<page>/<变体>/index.vue`，**没有 `base/` 这层**。不要把它们收进目录塞回 `themes/` 里
  2. **业务只在容器**：状态 / 校验 / 请求 / 路由跳转 / 浮层 / 倒计时全部在 `view/app/<page>/index.vue`，**只有一份**；版式只读 `ctx`、只调 `ctx.actions.*`，**禁止**任何请求、校验、`router.push`、store 读写。**基础版式不得自带 `<style>`**（共用样式只在 `mobile-auth.scss`，否则各页各自漂移）；变体可写，但取值只许 `--mauth-*`。契约 = 该页 `types.ts`（纯类型）+ 容器侧 `assertXxxContract` 编译期自检，**改契约两边一起报错**。⚠️ 新增变体目录要**重启 dev server**（`import.meta.glob` 启动时静态扫描）；目录迁移后还要 `--force` 清 optimize-deps 缓存（否则 504 Outdated Optimize Dep）。⚠️ `tokens` 是 `html` 上的 inline style、**优先级高于媒体查询** → 绝不能在 token 里覆写断点会变的项（`--mauth-pad-*` / `gap-*` / `logo-size` / `title-size` / `field-h` / `control-h` / `err-h` / `social-*`）
  3. **外部输入一律过白名单**：版式 id / 皮肤 id 只认 `[a-z0-9-]` 且**已登记**（未登记落 `base`，不拼路径、不做模糊匹配），且 **URL 显式非法值不回退**（`?view=typo` 直接落 base，不静默换用另一套 UI）；主题 token 走 `src/theme/runtime.ts`，**刻意拒绝 `url()` 与 CSS 颜色名**（前者是外发请求的唯一入口，后者上百个易漏）
  4. **改这一层必须跑静态关卡**：`.tmp-probe/verify-theme-dirs.mjs`（132 项，目录口径 + 实现↔文档一致性）、`.tmp-probe/verify-glob-device.mjs`（15 项，读回 `import.meta.glob` 编译产物）+ `npm run type-check`；**关卡改动后要做毒丸验证**（造 `colors/mobile/mono-base/`、退回单键登记、把设备同步改回 `afterEach` —— 三者都必须报错），否则关卡可能只是恒绿的摆设
  5. **分发器必须认「mini 来源」**（`oauth21` 的 `view/web/<page>/index.vue`）：优先级 = 显式 `?isMobile=true` ＞ mini 来源（`from=mini` / 路径含 `mini-login` / `fromLogin=mini`）＞ 自动识别（宽视口>窄视口>UA）＞ 桌面默认。**mini 来源 = 页面正被嵌在宿主 app 的弹窗 iframe 里**，此时的「窄」来自弹窗列宽而非真机 → 必须保持桌面/紧凑版式。🔴 漏掉这条的症状极具欺骗性：iframe 宽 <768px 时**只有这一页**（如重置密码）跳成全屏手机端，同 iframe 的登录/注册仍是桌面卡片；且**桌面直接开该路由不复现**，必须真放进 iframe 看 `iframe 内容页的 innerWidth`。2026-09-24 真实踩过（`forgot-password` 分发器漏了此分支）

  规则全文（目录约定、选择优先级、接入新页面清单、安全边界、验收要求、常见坑、设备分发一致性）：[docs/frontend/multi-theme.md](docs/frontend/multi-theme.md)；主题包 / 配色 / 版式的目录约定另见 `oauth21/src/theme/README.md`。

### 导出位置（强制）

**所有 `export` 一律收拢到文件末尾**，定义处不写 `export` 关键字。

```js
// ✅ 正确：定义与导出分离
function foo() {}
const BAR = 1;

export { foo, BAR };
export default mainExport;
```

```js
// ❌ 禁止：定义处行内导出
export function foo() {}
export const BAR = 1;
export default () => {};
```

**理由**：模块的公开面集中在文件末尾，一眼可见、便于审计；新增导出时不会漏改、导出散落各处导致的「模块到底暴露了什么」需要通读全文。

**默认导出的写法**（先把值命名 / 把函数具名化，再在末尾导出）：

| 原写法                                     | 改为                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `export default (a, b) => {...}`           | `const defineX = (a, b) => {...};` + 末尾 `export default defineX;`                |
| `export default new XxxDao()`              | `const xxxDao = new XxxDao();` + 末尾 `export default xxxDao;`                     |
| `export default {...}`                     | `const xxxConfig = {...};` + 末尾 `export default xxxConfig;`                      |
| `export default async function (fastify)`  | `async function registerXxxRoutes(fastify) {...}` + 末尾 `export default registerXxxRoutes;` |
| `export default Foo;`                      | 原样移到文件末尾                                                                   |

**re-export 同样属于导出**，也放末尾：`export * from 'x'`、`export { a } from 'y'`（含 `export { default as x } from './y.js'`）。

**双保险**：

- `eslint.config.js` 的 `no-restricted-syntax`（`files: src/**/*.js`）拦截新写的行内导出；
- `src/__tests__/conventions/export-placement.test.js` 跨文件扫描全仓一致性。

> 当前强制范围为 `src/`（含测试目录）。`migrations/`、`scripts/` 暂未纳入 —— Umzug 的 `export async function up/down` 是否改写需另行评估。

### 文件大小限制

**单个 JS/VUE 文件不超过 1000 行**（含空行和注释）。超过时分析是否是同一个功能，按功能拆分：

| 文件类型 | 拆分策略                                    | 示例                                                          |
| -------- | ------------------------------------------- | ------------------------------------------------------------- |
| Vue 组件 | 按功能提取 composables（`use*.ts`）和子组件 | `EditorView.vue` → `useCanvas.ts` + `useTools.ts` + `panels/` |
| JS 模块  | 按功能职责拆分为独立模块                    | `auth.js` → `session.js` + `cookie.js` + `permission.js`      |
| API 路由 | 按业务功能拆分路由文件                      | `user.js` → `user-profile.js` + `user-settings.js`            |
| 工具函数 | 按功能域拆分为独立文件                      | `utils.js` → `format.js` + `validate.js` + `transform.js`     |

**拆分原则**：

- **按功能聚合**：相关功能放在同一文件，不相关的拆分出去
- **单一职责**：每个文件只负责一个功能域
- **拆分时机**：当文件接近 400 行时，主动规划拆分方案

## 启动日志规范

使用 emoji + 彩色文字 + 统一标签格式。完整规范见 [.claude/skills/fullstack-rules/references/note.md](.claude/skills/fullstack-rules/references/note.md) 第四节。

```js
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

console.log(`✅ [Redis] ${C.green}连接成功: ${host}:${port}${C.reset}`);
console.warn(`⚠️ [Redis] ${C.yellow}连接失败，降级到内存模式${C.reset}`);
console.error(`❌ [DB] ${C.red}缺少必要环境变量${C.reset}`);
```

标准标签：`[Redis]` `[DB]` `[Migrate]` `[Loader]` `[Guard]` `[Guard Config]` `[Firewall]` `[PBAC]` `[Seed]` `[API]` `[Auth]`
