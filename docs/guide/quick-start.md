# 快速上手 {#quick-start}

## 环境要求

- **Node.js** >= 24（`package.json` 的 `engines` 与仓库里的 `.nvmrc` 都钉在 24，CI 与镜像同版本）
  —— 两条来源：`@fastify/static@10` 依赖 ESM-only 的 `content-disposition@3`，需要
  `require(esm)`（Node 18 会直接起不来）；`geoip-lite@2`（防火墙的运行期依赖）声明
  `engines >= 24`。本地直接 `nvm use` 即可
- **MySQL** >= 8.0
- **Redis** >= 6.0（可选：**未配置**时走进程内 `MapStore`；一旦配置就必须连得上，
  否则访问层返回 503，不会静默退回内存）。生产多实例必须配 Redis

## 安装

```bash
# 克隆项目（theme-core 是 git submodule，省略 --recurse-submodules 时它会是空目录）
git clone --recurse-submodules https://github.com/yijiu2025/CoreFlow.git
cd CoreFlow

# 安装依赖
npm install
```

> 本仓只含后端。前端工程（`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` /
> `phonecopy`）已迁出、各自独立维护，安装与启动请到对应仓库进行。

## 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env
```

编辑 `.env` 文件，配置以下必要变量：

```ini
# 数据库
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=root
DB_PASS=your_password

# 安全密钥（务必修改为强随机值，至少 32 字符）
APP_SECRET=your-app-secret-key
SESSION_SECRET=your-session-secret-key
FIREWALL_SECRET=your-firewall-secret-key

# Redis（可选）
REDIS_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

::: warning 安全提示
生产环境必须修改所有默认密钥，框架会在启动时检测不安全的默认值并拒绝启动。
:::

## 数据库迁移

```bash
# 执行迁移，创建所有表
npm run migrate
```

## 启动开发服务器

```bash
# 启动后端（nodemon 热重载）
npm run dev
```

访问：

- 后端 API：`http://localhost:3000`
- 前端面板：已不在本仓（见各前端仓的 README）

## 多应用本地联调（会话隔离）

**cookie 只按 host 划分，端口不参与**（RFC 6265）。所以下面这种"同一台机器、换端口"的联调方式
会出问题：

| 访问方式 | 结果 |
| --- | --- |
| `console.localhost:5173` + `oauth.localhost:5174` | ✅ 各自一份 `sid`，互不干扰 |
| `localhost:5173` + `localhost:5174` | ❌ 共享同一个 `sid`：登录 B 会覆盖 A 的凭证，A 表现为掉线 |

两个前端仓的 Vite 配置都已放行 `*.localhost` 域名（`server.allowedHosts: ['.localhost']`），
所以本地联调请**用不同 hostname，不要用不同端口**。这两个域名都解析到 `127.0.0.1`，不需要改 hosts。

### 同 host 多应用部署怎么办

如果生产必须共享同一个 host（或本地只能用 `localhost:端口`），打开按应用分名的 sid：

```js
// src/config/auth_config.js（或热改 data/auth_config.json）
session: {
  cookieScopedByApp: true
}
```

打开后每个应用各写 `sid_<app>`（`sid_console` / `sid_posecraft`…），A/B 的会话并存、登录 B 不再
顶掉 A；读取时先找专属名、再回落裸 `sid`，所以升级瞬间不会把人踢下线。当前是 **Session 模式**
（`jwt.enabled=false`）时生效，与 JWT 无关。

无论开不开这个开关，服务端都会做**会话归属校验**：凭据里的登录应用（会话的 `appId` / token 的
`aud`）与请求所属应用不一致时返回 **401 `SESSION_APP_MISMATCH`**，前端据此跳登录，而不是拿 A 的
身份继续访问 B，也不是弹"权限不足"。

### 新增应用要改框架吗？

不需要。只要在自己的一亩三分地里声明两处：

| 声明位置 | 写什么 | 作用 |
| --- | --- | --- |
| `src/api/<system>/system.json` | `"app_id": "admin"` | 这个路径前缀属于哪个应用（→ 选 cookie 名、做归属校验） |
| `src/app/<app>/config.js` | `app_id`（可选 `hosts`） | 应用标识 = 权限命名空间 = OAuth 客户端 id；`permission_app_id` 仅历史映射需要 |

启动期由 `08-api` / `10-apps` 自动登记进 `app-registry`，之后请求期只查表（`resolveRequestApp`）。
共享系统（`/auth`、`/verify`、`/api/files`）**故意不声明 `app_id`** —— 它们本来就该跨应用可用，
不参与归属校验。

## 验证安装

```bash
# 存活探针（进程活着就 200，不看依赖）
curl http://localhost:3000/v1/health/live
# 返回统一封装：{"code":200,"message":"...","data":{"status":"ok"},"timestamp":...,"requestId":"..."}

# 就绪探针（关键依赖不可用即 503，用于摘流；带响应式明细）
curl http://localhost:3000/v1/health/ready
# 关键依赖不可用时 data.dependencies.<name>.status = "down"，HTTP 503
```

> 注意响应是**统一封装**（`code` / `message` / `data` / `timestamp` / `requestId`），
> 不是裸的 `{"status":"ok"}`。写探活脚本时判据用 HTTP 状态码最稳。

## 超级管理员管理

### 首次初始化

在 `.env` 中配置管理员信息：

```ini
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=your-strong-password
```

运行初始化脚本（用户不存在时自动创建）：

```bash
npm run setup:admin
```

### 切换超级管理员

```bash
# 方式 1：给已有用户授予 superadmin（保留原管理员）
npm run setup:admin -- --email new-admin@example.com

# 方式 2：修改 .env 后重新运行（自动创建新用户）
# 先修改 SUPERADMIN_EMAIL 和 SUPERADMIN_PASSWORD
npm run setup:admin
```

::: tip 多管理员
系统支持多个超级管理员。运行 `setup:admin` 只会新增，不会移除原有的。
:::

### 撤销超级管理员

```bash
npm run revoke:admin -- --email user@example.com
```

安全机制：

- 自动检查是否为最后一个 superadmin（防止锁死系统）
- 默认需要确认，`--force` 可跳过
- 撤销后自动清除 Redis session

::: warning 注意
撤销后该用户需要重新登录，权限才会生效。
:::

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm start            # 生产启动
npm run migrate      # 执行数据库迁移
npm run lint         # ESLint 自动修复
npm run format       # Prettier 格式化
npm test             # 运行测试
```

## 下一步

- [项目结构](/guide/project-structure) — 了解目录组织方式
- [应用模块开发](/development/app-module) — 创建你的第一个应用模块
- [架构总览](/core/architecture) — 深入理解框架架构
