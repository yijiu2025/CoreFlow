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
- **前端**: Vue 3 + Vite + TypeScript（`oauth21/`、`firewall/`、`admin/`、`posecraft/`）
- **前端 PWA**: vite-plugin-pwa（posecraft 默认启用，生成 SW + manifest + 可安装到主屏幕；详细规范见 [docs/frontend/FRONTEND_STANDARDS.md](docs/frontend/FRONTEND_STANDARDS.md)）

## 启动流程

```
index.js → createApp() (src/app.js) → initLoader(app) → runEngine() (src/loader/engine.js)
```

引擎扫描 `src/loader/registry/` 目录，按文件名数字前缀顺序加载：

| 顺序 | 文件                 | 职责                                                  |
| ---- | -------------------- | ----------------------------------------------------- |
| 00   | `00-globals.js`      | 装饰 `reply.result`（success/fail/unauth/forbidden）  |
| 02   | `02-redis.js`        | Redis 连接 + 健康监控，失败注入 `null`                |
| 03   | `03-db.js`           | Sequelize 连接 + `app.db` 装饰器 + `onClose` 优雅退出 |
| 04   | `04-auth.js`         | Session 验证 + ALS 初始化（`src/framework/auth/`）              |
| 05   | `05-firewall.js`     | 五层拦截管道（限频/封禁/挑战/Bot/地理围栏）           |
| 06   | `06-models.js`       | 自动加载 `src/models/`，按命名空间注册到 `app.db`     |
| 07   | `07-api.js`          | 自动加载 `src/api/` 路由（读 `system.json`）          |
| 08   | `08-notice.js`       | SMTP 配置种子数据                                     |
| 09   | `09-pbac.js`         | PBAC 角色同步到数据库                                 |
| 10   | `10-seed-clients.js` | OAuth 客户端种子数据                                  |
| 11   | `11-apps.js`         | 扫描 `src/app/` 加载应用权限和配置                    |

每个 loader 导出默认函数接收 `app` 实例，错误被捕获并记录，不阻塞其他模块。

## 请求处理链路

```
onRequest[0]  →  @fastify/cookie     解析 cookies
onRequest[1]  →  auth                Session 验证（sid cookie → Redis → request.state.user）
                                      sid 过期时自动用 sid_r 刷新
                                      认证后跑风险检测（detectSessionRisk）：
                                        基准从 Redis session 取（deviceFingerprint/ip），零 DB 查询
                                        warn（指纹变）+ 高风险操作(POST/PUT/DELETE) → 403 拦截 + __risk__
                                        info（IP 变指纹不变/梯子）→ 不拦，记 request.state.risk
                                        带 x-verify-token 头豁免拦截（验证端点不能拦自己）
onRequest[2]  →  @fastify/rateLimit  全局限频（所有请求）
onRequest[3]  →  firewall            五层拦截管道（所有请求都过）
                                      已登录: 基础速率限制 + bot 检测
                                      未登录: 全量拦截
preHandler    →  guard               三级权限守卫（检查 request.state.user）
preHandler    →  verifySignature     H5 签名验证（仅 OAuth21 路由）
handler       →  业务路由
onSend        →  日志 + 连接释放 + info 级风险注入响应体 __risk__
onResponse    →  扫描陷阱（404/403 检测，异步采集无 reply）
```

**风险检测核心**（`src/framework/auth/anomaly-detector.js` + `src/framework/auth/index.js`）：
- 基准来源：登录时 createSession 写入 Redis session 的 `deviceFingerprint` + `ip`（访问时 getSession 直接取，不查 DB）
- 风险判定：指纹变 → warn（拦写操作）；IP 变指纹不变 → info（梯子，不拦）；基准缺失 → info（旧 session 降级）
- 已验证标记：`POST /auth/v1/verify-challenge` 验证通过后写 Redis `verified:<userId>:<deviceId>`（30min 免验），并调 `updateSessionBaseline` 把新环境基准同步到 Redis + DB
- 响应注入：`__risk__{verifyUrl, verifyHeader, verifyToken}`，前端自动弹人机验证框

详见 [docs/development/注册登录全链路流程图.md](docs/development/注册登录全链路流程图.md) 第五~八章。

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

配置持久化到 `data/guard_config.json`。

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

关联通过 `Model.associate = (models) => {}` 定义。软删除使用 `delete_version` 模式（`src/framework/db/softDeleteHooks.js`）。

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

所有 DAO/Service 层必须通过 `getModel` 获取模型，禁止动态 import 模型文件：

```js
// ✅ 正确
import { getModel } from '../db/index.js';
const User = getModel('User');
await User.findByPk(1);

// ❌ 禁止
const { default: User } = await import('../models/user/User.js');
```

`getModel` 支持三种调用方式：
- `getModel('User')` — 按模型名 flat 查找（从 `sequelize.models`）
- `getModel('user.User')` — 点号写法（命名空间 + 模型名）
- `getModel('user', 'User')` — 双参数

### 数据库查询规范

**禁止直接写 SQL 语句**，所有数据库查询必须使用 Sequelize 模型方法：

```js
// ✅ 正确：使用模型方法
const user = await getModel('User').findByPk(1);
const works = await getModel('Work').findAll({ where: { status: 1 } });

// ❌ 禁止：直接写 SQL
await sequelize.query('SELECT * FROM users WHERE id = 1');
```

**软删除模型禁止设置 `paranoid: true`**，必须使用 `delete_version` 机制 + `registerDeleteVersionHooks` 钩子：

```js
// ✅ 正确：使用 delete_version
timestamps: true,
paranoid: false,  // 禁用 Sequelize 内置 paranoid
// 在模型末尾调用
registerDeleteVersionHooks(Model);

// ❌ 禁止：paranoid: true（会生成 deleted_at 查询，但表无此列）
timestamps: true,
paranoid: true,  // 错误！
```

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
// 推荐入口：getStore 统一工厂
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

环境变量：`REDIS_ENABLED`、`REDIS_HOST`、`REDIS_PORT`、`REDIS_PASSWORD`、`REDIS_TLS`、
`REDIS_TLS_SKIP_VERIFY`、`REDIS_BACKUP_HOST`、`REDIS_CONNECT_TIMEOUT`、`REDIS_MAX_RETRIES`

健康状态通过 `app.redisHealthy` 和 `app.onRedisHealthChange(cb)` 通知所有依赖模块。

### 铁律：所有 Redis 操作必须经过 Redis 模块

**禁止直接操作 `request.server.redis` / `app.redis` 等原始客户端。**

所有 Redis 操作必须通过 `src/framework/redis/` 模块 API 执行（`getStore` / `RedisStore` / `getStore().call()` 等）。若模块缺少某个 Redis 命令，**不得绕过模块直接调用**，应在 `RedisStore` 中补充相应方法（走统一超时保护和错误包装）。完整规范见 `.claude/skills/fullstack-rules/references/backend/redis.md`。

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

测试文件在 `src/__tests__/` 下，使用 Fastify inject 进行集成测试。

覆盖率阈值：branches 30%, functions 40%, lines 40%, statements 40%

## 开发规范

- 注释和文档使用简体中文
- 修改现有代码前先说明改动计划
- 遇到不确定的业务逻辑先提问再写代码
- 每个函数写文档注释
- 函数命名使用小驼峰（camelCase）
- **每个独立功能使用单独的文件**（一个文件 = 一个模块，不包含其他模块的功能）
- 修改文件后在合适位置更新 README.md
- 每次修改代码帮我主动提交github，更新commit信息
- **修复问题时先分析原因再修改**：先定位问题根源（查看日志、检查代码流程、复现步骤），明确原因后再动手修改，避免盲目尝试。修复时追踪调用链（至少 2 层），不只看单个文件
- **错误码优先**：错误判断用 `err.code`，不用 `err.message.includes()` 匹配文本
- **空值保护**：所有嵌套对象访问用可选链 `?.`，逐层保护
- **超时保护**：所有可能阻塞的异步操作设置超时兜底
- **功能一致性**：相同功能的不同路径安全级别必须一致（如 HTTP 和 WebSocket 守卫）。

### 文件大小限制

**单个 JS/VUE 文件不超过 1000 行**（含空行和注释）。超过时按功能拆分：

| 文件类型 | 拆分策略                                    | 示例                                                          |
| -------- | ------------------------------------------- | ------------------------------------------------------------- |
| Vue 组件 | 按功能提取 composables（`use*.ts`）和子组件 | `EditorView.vue` → `useCanvas.ts` + `useTools.ts` + `panels/` |
| JS 模块  | 按功能职责拆分为独立模块                    | `auth.js` → `session.js` + `cookie.js` + `permission.js`      |
| API 路由 | 按业务功能拆分路由文件                      | `user.js` → `user-profile.js` + `user-settings.js`            |
| 工具函数 | 按功能域拆分为独立文件                      | `utils.js` → `format.js` + `validate.js` + `transform.js`     |

**拆分原则**：

- **按功能聚合**：相关功能放在同一文件，不相关的拆分出去
- **单一职责**：每个文件只负责一个功能域
- **拆分时机**：当文件接近 800 行时，主动规划拆分方案

### 模块边界规则（一个文件 = 一个模块）

**核心原则**：每个 `.vue` 文件是一个独立的、自包含的模块，**不包含、不内嵌其他模块的功能**。

| 规则               | 说明                                          | 示例                                                  |
| :----------------- | :-------------------------------------------- | :---------------------------------------------------- |
| **职责单一**       | 一个组件只负责一个功能域                      | SearchHero 只管搜索框，不管分类 Tab                   |
| **不内嵌其他模块** | 组件 A 中不出现组件 B 的 UI/逻辑              | FeaturedView 里的 Tab 不应写在 SearchHero 里          |
| **状态归属**       | 由消费方（父组件）管理状态，不内嵌数据        | channels/Tab 状态属于 FeaturedView，不属于 SearchHero |
| **跨模块通信**     | 通过 props / emit / v-model / 共享 composable | 子组件需要数据 → props；需要通知 → emit               |
| **禁止反向依赖**   | 子组件不依赖父组件的内部结构                  | SearchHero 不应知道 FeaturedView 的存在               |

**判断标准**：如果修改功能 X 需要改动组件 Y 的文件，说明边界划错了。

**正反对照**：

| ❌ 违反                                    | ✅ 正确                                        |
| :----------------------------------------- | :--------------------------------------------- |
| SearchHero 里写了分类 Tab 的 HTML/CSS/逻辑 | FeaturedView 自己渲染 Tab，SearchHero 只做搜索 |
| Header 组件里写了侧边栏的 Toggle 逻辑      | 侧边栏状态由父组件管理，Header 通过 emit 通知  |
| 列表组件里写了搜索框                       | 搜索框是独立组件，通过 emit 把搜索词传给列表   |

**例外**：当一个功能**永远只出现在同一个位置**且**不可复用时**，可以作为父组件的内联部分（如 FeaturedView 内部的 Banner 区）。

### 图标使用规范

- **禁止在 UI 中使用 Unicode emoji 作为图标**。emoji 跨平台渲染不一致、不可样式化、无障碍支持差。
- 所有 UI 图标必须使用 SVG 或图标库组件。
- 前端项目优先使用 `lucide-vue-next`（与 firewall 保持一致）；编辑器 toolbar 图标可使用内联 SVG。
- 控制台日志允许使用 emoji 前缀（项目既定日志规范，不影响 UI 渲染）。
- 用户生成内容（如个人简介）中 emoji 不在此限制范围内。

使用 emoji + 彩色文字 + 统一标签格式：

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

| 级别   | emoji       | 颜色   |
| ------ | ----------- | ------ |
| 成功   | ✅          | green  |
| 信息   | 📦 ℹ️ 🛡️ 🌱 | cyan   |
| 警告   | ⚠️          | yellow |
| 错误   | ❌ 🚨       | red    |
| 持久化 | 💾          | dim    |

标准标签：`[Redis]` `[DB]` `[Migrate]` `[Loader]` `[Guard]` `[Guard Config]` `[Firewall]` `[PBAC]` `[Seed]` `[API]` `[Auth]`

## 代码审查规则

审查代码时，必须遵守以下规则（这些规则是从本项目代码中总结出的常见问题）：

### 控制流安全

- **禁止用 `err.message.includes()` 做控制流判断**。必须使用 `err.code` 错误码。本项目使用 `DUPLICATE_ROUTE`、`LOAD_TIMEOUT` 等错误码。
- **所有异步操作必须设超时**。`Promise.race` + `setTimeout`，超时时间 30s。
- **所有定时器/防抖必须有优雅关闭路径**。暴露 `flush()` 方法，在 `app.addHook('onClose')` 中调用。

### 空值安全

- **所有嵌套对象访问必须用可选链 `?.`**。逐层保护，禁止 `configs[a].b[c].d[e]` 这种链式访问。
- **函数参数必须有安全默认值**：`const { enabled = true, allowIps = [] } = opts`。

### 安全一致性

- **相同功能的不同入口路径必须具有相同级别的安全保护**。HTTP 路由有 IP 白名单和权限校验，WebSocket 也必须有。

### 错误处理

- **所有 `continue`/`return` 跳过路径必须记录日志**。禁止静默跳过。
- **非预期输入格式必须记录警告日志**。禁止静默返回默认值。

### 审查流程

1. **追踪调用链** — 检查 import 依赖和调用方（至少 2 层），不只看单个文件
2. **对照清单** — 执行完整的企业级审查清单（见 `.claude/skills/fullstack-rules/references/code-review.md`）
3. **输出报告** — 按严重等级排列问题
4. **修复确认** — 修复后运行 `npm test` 确认不破坏现有功能

### 错误码速查

| 错误码            | 来源        | 说明                 |
| ----------------- | ----------- | -------------------- |
| `DUPLICATE_ROUTE` | `guard.js`  | 路由重复注册         |
| `LOAD_TIMEOUT`    | `engine.js` | 模块加载超时（>30s） |
