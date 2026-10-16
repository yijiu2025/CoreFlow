# 开发指南（development）

**动手写代码时**的规范与模板：开发总纲 → 按模块类型取用（模型 / 路由 / 应用模块）→
集成场景模板（登录 / 多账号 / 设备 ID）。

| 文档 | 内容 |
| --- | --- |
| [development-standards.md](./development-standards.md) | 开发规范总纲：文件头注释标准块（功能 / 说明 / 作者）、新建文件铁律 |
| [app-module.md](./app-module.md) | 应用模块开发：一个应用模块的组成部分与目录约定 |
| [models.md](./models.md) | 数据模型：Sequelize 模型文件模板与字段约定 |
| [api-routes.md](./api-routes.md) | API 路由：`registerSecureRoute()` 注册路由自动附加三级安全守卫 |
| [naming.md](./naming.md) | 命名规范：核心铁律「JS 内存 camelCase / SQL 磁盘 snake_case」 |
| [migrations.md](./migrations.md) | 数据库迁移：migrate / rollback 命令与迁移文件约定 |
| [code-review.md](./code-review.md) | 代码审查标准与流程：适用范围（src / migrations / scripts / 前端各仓）、配套制品 |
| [登录流程前端开发模板.md](./登录流程前端开发模板.md) | 新 app 前端接入登录：复制 5 个文件 + 改 appName/前缀（iframe + postMessage + bind-session 架构） |
| [多账号免切接入模板.md](./多账号免切接入模板.md) | 抖音式多账号免密切换：复制 4 个文件即可接入（后端能力已就绪） |
| [注册登录全链路流程图.md](./注册登录全链路流程图.md) | 注册登录注销全链路：基于 oauth21 SSO + auth 框架实际代码绘制的流程图 |
| [设备ID全链路梳理.md](./设备ID全链路梳理.md) | 设备 ID / 指纹全链路：六端（后端 + 五个前端）生成 / 存储 / 传递 / 消费与问题清单 |
| [设备ID稳定性评估与架构图.md](./设备ID稳定性评估与架构图.md) | 设备 ID 稳定性评估：何时会变、如何收敛变动的配套分析 |

总入口（全部文档的地图）在 [../README.md](../README.md)。
