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
│   ├── app.js                  # 启动编排门面（建实例 / 注册基础插件 / 挂错误处理器 / 起引擎）
│   │
│   ├── framework/              # 基础设施层（不写业务）——按六类分组
│   │   ├── config/             #   配置与路径：env 校验 / 覆盖层 / paths.js
│   │   ├── persistence/        #   数据与状态：db / redis / storage
│   │   ├── security/           #   身份与安全：auth / verify / jwt / keys / crypto
│   │   ├── ingress/            #   接入与协议：http / websocket / firewall / net（IP 判据）
│   │   ├── lifecycle/          #   编排与生命周期：loader / startup / scheduler
│   │   └── support/            #   支撑与旁路：log / cli / notice
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
│   ├── utils/                  # 零依赖工具层（颜色 / 集合 / 字符串 / 超时 / CORS / 加密 / 载荷 / 代理信任）
│   └── shared/                 # 跨层共享（异常、DAO 基类等）
│
├── data/                       # 运行期 JSON 状态（gitignore，随卷持久化）
├── logs/                       # 滚动日志（gitignore）
├── public/<app>/               # 公开上传（@fastify/static prefix `/` 直出）
├── storage/<app>/u/<ownerId>/  # 私有文件（只经 /api/files/v1/* 鉴权下发）
│
├── migrations/                 # 数据库迁移文件（按域分目录）
├── packages/                   # npm workspace 包
│   ├── log/                    # wb-logkit（嵌套仓，**本地 gitignore**；CI/镜像从 registry 取 ^1.0.0）
│   ├── theme-core/             # skinsuite（git submodule）
│   ├── shared-device/          # stable-deviceid
│   └── challenge-client/       # 挑战求解客户端
│
├── scripts/                    # 运维脚本（release / 迁移 / verify 关卡），见 scripts/README.md
├── docker/                     # 镜像入口与依赖自证
├── reports/                    # 一次性评审报告（**已 gitignore，不入库**）
└── docs/                       # 项目文档
```

> ⚠️ **运行期目录都在仓库根，不在 `src/` 下**：`data/` `logs/` `public/` `storage/`。
> 往 `src/{data,public,storage}` 里写文件会被 `src/__tests__/storage-root.test.js` 判红 ——
> 数错一层 `../` 会让文件照写不误、但读取方在另一个地方，表现为"功能不生效且无报错"。

> `packages/theme-core` 是 **git submodule**，克隆时要 `--recurse-submodules`。
>
> **`public/` 只放业务上传**（`public/<app>/…`，如 `posecraft/` `user/`）：历史前端构建产物
> （约 152MB）已于 2026-10-31 清理，它们属于对应前端仓、不该随后端发布。
> 目录里保留 `.gitkeep`：`@fastify/static` 的 `root` 必须存在，`Dockerfile` 也有
> `COPY public ./public`，没有占位文件时干净检出里没有这个目录，镜像构建会直接失败。

## 启动流程

```
index.js → createApp() (src/app.js) → initLoader(app) → runEngine() (src/framework/lifecycle/loader/engine.js)
```

引擎扫描 `src/framework/lifecycle/loader/registry/` 目录，按文件名数字前缀顺序加载：

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
├── framework/security/auth/       # 认证：session / cookie / signature / 密码 / 设备
├── framework/security/jwt/        # JWT 签发验证
├── framework/security/keys/       # 密钥仓库（私钥信封加密）
├── framework/persistence/db/         # 数据库连接 + 迁移入口
├── framework/persistence/redis/      # 缓存 / 锁 / 队列 / PubSub
├── framework/support/log/        # 日志
├── framework/support/notice/     # 通知
├── framework/security/verify/     # 验证码
├── framework/lifecycle/loader/     # 加载器引擎
├── framework/ingress/http/       # Fastify 构造参数 / 基础插件 / 安全头 / 全局错误处理器
├── framework/lifecycle/startup/    # 启动期依赖等待 / 就绪判定 / 配置体检 / 日志引导
├── framework/lifecycle/scheduler/  # 定时任务
├── framework/ingress/websocket/  # WS 广播
├── models/session/       # 系统模型（会话 / 令牌 / 日志）
│
│── 应用层
├── app/
│   ├── oauth21/          # OAuth 2.1（登录 / SSO / 授权）
│   ├── user/             # 用户
│   ├── admin/            # 管理
│   ├── firewall/         # 防火墙**应用层**（面板 API / DAO / 流量统计 / CLI）
│   │                     #   防护核心在 framework/ingress/firewall/（engine + detectors 都在那边）
│   ├── guard/            # 三级守卫
│   ├── notice/           # 通知
│   ├── posecraft/        # posecraft 后端
│   └── retroweb/         # retroweb 后端
│
├── api/                  # 路由（域/版本目录）
├── models/               # 业务模型
└── utils/                # 零依赖工具层
```

**系统层**提供基础设施能力，不包含业务逻辑；应用模块之间**禁止互相 import**
（`src/app/<A>` 不得引用 `src/app/<B>`），跨应用共享能力必须下沉到 `framework/`。
