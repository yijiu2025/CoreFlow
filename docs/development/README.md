# 开发指南（development）

**动手写后端代码时**的规范与模板：开发总纲 → 按模块类型取用（模型 / 路由 / 应用模块）。

> 原先放在本目录的 4 篇**前端接入模板**（登录流程前端开发模板 / 多账号免切接入模板 /
> 设备 ID 全链路梳理 / 设备 ID 稳定性评估）已于 2026-10-31 移入
> [archive/legacy-frontend/](../archive/legacy-frontend/) —— 它们描述的前端工程已迁出本仓。
> 后端侧的认证契约仍见 [standards/auth-integration.md](../standards/auth-integration.md)。

| 文档 | 内容 |
| --- | --- |
| [development-standards.md](./development-standards.md) | 开发规范总纲：文件头注释标准块（功能 / 说明 / 作者）、新建文件铁律 |
| [app-module.md](./app-module.md) | 应用模块开发：一个应用模块的组成部分与目录约定 |
| [models.md](./models.md) | 数据模型：Sequelize 模型文件模板与字段约定 |
| [api-routes.md](./api-routes.md) | API 路由：`registerSecureRoute()` 注册路由自动附加三级安全守卫 |
| [naming.md](./naming.md) | 命名规范：核心铁律「JS 内存 camelCase / SQL 磁盘 snake_case」 |
| [migrations.md](./migrations.md) | 数据库迁移：migrate / rollback 命令与迁移文件约定 |
| [code-review.md](./code-review.md) | 代码审查标准与流程：适用范围（`src/` / `migrations/` / `scripts/`）、配套制品 |
| [注册登录全链路流程图.md](./注册登录全链路流程图.md) | 注册 / 登录 / 注销全链路：基于 `api/oauth21` + `framework/auth` 实际代码绘制的流程图 |

总入口（全部文档的地图）在 [../README.md](../README.md)。
