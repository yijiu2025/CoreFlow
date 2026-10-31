# CoreFlow

<p align="center">
  <strong>Fastify v5 + Sequelize v6 的后端框架：认证 · PBAC 权限 · 五层防火墙 · OAuth 2.1</strong>
</p>

<p align="center">
  <a href="https://yijiu2025.github.io/CoreFlow/"><img src="https://img.shields.io/badge/文档-在线阅读-4FC08D?logo=vitepress&logoColor=white" /></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Fastify-v5-000000?logo=fastify&logoColor=white" />
  <img src="https://img.shields.io/badge/MySQL-%E2%89%A58.0-4479A1?logo=mysql&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-%E5%8F%AF%E9%80%89-DC382D?logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>简体中文</b>
</p>

---

## 这是什么

一个**能直接跑起来的后端骨架**，把「认证 / 授权 / 限流 / 拦截 / 审计」这些每个项目都要重写一遍的东西做成框架能力：

- **认证**：Session Cookie（默认）与 JWT Bearer 双模式，RSA 加密登录、HMAC 签名 Cookie、nonce 防重放
- **权限（PBAC）**：`应用:资源:动作` 三段式，通配符 + **deny 优先** + 角色权重，三级守卫（System → Group → API）
- **防火墙**：五层拦截管道（连接追踪 → 封禁 → 挑战 → Bot 检测 → 地理围栏/端点限频），可后台调参
- **OAuth 2.1**：授权码 + PKCE、客户端凭证、设备码、OIDC 发现、刷新令牌轮换与盗用检测
- **可选 Redis，但语义不含糊**：未配置走进程内实现（单实例开箱即用）；一旦配置就要求在线，
  连不上返回 **503** 而不是静默退回内存 —— 多实例下"悄悄降级"会让会话与限流失效

## 这**不是**什么

> 本仓自 **2026-10-31** 起**只包含后端**。前端工程（`oauth21` / `posecraft` / `admin` /
> `poseadmin` / `firewall` / `phonecopy`）已移出索引、各自独立维护
> （`oauth21` → [oauth-web](https://github.com/yijiu2025/oauth-web)）。
>
> 前后端之间只通过 **HTTP 线协议**耦合：Cookie 会话、`x-sign` 签名头、`x-csrf-token`。
> 契约见 [认证集成](https://yijiu2025.github.io/CoreFlow/standards/auth-integration)，
> 前端可以是任意技术栈。

## 快速开始

```bash
# 1. 克隆（theme-core 是 git submodule）
git clone --recurse-submodules https://github.com/yijiu2025/CoreFlow.git
cd CoreFlow

# 2. 安装依赖
npm install

# 3. 配置环境变量（三处密钥必须改，生产环境弱值会被拒绝启动）
cp .env.example .env

# 4. 建表
npm run migrate

# 5. 创建超级管理员
npm run setup:admin -- --email admin@example.com

# 6. 启动（开发模式，nodemon 热重载）
npm run dev
```

验证：

```bash
curl -i http://localhost:3000/v1/health/live    # 存活（进程活着就 200）
curl -i http://localhost:3000/v1/health/ready   # 就绪（关键依赖不可用 → 503）
```

> 响应统一封装为 `{ code, message, data, timestamp, requestId }`，不是裸对象。
> 环境要求：**Node ≥ 24**（CI 与镜像都跑这条 LTS 线，`.nvmrc` 已钉住）、MySQL ≥ 8.0；
> Redis 可选（多实例必须）。
>
> 为什么是 24：
> - `@fastify/static@10` 依赖 ESM-only 的 `content-disposition@3`，需要 `require(esm)`
>   能力（Node ≥ 20.19 / 22.12）—— 这是当初排除 Node 18 的原因；
> - `geoip-lite@2` 声明 `engines: >= 24`，而它是防火墙的运行期依赖。在 22 上跑只是
>   因为还没走到那条被版本门控的路径 —— 声明 20/22 却发 24 的镜像，等于把这个惊喜
>   推给部署方。
> 完整步骤与排错见 [快速上手](https://yijiu2025.github.io/CoreFlow/guide/quick-start)。

## 目录结构

```
src/
├── app.js              # 创建 Fastify 实例 + 生命周期编排
├── framework/          # 基础设施（15 个子域，不写业务）
│   ├── auth/  jwt/  keys/            # 会话 / Cookie / 签名 / 密码 / 密钥
│   ├── db/  redis/                   # Sequelize 连接 / 缓存·锁·队列·PubSub
│   ├── loader/  config/  log/  ops/  # 加载器 / 环境校验 / 日志 / 就绪判定
│   ├── verify/  notice/  scheduler/  # 验证码 / 邮件 / 定时任务
│   └── websocket/  cli/  release/
├── app/                # 业务应用（一个目录 = 一个应用：oauth21 / user / admin /
│                       #   firewall / guard / notice / posecraft / retroweb）
├── api/                # 路由层（域/版本），guard.js 是三级守卫引擎
├── models/             # Sequelize 模型（user / iam / oauth21 / session / key /
│                       #   notice / guard / posecraft / retroweb）
├── data/               # 运行时默认配置（防火墙 / 调度 / 流量统计）
└── shared/  utils/  public/
```

完整目录树（含每个 loader 的加载顺序与 fail-fast 语义）见
[项目结构](https://yijiu2025.github.io/CoreFlow/guide/project-structure)。

## 启动都发生了什么

`index.js → createApp() → initLoader()`，按 `src/framework/loader/registry/` 的文件名前缀顺序加载：

```
00-globals  装饰 reply.result       06-models  扫描 src/models/ 注册全部模型
01-monitor  请求监控 / 慢请求告警     07-keys    JWT 密钥加载 + 启动自检
02-redis    连接 + 健康监控          08-api     扫描 src/api/ 注册路由
03-db       Sequelize 连接          09-notice  SMTP 配置种子
04-auth     Session 验证 + ALS       10-apps    加载应用配置 + 角色 + OAuth 客户端
05-firewall 五层拦截管道
```

`01-monitor` / `02-redis` / `09-notice` 属可选 loader（失败只告警）；其余 **fail-fast**
—— 能监听端口却处理不了正确请求的进程，比直接退出更难排查。

## 权限：三级守卫

| 级别 | 来源 | 可配置项 |
| --- | --- | --- |
| **System** | `src/api/<域>/system.json` | `enabled` / `allowIps` / `requireLogin` |
| **Group** | `registerGroupMetadata()` | `enabled` / `allowIps` / `allowRoles` |
| **API** | `registerSecureRoute()` | `requireLogin` / `requirePermission` / `requireSignature` / `config.rateLimit` |

```js
// 单个权限（deny 优先于 allows，通配符仅支持尾部 `:*`）
registerSecureRoute(fastify, {
  name: 'readConfig',
  method: 'GET',
  url: '/config',
  requirePermission: 'fw:config:read',
  handler: async (req, reply) => reply.result.success(await readConfig())
});

// 任一满足（OR）
requirePermission: { any: ['fw:block:write', 'fw:admin:*'] }

// 全部满足（AND）
requirePermission: { all: ['fw:config:read', 'fw:config:write'] }
```

判定顺序：`enabled → IP/角色 → 登录 → 权限（deny 命中即拒）`；
未登录返回 **401**、权限不足返回 **403**，非法权限格式 **fail-closed**（也是 403）。

## 防火墙：五层管道

```
请求 → ① 连接追踪（并发上限）→ ② 全局封禁（IP/设备/指纹黑名单）
     → ③ 人机挑战（挑战 Cookie）→ ④ Bot 检测（UA 模式 + 高频行为）
     → ⑤ 地理围栏 / 端点限频
```

检测器都在 `src/app/firewall/engine/detectors/`：`rate-limiter`（滑窗，Redis Lua 单次往返 +
内存降级）、`bot-detector`、`brute-force`、`scan-trap`（404/403 扫描陷阱）、`geo-filter`。
限流规则与阈值从 `src/data/firewall_config.json` 读取，管理端可热改（`PATCH /api/firewall/v1/monitor/settings`）。

## API 域

| 域 | 前缀 | 能力 |
| --- | --- | --- |
| `oauth21` | `/oauth2.1` | 授权码+PKCE / 登录 / Token / 撤销 / 设备码 / OIDC |
| `user` | `/user/v1` | 用户信息、权限、会话、设备、注册、重置密码 |
| `auth` | `/auth/v1` | 会话绑定 / 切换账号 / H5 签名令牌 / 验证码校验 |
| `admin` | `/admin/v1` | IAM 角色、策略、客户端管理 |
| `notice` | `/notice/v1` | 通知渠道与模板 |
| `verify` | `/verify/v1` | 图形验证码、邮箱验证码 |
| `firewall` | `/api/firewall/v1` | 监控、封禁、白名单、配置、WebSocket |
| `system` | `/v1` | 健康探针、系统信息 |
| `posecraft` / `retroweb` | `/posecraft` · `/retroweb` | 内置业务应用（可裁剪） |

端点细节见 [OAuth 2.1 API 报告](https://yijiu2025.github.io/CoreFlow/oauth21-api-report) 与
[API 路由规范](https://yijiu2025.github.io/CoreFlow/development/api-routes)。

## 环境变量

62 个可配置项，全部见 `.env.example`（每项都有注释与默认值）。**生产必填的三处密钥**：

```ini
APP_SECRET=       # 至少 32 字符，弱值/默认值会被 validateEnv 拒绝启动
SESSION_SECRET=   # Cookie 签名（换掉 = 全员重新登录）
FIREWALL_SECRET=  # 挑战 Cookie 签名

DB_HOST=127.0.0.1
DB_NAME=your_database_name
DB_USER=root

CORS_ORIGINS=https://your-domain.com   # 生产必填：为空时敏感端点 fail-closed
```

另有两项容易踩：

- `PROXY_TRUST_CIDR`：只有前面真挂了反向代理才填，且**只填代理的确切地址**（如 `172.18.0.2/32`）。
  填整个网段等于把 IP 白名单 / 限流键 / 封禁记录交给攻击者自填 `X-Forwarded-For`。
- `REDIS_ENABLED`：配了就必须连得上（否则访问层 503）；不配则走进程内实现。

## 常用命令

```bash
npm run dev            # 开发（nodemon 热重载）
npm start              # 生产启动（读 .env.production）
npm run migrate        # 数据库迁移
npm run setup:admin    # 创建 / 授予超级管理员
npm run revoke:admin   # 撤销超级管理员（最后一名会被拦住）
npm run cli            # 交互式管理终端
npm test               # Jest（105 套件 / 1250 用例）
npm run lint           # ESLint（自动修复）
npm run verify:all     # 跨进程关卡（锁 / 队列 / 守卫同步 / 统计 / WS 扇出）
npm run docs:dev       # 本地起文档站
```

## 文档

| 入口 | 内容 |
| --- | --- |
| [在线文档](https://yijiu2025.github.io/CoreFlow/) | 完整站（VitePress） |
| [docs/README.md](./docs/README.md) | 文档地图（先读这个再找文档） |
| [架构总览](https://yijiu2025.github.io/CoreFlow/core/architecture) | 分层与依赖方向 |
| [请求处理流水线](https://yijiu2025.github.io/CoreFlow/core/request-pipeline) | 一个请求的完整路径 |
| [认证集成](https://yijiu2025.github.io/CoreFlow/standards/auth-integration) | 前后端线协议（Cookie / 签名 / CSRF） |

## 贡献

提交前请跑 `npm run lint && npm test`。提交信息遵循 Conventional Commits
（`fix` → patch、`feat` → minor、破坏性变更 → major），发版由 `node scripts/release.mjs --apply` 执行，
规则详见 [Git 提交与发版规则](https://yijiu2025.github.io/CoreFlow/standards/git-release-rules)。

## 许可

[GPL-3.0](./LICENSE)
