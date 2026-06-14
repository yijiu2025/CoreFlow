# 项目结构 {#project-structure}

## 总览

```
nodeServers/
├── index.js                    # 入口文件
├── package.json
├── .env                        # 环境变量
│
├── src/
│   ├── app.js                  # Fastify 应用创建
│   │
│   ├── app/                    # 应用模块（每个目录 = 一个应用）
│   │   ├── oauth21/            # OAuth 2.1 应用
│   │   ├── user/               # 用户应用
│   │   ├── admin/              # 管理应用
│   │   ├── firewall/           # 防火墙应用
│   │   └── notice/             # 通知应用
│   │
│   ├── api/                    # API 路由（按应用分目录）
│   │   ├── oauth21/
│   │   ├── user/
│   │   ├── admin/
│   │   ├── firewall/
│   │   └── guard.js            # 三级守卫引擎
│   │
│   ├── auth/                   # 认证框架
│   │   ├── index.js            # 认证插件入口
│   │   ├── session.js          # Session 管理
│   │   ├── cookie.js           # Cookie 签名/验证
│   │   ├── permission-loader.js# 权限加载器
│   │   └── StpUtil.js          # 权限工具类
│   │
│   ├── models/                 # 数据模型（按领域分目录）
│   │   ├── user/               # 用户域
│   │   ├── iam/                # 访问控制域
│   │   ├── oauth21/            # OAuth 域
│   │   ├── session/            # 会话域
│   │   └── notice/             # 通知域
│   │
│   ├── db/                     # 数据库连接 + 迁移
│   ├── redis/                  # Redis 连接 + 工具
│   ├── firewall/               # 防火墙引擎
│   ├── notice/                 # 通知工具
│   ├── verify/                 # 验证码工具
│   ├── log/                    # 日志
│   ├── loader/                 # 加载器引擎
│   ├── utils/                  # 通用工具
│   └── data/                   # 运行时数据
│
├── migrations/                 # 数据库迁移文件
├── public/                     # 静态资源
│   ├── firewall/               # firewall 前端构建产物
│   └── sso/                    # oauth21 前端构建产物
│
├── firewall/                   # firewall 前端源码
├── oauth21/                    # oauth21 前端源码
└── docs/                       # 项目文档
```

## 启动流程

```
index.js → createApp() (src/app.js) → initLoader(app) → runEngine() (src/loader/engine.js)
```

引擎扫描 `src/loader/registry/` 目录，按文件名数字前缀顺序加载：

| 顺序 | 文件 | 职责 |
|------|------|------|
| 00 | `00-globals.js` | 装饰 `reply.result`（success/fail/unauth/forbidden） |
| 01 | `01-monitor.js` | 请求监控 + 慢请求告警 |
| 02 | `02-redis.js` | Redis 连接 + 健康监控，失败注入 `null` |
| 03 | `03-db.js` | Sequelize 连接 + `app.db` 装饰器 |
| 04 | `04-auth.js` | Session 验证 + ALS 初始化 |
| 05 | `05-firewall.js` | 五层拦截管道 |
| 06 | `06-models.js` | 自动加载 `src/models/` |
| 07 | `07-api.js` | 自动加载 `src/api/` 路由 |
| 08 | `08-notice.js` | SMTP 配置种子数据 |
| 09 | `09-apps.js` | 扫描 `src/app/` 加载应用配置 + 权限 + 角色 + OAuth 客户端 |

每个 Loader 导出默认函数接收 `app` 实例，错误被捕获并记录，不阻塞其他模块。

## 系统层 vs 应用层

```
src/
│── 系统层（基础设施 + 通用工具）
├── db/                # 数据库连接 + 迁移
├── redis/             # 缓存
├── log/               # 日志
├── auth/              # 认证框架
├── firewall/          # 防火墙
├── notice/            # 通知工具
├── verify/            # 验证码工具
├── models/session/    # 系统模型
│
│── 应用层
├── app/
│   ├── oauth21/       # OAuth 2.1 应用
│   ├── user/          # 用户应用
│   ├── admin/         # 管理应用
│   └── notice/        # 通知应用
│
├── api/               # 路由
├── models/            # 业务模型
└── loader/            # 加载器
```

**系统层**提供基础设施能力，不包含业务逻辑。
**应用层**包含具体业务，每个应用可独立开发和部署。
