# 项目结构 {#project-structure}

> 本仓自 2026-10-31 起**只包含后端**。前端工程（`oauth21` / `posecraft` / `admin` /
> `poseadmin` / `firewall` / `phonecopy`）已移出索引、改为独立维护；
> `package.json` 的 `workspaces` 里仍保留它们的名字（`oauth21` / `posecraft` / `firewall`），
> 是为了让本地同时开发前后端时能复用同一份依赖树 —— 干净检出里没有这些目录时 npm 会跳过。

## 总览

```
nodeServers/
├── index.js                    # 入口文件
├── package.json                # workspaces: packages/* + 三个（已迁出的）前端目录名
├── .env                        # 环境变量（模板见 .env.example / .env.docker.example）
│
├── src/
│   ├── app.js                  # Fastify 应用创建 + 生命周期编排
│   │
│   ├── framework/              # 基础设施层（不写业务）
│   │   ├── auth/               # 认证：session / cookie / signature / 密码 / 设备
│   │   ├── jwt/                # JWT 签发与验证（密钥取自 framework/keys）
│   │   ├── keys/               # RSA 密钥仓库（私钥信封加密落库）
│   │   ├── loader/             # 加载器引擎 + registry/ 顺序表
│   │   ├── db/                 # Sequelize 连接 + 迁移入口
│   │   ├── redis/              # Redis 连接 / getStore / 锁 / 队列 / PubSub
│   │   ├── log/  notice/  verify/  ops/  scheduler/  websocket/  cli/  config/  release/
│   │   └── ...
│   │
│   ├── app/                    # 应用模块（每个目录 = 一个应用）
│   │   ├── oauth21/            # OAuth 2.1 应用（config/ services/ + 路由）
│   │   ├── user/               # 用户应用
│   │   ├── admin/              # 管理应用
│   │   ├── firewall/           # 防火墙应用
│   │   ├── guard/              # 三级守卫
│   │   ├── notice/             # 通知应用
│   │   ├── posecraft/          # posecraft 后端
│   │   └── retroweb/           # retroweb 后端
│   │
│   ├── api/                    # API 路由（按域分目录，域内按版本分目录）
│   │   ├── auth/v1/
│   │   ├── oauth21/v1/
│   │   ├── user/v1/
│   │   ├── admin/v1/
│   │   ├── firewall/
│   │   ├── system/v1/          # health / 配置
│   │   ├── verify/v1/
│   │   └── guard.js            # 三级守卫引擎
│   │
│   ├── models/                 # 数据模型（按领域分目录）
│   │   ├── user/  iam/  oauth21/  session/  key/  notice/  guard/  posecraft/  retroweb/
│   │
│   ├── data/                   # 运行时数据（默认配置 JSON：firewall_config / scheduler_config / traffic_stats）
│   ├── shared/                 # 跨层共享工具
│   └── public/                 # 运行时上传目录（uploads/）
│
├── public/                     # 静态资源根（后端以 @fastify/static 挂载）
│   ├── uploads/                # 上传文件（gitignore，只保留目录）
│   └── <前端名>/               # ⚠️ 历史前端构建产物，前端独立后不再更新，见下方说明
│
├── migrations/                 # 数据库迁移文件（按域分目录）
├── packages/                   # npm workspace 包
│   ├── log/                    # wb-logkit（嵌套仓，**本地 gitignore**；CI/镜像从 registry 取 ^0.5.0）
│   ├── theme-core/             # skinsuite（git submodule）
│   └── shared-device/          # stable-deviceid
│
├── scripts/                    # 运维脚本（release / 迁移 / verify 关卡）
├── docker/                     # 镜像与依赖自证
├── reports/                    # 一次性评审报告（**已 gitignore，不入库**）
└── docs/                       # 项目文档
```

> `packages/theme-core` 是 **git submodule**，克隆时要 `--recurse-submodules`。
>
> **关于 `public/<前端名>/`**：里面是 190 个历史前端构建产物（`assets/*.js|css`），
> 后端以 `@fastify/static` 挂载 `public/` 提供访问。前端工程独立之后这些产物**不再更新**，
> 也不应跟随后端发布 —— 生产上应由各前端自身的 CDN / Nginx 提供。
> 清理它们属于仓库卫生事项（需同步确认 `Dockerfile` 的 `COPY public` 与部署方式），
> 尚未执行，此处如实标注。

## 启动流程

```
index.js → createApp() (src/app.js) → initLoader(app) → runEngine() (src/framework/loader/engine.js)
```

引擎扫描 `src/framework/loader/registry/` 目录，按文件名数字前缀顺序加载：

| 顺序 | 文件             | 职责                                                          |
| ---- | ---------------- | ------------------------------------------------------------- |
| 00   | `00-globals.js`  | 装饰 `reply.result`（success/fail/unauth/forbidden）          |
| 01   | `01-monitor.js`  | 请求监控 + 慢请求告警                                         |
| 02   | `02-redis.js`    | Redis 连接 + 健康监控，连不上则 `app.redis = null`            |
| 03   | `03-db.js`       | Sequelize 连接 + `app.db` 装饰器（已配置但连不上 → 启动失败） |
| 04   | `04-auth.js`     | Session 验证 + ALS 初始化                                     |
| 05   | `05-firewall.js` | 五层拦截管道                                                  |
| 06   | `06-models.js`   | 自动加载 `src/models/`                                        |
| 07   | `07-keys.js`     | JWT 密钥加载 + 启动自检（KEK / 当前密钥）                     |
| 08   | `08-api.js`      | 自动加载 `src/api/` 路由                                      |
| 09   | `09-notice.js`   | SMTP 配置种子数据                                             |
| 10   | `10-apps.js`     | 扫描 `src/app/` 加载应用配置 + 权限 + 角色 + OAuth 客户端     |

每个 Loader 导出默认函数接收 `app` 实例。**失败不一定被吞**：
`01-monitor` / `02-redis` / `09-notice` 在 `OPTIONAL_LOADERS` 名单里，失败只记警告；
其余（鉴权、防火墙、模型、密钥、路由、应用）失败即 **fail-fast** 终止启动 ——
能监听端口却处理不了正确请求的进程，比直接退出更难发现问题。

## 系统层 vs 应用层

```
src/
│── 系统层（基础设施，`framework/`）
├── framework/auth/       # 认证：session / cookie / signature / 密码 / 设备
├── framework/jwt/        # JWT 签发验证
├── framework/keys/       # 密钥仓库（私钥信封加密）
├── framework/db/         # 数据库连接 + 迁移入口
├── framework/redis/      # 缓存 / 锁 / 队列 / PubSub
├── framework/log/        # 日志
├── framework/notice/     # 通知
├── framework/verify/     # 验证码
├── framework/loader/     # 加载器引擎
├── framework/ops/        # 依赖等待 / 就绪判定
├── framework/scheduler/  # 定时任务
├── framework/websocket/  # WS 广播
├── models/session/       # 系统模型（会话 / 令牌 / 日志）
│
│── 应用层
├── app/
│   ├── oauth21/          # OAuth 2.1（登录 / SSO / 授权）
│   ├── user/             # 用户
│   ├── admin/            # 管理
│   ├── firewall/         # 防火墙（引擎在 engine/detectors/，五层管道都在这里）
│   ├── guard/            # 三级守卫
│   ├── notice/           # 通知
│   ├── posecraft/        # posecraft 后端
│   └── retroweb/         # retroweb 后端
│
├── api/                  # 路由（域/版本目录）
├── models/               # 业务模型
└── data/                 # 运行时数据
```

**系统层**提供基础设施能力，不包含业务逻辑；应用模块之间**禁止互相 import**
（`src/app/<A>` 不得引用 `src/app/<B>`），跨应用共享能力必须下沉到 `framework/`。
