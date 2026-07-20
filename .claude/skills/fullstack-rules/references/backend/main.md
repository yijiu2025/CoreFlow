# 后端规范

## 通用规范

| 领域 | 规范 |
|------|------|
| 架构 | 严格遵循分层架构（Controller / Service / DAO），各层职责单一 |
| API | 遵循 RESTful 风格，统一响应格式 |
| 数据库 | 所有表必须包含 `created_at` 和 `updated_at` 字段 |
| 安全性 | 涉及用户身份的接口必须校验权限，防范 SQL 注入和 XSS |
| 目录结构 | 按功能模块划分目录，api/models/app 内按业务子模块或应用区分文件夹 |

---

## 分层架构

### 职责边界

| 层级 | 目录 | 职责 | 禁止 |
|------|------|------|------|
| Controller | `src/api/<domain>/v1/` | 参数校验、调用 Service、返回响应 | 不直接操作数据库 |
| Service | `src/app/<name>/services/` | 业务逻辑、事务编排 | 不直接操作 HTTP 请求 |
| DAO | `src/app/<name>/dao/` | 数据访问、SQL 构建 | 不包含业务判断 |

### 调用链路

```
Request → Controller (参数校验) → Service (业务逻辑) → DAO (数据访问) → Sequelize → MySQL
                                                                    ↓
                                                              异常向上传播
```

---

## 统一响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "timestamp": 1717000000,
  "requestId": "req-xxx"
}
```

### 响应方法

```js
return reply.result.success(data)                                    // code: 200
return reply.result.paginated(list, total, page, pageSize)           // 分页
return reply.result.fail('错误信息', null, 400)                      // 自定义错误码
return reply.result.unauth('未登录')                                 // code: 401
return reply.result.forbidden('权限不足')                            // code: 403
```

---

## 数据库规范

### 迁移

- 所有表结构变更必须通过迁移文件管理
- 禁止在生产环境使用 `DB_SYNC=true`
- 迁移文件 `down` 必须能完全回滚

### 软删除

- 使用 `delete_version` 模式：`delete_version = id` 表示已删除
- 查询时过滤 `delete_version: 0`

### 关联

- 通过 `Model.associate = (models) => {}` 定义
- 关联查询使用 `include`，指定 `as` 和 `attributes`

---

## 技术栈目录

| 技术栈 | 参考文件 | 说明 |
|--------|----------|------|
| Node.js + Fastify + Sequelize | [nodejs-fastify.md](nodejs-fastify/nodejs-fastify.md) | API 路由、DAO、模型、迁移等代码模板 |

> 其他技术栈（如 Java / Python / Go）后续可在此目录下添加对应的子目录和规范文件。

---

## 相关规范

| 规范 | 文件 | 说明 |
|------|------|------|
| 📝 注释规范 | [note.md](../note.md) | 文件头注释、函数注释、控制台日志 |
| 🏷️ 命名规范 | [naming-convention.md](../naming-convention.md) | 代码/文件/数据库命名规则 |
| 🎯 Git 规范 | [git-patterns.md](../git-patterns.md) | 分支模型、提交信息、PR 模板 |
| 🔒 安全规范 | [security.md](../security.md) | 安全红线、XSS/SQL注入防护、环境变量管理 |
| 🧪 测试规范 | [testing.md](../testing.md) | 测试原则、覆盖率、Fastify inject 模板 |
