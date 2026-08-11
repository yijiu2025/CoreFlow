# 后端规范

## 通用规范

| 领域     | 规范                                                              |
| -------- | ----------------------------------------------------------------- |
| 架构     | 严格遵循分层架构（Controller / Service / DAO），各层职责单一      |
| API      | 遵循 RESTful 风格，统一响应格式                                   |
| 数据库   | 所有表必须包含 `created_at` 和 `updated_at` 字段                  |
| 数据库   | 禁止直接写 SQL，使用 Sequelize 模型方法（findAll/findByPk 等）    |
| 数据库   | 软删除使用 `delete_version` 机制，禁止 `paranoid: true`           |
| 安全性   | 涉及用户身份的接口必须校验权限，防范 SQL 注入和 XSS               |
| 目录结构 | 按功能模块划分目录，api/models/app 内按业务子模块或应用区分文件夹 |

---

## 技术栈目录

| 技术栈                        | 参考文件                                      | 说明                                |
| ----------------------------- | --------------------------------------------- | ----------------------------------- |
| Node.js + Fastify + Sequelize | [nodejs-fastify.md](nodejs/nodejs-fastify.md) | API 路由、DAO、模型、迁移等代码模板 |
| Redis                         | [redis.md](redis.md)                          | 数据结构、命令、主备、监控、本项目规范 |
| Java + Spring Boot            | 待添加                                        | -                                   |
| Python + FastAPI              | 待添加                                        | -                                   |
| Go + Gin                      | 待添加                                        | -                                   |

> 其他技术栈后续可在此目录下添加对应的子目录和规范文件。

---

## 相关规范

| 规范        | 文件                                            | 说明                             |
| ----------- | ----------------------------------------------- | -------------------------------- |
| 📝 注释规范 | [note.md](../note.md)                           | 文件头注释、函数注释、控制台日志 |
| 🏷️ 命名规范 | [naming-convention.md](../naming-convention.md) | 代码/文件/数据库命名规则         |
| 🎯 Git 规范 | [git-patterns.md](../git-patterns.md)           | 分支模型、提交信息、PR 模板      |
