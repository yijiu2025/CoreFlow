# CLAUDE.md

本文件为 Claude Code 提供项目指引，确保代码修改符合项目规范。

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
index.js → createApp() (src/app.js) → initLoader(app) → runEngine() (src/loader/engine.js)
```

引擎扫描 `src/loader/registry/` 目录，按文件名数字前缀顺序加载：

| 顺序 | 文件 | 职责 |
|------|------|------|
| 00 | `00-globals.js` | 装饰 `reply.result`（success/fail/unauth/forbidden） |
| 02 | `02-redis.js` | Redis 连接 + 健康监控，失败注入 `null` |
| 03 | `03-db.js` | Sequelize 连接 + `app.db` 装饰器 + `onClose` 优雅退出 |
| 04 | `04-auth.js` | Session 验证 + ALS 初始化（`src/auth/`） |
| 05 | `05-firewall.js` | 五层拦截管道（限频/封禁/挑战/Bot/地理围栏） |
| 06 | `06-models.js` | 自动加载 `src/models/`，按命名空间注册到 `app.db` |
| 07 | `07-api.js` | 自动加载 `src/api/` 路由（读 `system.json`） |
| 08 | `08-notice.js` | SMTP 配置种子数据 |
| 09 | `09-pbac.js` | PBAC 角色同步到数据库 |
| 10 | `10-seed-clients.js` | OAuth 客户端种子数据 |
| 11 | `11-apps.js` | 扫描 `src/app/` 加载应用权限和配置 |

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

## 认证系统 (`src/auth/`)

```
src/auth/
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
StpUtil.getLoginId()                    // 获取当前用户 ID
StpUtil.check()                         // 强制登录检查（未登录抛 401）
StpUtil.checkRole('admin')              // 角色校验
StpUtil.hasPermission('user:read')      // 权限判断（支持通配符 + Deny 优先）
StpUtil.checkPermission('user:write')   // 权限校验（不通过抛 403）
StpUtil.checkPermissionAnd('a', 'b')    // 全部通过
StpUtil.checkPermissionOr('a', 'b')     // 任一通过
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

| 级别 | 来源 | 配置项 |
|------|------|--------|
| System | `system.json` | enabled, allowIps, requireLogin |
| Group | `registerGroupMetadata()` | enabled, allowIps, allowRoles |
| API | `registerSecureRoute()` | enabled, allowIps, allowRoles, requireLogin, permission |

每级可独立拦截：`enabled`、`allowIps`（通配符+CIDR）、`allowRoles`、`requireLogin`、`permission`（权限校验，支持通配符 + deny 优先）。

`permission` 是 `requirePermission` 的短别名。

配置持久化到 `data/guard_config.json`。

## 目录结构（系统层 / 应用层）

```
src/
│── 系统层（基础设施 + 通用工具）
├── db/                # 数据库连接 + 迁移
├── redis/             # 缓存
├── log/               # 日志
├── auth/              # 认证框架（Session + Cookie + ALS）
├── firewall/          # 防火墙
├── notice/            # 通知工具（邮件发送等通用服务）
├── verify/            # 验证码工具（通用服务）
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

| 命名空间 | 模型 | 表名 |
|----------|------|------|
| `db.user` | User, UserIdentity | user_user, user_identity |
| `db.iam` | Role, UserRole, InlinePolicy, Permission | iam_role, iam_user_role, iam_inline_policy, permissions |
| `db.oauth21` | OauthClient, OauthCode, OauthToken, OauthApproval, OauthConsent | oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents |
| `db.notice` | EmailCode, NoticeConfig | notice_email_codes, notice_configs |
| `db.session` | UserSession, SessionToken, SessionLog | session_user_session, session_tokens, session_logs |

关联通过 `Model.associate = (models) => {}` 定义。软删除使用 `delete_version` 模式（`src/db/softDeleteHooks.js`）。

## 数据库 (`src/db/`)

```
src/db/
├── index.js           # Sequelize 实例 + 环境变量校验 + 连接池配置
├── migrate.js         # Umzug 迁移运行器（--up / --down / --down-to / --status）
├── softDeleteHooks.js # 软删除 delete_version 钩子
└── README.md          # 模块文档
```

迁移命令：
```bash
npm run migrate                                          # 执行所有待运行迁移
node --env-file=.env src/db/migrate.js --status          # 查看迁移状态
node --env-file=.env src/db/migrate.js --down            # 回滚最近一次
node --env-file=.env src/db/migrate.js --down-to <name>  # 回滚到指定版本
```

**禁止在生产环境使用 `DB_SYNC=true`**，必须通过迁移文件管理表结构变更。

## Redis 系统 (`src/redis/`)

```
src/redis/
├── index.js              # 连接初始化 + 密码/TLS/优雅退出
├── health.js             # 事件驱动健康监控（零轮询开销）
├── resilient-store.js    # @fastify/rate-limit 存储后端（MULTI/EXEC 原子操作）
├── session-store.js      # 统一会话管理适配器（Redis + 内存降级）
├── nonce-store.js        # Nonce 去重（Lua 脚本原子 check+mark）
├── safe-redis.js         # 安全操作包装（区分网络/程序错误）
└── README.md             # 模块文档
```

环境变量：`REDIS_ENABLED`、`REDIS_HOST`、`REDIS_PORT`、`REDIS_PASSWORD`、`REDIS_TLS`

健康状态通过 `app.redisHealthy` 和 `app.onRedisHealthChange(cb)` 通知所有依赖模块。

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

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | development | 运行环境 |
| `PORT` | 3000 | 服务端口 |
| `DB_TYPE` | mysql | 数据库类型 |
| `DB_HOST` | - | 数据库地址 |
| `DB_PORT` | 3306 | 数据库端口 |
| `DB_NAME` | - | 数据库名称 |
| `DB_USER` | - | 数据库用户 |
| `DB_PASS` | - | 数据库密码 |
| `DB_SYNC` | false | 启动时同步表结构（仅开发环境） |
| `DB_POOL_MAX` | 10 | 连接池最大连接数 |
| `REDIS_ENABLED` | false | 是否启用 Redis |
| `REDIS_HOST` | - | Redis 地址 |
| `REDIS_PORT` | 6379 | Redis 端口 |
| `REDIS_PASSWORD` | - | Redis 密码 |
| `APP_SECRET` | - | JWT 签名密钥 |
| `SESSION_SECRET` | - | Cookie HMAC 签名密钥 |
| `FIREWALL_SECRET` | - | 防火墙密钥 |
| `CORS_ORIGINS` | - | 允许的跨域来源（逗号分隔） |

## 测试

```bash
npm test                    # 运行所有测试
npm test -- --coverage      # 运行并生成覆盖率报告
```

测试文件在 `src/__tests__/` 下，使用 Fastify inject 进行集成测试。

覆盖率阈值：branches 30%, functions 40%, lines 40%, statements 40%

## 开发规范

- 注释和文档使用简体中文
- 修改现有代码前先说明改动计划
- 遇到不确定的业务逻辑先提问再写代码
- 每个函数写文档注释
- 函数命名使用小驼峰（camelCase）
- 每个独立功能使用单独的文件
- 修改文件后在合适位置更新 README.md
- 每次修改代码帮我主动提交github


## 启动日志规范

使用 emoji + 彩色文字 + 统一标签格式：

```js
const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', dim: '\x1b[2m' };

console.log(`✅ [Redis] ${C.green}连接成功: ${host}:${port}${C.reset}`);
console.warn(`⚠️ [Redis] ${C.yellow}连接失败，降级到内存模式${C.reset}`);
console.error(`❌ [DB] ${C.red}缺少必要环境变量${C.reset}`);
```

| 级别 | emoji | 颜色 |
|------|-------|------|
| 成功 | ✅ | green |
| 信息 | 📦 ℹ️ 🛡️ 🌱 | cyan |
| 警告 | ⚠️ | yellow |
| 错误 | ❌ 🚨 | red |
| 持久化 | 💾 | dim |

标准标签：`[Redis]` `[DB]` `[Migrate]` `[Loader]` `[Guard]` `[Guard Config]` `[Firewall]` `[PBAC]` `[Seed]` `[API]` `[Auth]`
