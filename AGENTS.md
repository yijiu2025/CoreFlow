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
npm run test:coverage # 测试 + 覆盖率门禁（与 CI 同款；阈值是棘轮，见 jest.config.js）
npm run canvas:scan  # 重扫 src/ 生成函数调用图数据 → docs/public/canvas/data.js（发布文档站时 CI 会自动重扫，无需提交）
```

单个测试：`node --experimental-vm-modules npx jest --testPathPattern <pattern>`

其余工具（CLI、发版、跨进程验收、压测、一次性迁移）逐个说明见 [`scripts/README.md`](scripts/README.md)。

## 改后端代码前必读

**动手写任何工具函数之前，先读 [`src/utils/README.md`](src/utils/README.md)。**

`src/utils/` 是零依赖叶子层，已覆盖八类常见需求（颜色 / 集合 / 字符串 / 超时 / CORS /
手机号加密 / 载荷守卫 / 代理信任）。判据：

- 全仓一律 `import { ... } from '<相对路径>/utils/index.js'`，**不出现** `utils/colors.js` 这类具体路径
- 目录内成员**禁止**走门面互相引用（门面 → 成员 → 门面 是环）
- 成员**禁止** import `framework/**` —— 需要依赖框架的东西放 `framework/`，不放这里
- 判据由 `src/__tests__/conventions/utils-entry.test.js` 机器检查

## Git 提交与发版

提交并推送后，**按情况顺手发布，不必每次询问**。三条通道（git tag / GitHub Release / npm）的判断
与执行已固化成脚本，**默认只预览、不写任何东西**：

```bash
node scripts/release.mjs                        # 预览三条通道各自的决策
node scripts/release.mjs --apply                # 执行
node scripts/release.mjs --from v2.5.0          # 指定起算点（复盘/补发用，默认取最近 tag）
node scripts/release.mjs --apply --allow-dirty  # 工作区有并行任务的改动时放行
```

决策逻辑在 `scripts/lib/release/index.js`（纯函数，测试同目录），脚本本身只做宿主职责。

**判据**（按本次推送包含的提交类型）

| 提交类型                                            | 是否发布 | 版本递增（以最新 tag 为基线） |
| --------------------------------------------------- | -------- | ----------------------------- |
| 破坏性变更（`!:` 或 footer 形式的 BREAKING CHANGE） | 发       | major                         |
| 含 `feat`                                           | 发       | minor：`v2.5.0` → `v2.6.0`    |
| 仅 `fix` / `perf`                                   | 发       | patch：`v2.5.0` → `v2.5.1`    |
| 仅 `chore` `docs` `test` `style` `ci` `refactor`    | **不发** | —                             |

> 破坏性变更**只认 footer 形式**（行首且带冒号）。不可退化成子串匹配 —— commit 正文里"提到"
> 这个关键词（例如写本条规则自身）会让 minor 被误升成 major，这在真实仓库上发生过。

**三条通道各自按情况发布**

| 通道                  | 何时发                                | 要点                                                                                                                                                             |
| --------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| git tag               | 判定发版即打                          | annotated tag，随 `main` 一起推                                                                                                                                  |
| GitHub Release        | 与 tag 一一对应                       | 调 REST API 创建，说明按提交类型分中文组自动生成。凭据取自 **git credential manager**，本机无 `gh` CLI 也能用；**tag 已推而 Release 缺失时，重跑脚本会自动补建** |
| npm（`packages/log`） | 该包本地 `version` 已 bump 到高于线上 | 独立嵌套仓库，走 `npm publish --access public`                                                                                                                   |

**几条边界**

- **版本源是 git tag**，`package.json` 单向跟随 —— **不要反过来拿它的 `version` 推版本号**。每次发版顺手对齐。
- tag 推送同样可能极慢或零输出 → 判定一律用 `git ls-remote --tags origin`，**不信退出码**；超时不等于失败，重试是安全的。（实测：`main` push 曾 5m27s 零输出；`git push origin main v2.6.0` 25s 完成）
- 脚本 push 后会自动调 `~/.workbuddy/tools/fix-packed-refs.mjs` 同步本机 ref —— 本机 git 不写松散 ref，不修则 `git status` 长期谎报 ahead。
- **Release 说明对公网可见**：脚本会列出标题含敏感表述（漏洞 / 密钥 / token 等）的提交，发之前先确认是否适合原文外发。
- `packages/log/` 是独立嵌套仓库（`yijiu2025/log.git`），它的改动要去那个仓库提交。

## 行尾与编码（强制）

**一律 LF**，包括源码、文档、脚本、Dockerfile。只有 Windows 专用批处理（`*.cmd` / `*.bat`）保留 CRLF。

为什么不是 CRLF：部署目标是 Linux 容器，CRLF 的 `.sh` / Dockerfile 进容器会报
`bad interpreter: /bin/sh^M` —— 本地永远复现不出来；且 prettier / Node / eslint 生态默认 LF。

规则落在**三层配置**，改一处必须同步另外两处，否则会出现「编辑器写 CRLF、prettier 改回 LF」的来回抖动：

| 层           | 文件               | 作用                                                        |
| ------------ | ------------------ | ----------------------------------------------------------- |
| 仓库（权威） | `.gitattributes`   | `* text=auto eol=lf`；cmd/bat 例外；二进制不转换            |
| 编辑器       | `.editorconfig`    | 新建/保存时写 LF；`*.md` 保留行尾双空格（硬换行语法）       |
| 格式化       | `.prettierrc.json` | `"endOfLine": "lf"`（**不能写 `auto`**，`auto` 等于不设防） |

排查命令（判据是**索引**，不是工作区表象）：

```bash
git ls-files --eol | grep -v 'i/lf'      # 期望只剩 i/-text（二进制）与 i/none（空文件）
git add --renormalize .                  # 按新属性重写索引
git config core.autocrlf false           # 本仓：检出时不再转 CRLF
```

`core.autocrlf=true` 只会让 `git diff` 反复输出 "LF will be replaced by CRLF" 噪音，并制造
「工作区看着干净、字节却不同」的错觉 —— 换机器/新克隆时先跑一次上面的 `git config`。

## 技术栈

- **运行时**: Node.js ESM (`"type": "module"`)
- **框架**: Fastify v5
- **ORM**: Sequelize v6 + MySQL2
- **缓存**: Redis v5 (node-redis)，连接失败自动降级到内存
- **认证**: Session-based（Cookie sid + Redis）+ OAuth 2.1 JWT（对外 API）
- **迁移**: Umzug v3（`migrations/` 目录）
- **前端**: Vue 3 + Vite + TypeScript（`oauth21/`、`firewall/`、`admin/`）

## 运行期目录（都在仓库根，`src/` 只放代码）

| 目录              | 用途                                                                      | 谁写                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/`           | 运行期 JSON 状态：`*_config.json` 配置热改、`traffic_stats.json` 流量统计 | `framework/config/runtime.js`、`framework/ingress/firewall/config/persisted.js`、`app/firewall/data/store.js`、`framework/lifecycle/scheduler/index.js` |
| `logs/`           | 滚动日志                                                                  | 日志模块                                                                                                                                                |
| `public/<app>/…`  | 公开静态资源                                                              | 业务上传（见下节）                                                                                                                                      |
| `storage/<app>/…` | 私有文件                                                                  | 业务上传（见下节）                                                                                                                                      |

- 路径的**唯一来源**：`src/framework/config/paths.js`（`REPO_ROOT` / `DATA_ROOT` / `dataFile()` / `ensureDataDir()`）
  与 `src/framework/persistence/storage/index.js`（`PUBLIC_ROOT` / `PRIVATE_ROOT` / `appDir` / `resolveFile` / `publicUrl` / `publicUrlToPath` / `privateKey`）。
- **禁止自己数 `../` 拼这些根**：数错一级就会静默写进 `src/<root>/` —— 文件照写不误，但读取方在另一个地方，
  表现为「功能不生效且无报错」（真实事故：`preview.js` 少写一层，预览图全写进 `src/public`，静态服务读根 `public/`，于是全 404）。
  `src/__tests__/storage-root.test.js` 会静态扫 `src/**/*.js` 拦这类写法，并断言 `src/{public,storage,data}` 下没有文件。
- `data/` **不进 git**（`.gitignore`）：里面是部署状态，随卷持久化（compose 的 `app-data`）。
  文件缺失时各处都有内置默认值兜底，首次写入会自动建目录 —— 所以新克隆不需要预置这些 JSON。

## 文件存储（公开 / 私有两套根，别混）

| 根                            | 用途                                          | 访问方式                                                    |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `public/<app>/…`              | 公开资源（作品图 / 头像 / logo / 字体）       | `@fastify/static`（prefix `/`）直出：`GET /<app>/<file>`    |
| `storage/<app>/u/<ownerId>/…` | **私有**文件（合同 / 导出 / 证件 / 付费内容） | 只能经 `GET /api/files/v1/:app/u/<ownerId>/<file>` 鉴权下发 |

- **后端只提供 API，不托管前端产物**：`firewall/`、`admin/`、`oauth21/` 各自 `vite build` 出 `dist/`，
  由 nginx/CDN 部署（`firewall` 的 base 是 `/firewall/`，纯路径挂载）。后端 `public/` **只放业务上传**，
  所以 `defense.safePaths` 里也不需要任何前端目录 —— 前后端目录一旦耦合，前端换路径就得改后端配置。
- **判断放哪**：文件被陌生人拿到会不会有损失？不会 → `public/`；会 → `storage/`。
  `public/` **不是权限控制**，只是"URL 猜不到"，URL 一旦流出就永久可下载、无法撤销。
- 私有文件路径必须带 `u/<ownerId>/`：归属写进路径，下载路由据此鉴权（本人或 admin），
  无需额外查表；`Cache-Control: private, no-store`，非白名单扩展名强制 `attachment`。
- 多实例部署时 `public/` 与 `storage/` 都需共享卷（compose 的 `app-uploads` / `app-storage`）或换成对象存储
  （`src/app/user/services/oss.service.js` 已有降级开关）。
- 历史遗留的 `public/uploads/**` 与 `src/public/**`、`src/data/**` 已分别由
  `node scripts/storage/migrate-legacy-uploads.mjs`（默认预演，`--apply` 真跑）与人工搬迁整理到现行布局；
  前者还会改写 DB 里 `/uploads/...` 的旧 URL。新环境不需要跑它。

## 启动流程

```
index.js → createApp() (src/app.js) → initLoader(app) → runEngine() (src/framework/lifecycle/loader/engine.js)
```

引擎扫描 `src/framework/lifecycle/loader/registry/` 目录，按文件名数字前缀顺序加载：

> 下表已于 2026-09-20 对 `src/framework/lifecycle/loader/registry/` 的实际文件名逐一核对。
> 此前的版本遗漏了 `01-monitor`、`07-keys`，并把已合并的 `09-pbac` / `10-seed-clients` / `11-apps`
> 当成三个独立步骤 —— 请勿再按旧表理解启动顺序。

| 顺序 | 文件             | 职责                                                                                             |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------ |
| 00   | `00-globals.js`  | 装饰 `reply.result`（success/fail/unauth/forbidden）                                             |
| 01   | `01-monitor.js`  | 请求耗时记录 + `X-Response-Time` 响应头 + 慢请求告警                                             |
| 02   | `02-redis.js`    | Redis 连接 + 健康监控，失败注入 `null`                                                           |
| 03   | `03-db.js`       | Sequelize 连接 + `app.db` 装饰器 + `onClose` 优雅退出                                            |
| 04   | `04-auth.js`     | Session 验证 + ALS 初始化（`src/framework/security/auth/`）                                      |
| 05   | `05-firewall.js` | 五层拦截管道（限频/封禁/挑战/Bot/地理围栏）—— ⚠️ **序号是功能性的，不可挪**                      |
| 06   | `06-models.js`   | 自动加载 `src/models/`，按命名空间注册到 `app.db`（实现住 `framework/persistence/db/models.js`） |
| 07   | `07-keys.js`     | 密钥初始化（补齐默认密钥对，依赖模型已加载）                                                     |
| 08   | `08-api.js`      | 自动加载 `src/api/` 路由（读 `system.json`）                                                     |
| 09   | `09-notice.js`   | 通知配置种子数据（SMTP）                                                                         |
| 10   | `10-apps.js`     | 扫描 `src/app/` 加载应用权限和配置（**合并原 09-pbac + 10-seed-clients + 11-apps**）             |

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

## 认证系统 (`src/framework/security/auth/`)

```
src/framework/security/auth/
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

## OAuth 2.1 系统 (`src/api/oauth21/` + `src/app/oauth21/`)

```
src/app/oauth21/       # 业务侧：config / crypto（RSA + JWT）/ dao / middleware（H5 签名 + scope）/ permission / services / templates / view
src/api/oauth21/v1/    # 路由侧：authorize / login / qr / register（含 iframe 受信父域的 CSP 白名单）
```

> 角色 / 权限注册中心（`createPermissionRegistry` / `defineRoles`）属系统层能力，
> 位于 `src/framework/security/pbac/`；`src/utils/` 只放纯函数（见下节）。

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
├── framework/         # 系统层（架构层，零业务语义；按**六类**分组，详见下节）
│   ├── config/        #   配置与路径   env 校验 / 覆盖层 / paths.js（仓库布局唯一来源）
│   ├── persistence/   #   数据与状态   db / redis / storage
│   ├── security/      #   身份与安全   auth / verify / jwt / keys / crypto / pbac
│   ├── ingress/       #   接入与协议   http / websocket / firewall / net
│   ├── lifecycle/     #   编排与生命周期 loader / startup / scheduler
│   └── support/       #   支撑与旁路   log / cli / notice
│
├── app/               # 应用层（每个 app 可整目录删除而不影响启动）
│   ├── oauth21/       #   OAuth 2.1 应用（config + permission/ + crypto + dao + services）
│   ├── user/          #   用户应用（config + permission/ + dao）
│   ├── admin/         #   管理应用（config + permission/ + dao）
│   ├── guard/         #   权限守卫配置持久化（DB）
│   ├── firewall/      #   防火墙的应用侧扩展（配置持久化 / 面板遥测 / 邮件通道）
│   ├── notice/        #   通知应用（config + permission/ + dao）
│   ├── posecraft/     #   姿态识别应用
│   └── retroweb/      #   逆合成工作台后端能力
│
├── api/               # 路由（按应用分文件夹，含 guard.js）
├── models/            # 业务模型（user/, oauth21/, iam/, notice/, key/, guard/ …）
├── shared/            # 前后端共享的纯逻辑（异常、常量）
├── config/            # 静态覆盖层（可选，缺失即用 core 保底值）
├── utils/             # 通用工具（timeout / cors / strings / colors / proxy-trust …）
└── __tests__/         # 测试（conventions/ 是架构守卫，必须与源码结构同步）
```

### framework 的六类分组（2026-11-07 重整）

分组只表达**职责归属**，不改变依赖方向：仍然是「上层 → 下层」单向，`log` / `config`
是被依赖最多的两层（framework 内部跨模块 import 里 `log` 出现 26 次、`config` 12 次）。

| 分组           | 成员                                  | 归类判据                                                   |
| -------------- | ------------------------------------- | ---------------------------------------------------------- |
| `config/`      | config, `paths.js`                    | 只产出"值"，不持有连接、不参与请求                         |
| `persistence/` | db, redis, storage                    | 持有外部连接或磁盘布局                                     |
| `security/`    | auth, verify, jwt, keys, crypto, pbac | 认证 / 授权 / 密钥 / 人机校验 / 角色注册                   |
| `ingress/`     | http, websocket, firewall, net        | 决定"端口如何被访问"：插件装配、协议边界、请求前置管道     |
| `lifecycle/`   | loader, startup, scheduler            | 只在启动期或后台跑，不参与单次请求                         |
| `support/`     | log, cli, notice                      | 横切支撑（日志 / CLI / 出站邮件），可脱离 Fastify 独立驱动 |

> `websocket/` 只有 `preclose.js` —— 它不实现 WS，只负责"半开连接不拖住 `app.close()`"；
> 真正的 `@fastify/websocket` 注册在 `ingress/http/plugins.js` 里。
>
> ⚠️ **移动 framework 下任何文件前先看两件事**：（1）相对 import 的 `../` 层数；
> （2）文件里是否用 `import.meta.url` 自己算仓库根（`config/paths.js`、`persistence/db/models.js`、
> `persistence/db/migrate.js`、`lifecycle/loader/registry/0{8,9,10}-*.js`、
> `support/notice/services/email.js`）—— 这类锚点不会报错，只会静默指向错误目录。

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

关联通过 `Model.associate = (models) => {}` 定义。软删除使用 `delete_version` 模式（`src/framework/persistence/db/softDeleteHooks.js`），模型定义时 `paranoid` 必须设为 `false`（不使用 Sequelize 内置的 deletedAt 机制）。

## 数据库 (`src/framework/persistence/db/`)

```
src/framework/persistence/db/
├── index.js           # Sequelize 实例 + 环境变量校验 + 连接池配置
├── migrate.js         # Umzug 迁移运行器（--up / --down / --down-to / --status）
├── softDeleteHooks.js # 软删除 delete_version 钩子
└── README.md          # 模块文档
```

迁移命令：

```bash
npm run migrate                                                # 执行所有待运行迁移
node --env-file=.env src/framework/persistence/db/migrate.js --status      # 查看迁移状态
node --env-file=.env src/framework/persistence/db/migrate.js --down        # 回滚最近一次
node --env-file=.env src/framework/persistence/db/migrate.js --down-to <name>  # 回滚到指定版本
```

**禁止在生产环境使用 `DB_SYNC=true`**，必须通过迁移文件管理表结构变更。

### 模型获取规范

DAO/Service 层统一使用 `getModel` 获取模型，禁止动态 import 模型文件。支持 `getModel('User')`、`getModel('user.User')`、`getModel('user', 'User')` 三种写法。

### 数据库查询规范

禁止直接写 SQL 语句，必须使用 Sequelize 模型方法（`findAll`/`findOne`/`findByPk`/`create`/`update` 等）。软删除模型禁止设置 `paranoid: true`，必须使用 `delete_version` 机制 + `registerDeleteVersionHooks` 钩子。

## Redis 系统 (`src/framework/persistence/redis/`)

```
src/framework/persistence/redis/
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
  try {
    await doWork();
  } finally {
    await lock.release();
  }
}

// 消息队列
const queue = createQueue('notify', { backend: 'redis' });
queue.push({ id: 1, text: 'hello' });
const msg = queue.shift();
```

完整教程见 [src/framework/persistence/redis/TUTORIAL.md](src/framework/persistence/redis/TUTORIAL.md)。

环境变量：`REDIS_ENABLED`、`REDIS_HOST`、`REDIS_PORT`、`REDIS_PASSWORD`、`REDIS_TLS`、
`REDIS_TLS_SKIP_VERIFY`、`REDIS_BACKUP_HOST`、`REDIS_CONNECT_TIMEOUT`、`REDIS_MAX_RETRIES`

健康状态通过 `app.redisHealthy` 和 `app.onRedisHealthChange(cb)` 通知所有依赖模块。

**铁律：所有 Redis 操作必须经过 `src/framework/persistence/redis/` 模块**，禁止直接操作 `request.server.redis`/`app.redis` 原始客户端。缺 Redis 命令时在 `RedisStore` 补充，不绕过模块。

## 防火墙系统

2026-09 起拆成**两个半边**，别再按 `src/firewall/` 找（那个路径已不存在）：

| 位置                              | 职责                                                                                 | 依赖方向                   |
| --------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| `src/framework/ingress/firewall/` | **防护核心**：五层管道、检测器、挑战、封禁状态机、配置默认值与值级 spec              | 不依赖任何业务代码         |
| `src/app/firewall/`               | **应用层**：面板 API、DAO（落盘 `data/firewall_config.json`）、流量统计、CLI、权限码 | 可依赖 framework，反向禁止 |

```
src/framework/ingress/firewall/
├── bootstrap.js                 # 核心注册入口（生产由 05-firewall.js 调用）
├── config/                      # defaults（内置默认值）/ schema（值级 spec）/ persisted（磁盘）/ validate
├── interface/                   # config-access + telemetry-sink —— 与 app 层的唯一接口
├── challenge/                   # 人机挑战页渲染与校验
├── util/                        # shared / connection-tracker / fingerprint / redis / keys
└── engine/
    ├── pipeline.js              # 五层拦截管道
    └── detectors/               # first-ratelimit / rate-limiter / scan-trap / brute-force / geo-filter / bot-detector

src/app/firewall/
├── index.js                     # initFirewall（测试专用组合；生产注册位只有两个）
├── config/                      # config.js（生效默认值）/ panel.js（面板层键）
├── dao/                         # dao.js（配置持久化）/ block-manager.js（名单 CRUD）
├── data/store.js                # 流量统计（环形缓冲 + WS 广播）
├── services/challenge/          # 挑战签发与校验
├── cli/                         # `npm run cli` 的 firewall 子命令
└── permission/                  # 面板权限码
```

五层流程：连接追踪 → 全局封禁 → 挑战 Cookie → Bot 检测 → 地理围栏 / 端点限频。

配置优先级：**运行期 `data/firewall_config.json` > `src/config/firewall_config.js` > 内置默认值**，
且「用户显式写的优先，值不合法才回落默认」。细节见 `src/app/firewall/README.md`。

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
npm test                    # 运行所有测试（不含覆盖率）
npm run test:coverage       # 运行 + 覆盖率门禁（CI 同款；阈值 44/42/44/45，只升不降）
```

覆盖率阈值是**棘轮**不是目标：2026-11-09 首次接进 CI 时的基线是
语句 46.42% / 分支 44.28% / 函数 46.31% / 行 47.00%。覆盖到新模块后往上提，
不要因为一次没过就往下调（此前阈值写了却从没跑过 `--coverage`，等于没有门禁）。

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
  详见 [docs/archive/test-inline-copy-drift-report.md](docs/archive/test-inline-copy-drift-report.md)
- 在测试里模拟已登录态时，`reply.result` 请 `import` 真实装饰器
  （`framework/lifecycle/loader/registry/00-globals.js`），不要手写副本
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
- **前端规范不在本仓**：本仓自 2026-10-31 起**只含后端**，原先的组件目录 / 设备身份接入 /
  跨内核渲染基线 / 类型闸门 / 多主题版式五类规则已随之迁出（原文归档在
  [docs/archive/legacy-frontend/](docs/archive/legacy-frontend/)）。需要改前端请去对应仓库，
  规则以那边为准：`oauth21` → <https://github.com/yijiu2025/oauth-web>；
  `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy` 各自维护。
  本仓只对它们暴露**线协议**（Cookie 会话、`x-sign` 签名头、`x-csrf-token`、`x-device-id`），
  契约见 [docs/standards/auth-integration.md](docs/standards/auth-integration.md)。
- **共享包仍在仓库里**：`packages/` 下 `log`（wb-logkit，独立仓）/ `shared-device` /
  `challenge-client` / `theme-core`（git submodule）继续维护；改它们要同步发版，
  别在本仓的业务代码里内联复制实现。

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

| 原写法                                    | 改为                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `export default (a, b) => {...}`          | `const defineX = (a, b) => {...};` + 末尾 `export default defineX;`                          |
| `export default new XxxDao()`             | `const xxxDao = new XxxDao();` + 末尾 `export default xxxDao;`                               |
| `export default {...}`                    | `const xxxConfig = {...};` + 末尾 `export default xxxConfig;`                                |
| `export default async function (fastify)` | `async function registerXxxRoutes(fastify) {...}` + 末尾 `export default registerXxxRoutes;` |
| `export default Foo;`                     | 原样移到文件末尾                                                                             |

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

## 代码审查规则

审查代码时按下面这些**从本项目真实缺陷里总结出来的**判据走，不要泛泛地"看着还行"。

### 控制流安全

- **禁止用 `err.message.includes()` 做控制流判断** —— 必须用 `err.code`（本项目已有
  `DUPLICATE_ROUTE` / `LOAD_TIMEOUT` / `INVALID_PARAM` 等）。文案会变，错误码才是契约。
- **所有异步操作必须有超时**：`Promise.race` + `setTimeout`，默认 30s（`src/utils/timeout.js`）。
- **所有定时器 / 防抖必须有优雅关闭路径**：暴露 `flush()`，在 `app.addHook('onClose')` 里调用
  （参考 `guard-config.flushGuardConfig` / firewall `dao.cleanupSaveTimer`）。

### 空值安全

- **嵌套对象访问一律用可选链 `?.`**，禁止 `configs[a].b[c].d[e]` 这种链式裸取。
- **函数参数必须有安全默认值**：`const { enabled = true, allowIps = [] } = opts`。

### 安全一致性

- **同一功能的不同入口必须同级防护**：HTTP 路由有 IP 白名单与权限校验，WebSocket 也必须走
  同一套规则实现（`checkGuardBase` 是唯一实现，别再各写一份）。

### 错误处理

- **所有 `continue` / `return` 跳过路径必须留日志**，禁止静默跳过。
- **非预期输入格式必须打 warn**，禁止静默返回默认值。

### 审查流程

1. **追踪调用链** —— 看 import 依赖与调用方（至少 2 层），不只看单个文件
2. **对照清单** —— 执行完整审查清单（见 `.claude/skills/fullstack-rules/references/code-review.md`）
3. **输出报告** —— 按严重等级排列问题
4. **修复确认** —— 修复后跑 `npm test`，并做毒丸验证（改坏被测点必须变红）

### 错误码速查

| 错误码            | 来源                                   | 说明                      |
| ----------------- | -------------------------------------- | ------------------------- |
| `DUPLICATE_ROUTE` | `api/guard.js`                         | 路由（HTTP / WS）重复注册 |
| `LOAD_TIMEOUT`    | `framework/lifecycle/loader/engine.js` | 模块加载超时（>30s）      |
| `INVALID_PARAM`   | `api/guard.js` / `utils/*`             | 入参无效                  |
