# Node.js + Fastify 后端模板

## 目录结构

```
src/
├── db/            # Sequelize 实例 + 迁移 + 软删除钩子
├── redis/         # Redis 连接 + 健康监控 + 各存储后端
├── auth/          # Session + Cookie + ALS + StpUtil
├── firewall/      # 五层拦截管道
├── loader/        # 引擎扫描 registry/ 按数字前缀加载
├── api/           # 路由（按应用分文件夹，含 guard.js）
├── app/<name>/    # 应用层（config + permission/ + dao/ + services/）
├── models/<name>/ # Sequelize 模型（按命名空间注册）
└── data/          # 运行时数据
```

---

## 一、API 路由模板

### 路由三级前缀拼接规则

总路由由三个层级的前缀拼接而成，**写完 API 后必须逐级检查**：

```
system.json 中 prefix: "/stick"          ← 系统级
registerGroupMetadata 中 prefix: "/v1"   ← 分组级
registerSecureRoute 中 url: "/analysis/:stockCode"  ← 路由级
────────────────────────────────────────────
最终路由: /stick/v1/analysis/:stockCode
```

各层级配置示例：

| 层级   | 配置位置                  | 示例                          | 说明                            |
| ------ | ------------------------- | ----------------------------- | ------------------------------- |
| System | `system.json`             | `"prefix": "/stick"`          | 功能域前缀，通常为 `/{appName}` |
| Group  | `registerGroupMetadata()` | `prefix: '/v1'`               | 版本号前缀，通常为 `/v1`        |
| Route  | `registerSecureRoute()`   | `url: '/analysis/:stockCode'` | 实际路径，不含前面的前缀        |

> ⚠️ **常见错误**：`registerSecureRoute` 的 `url` 从 `/` 开始，但**不包含** system 和 group 的前缀。三个前缀由框架自动拼接，url 中不要重复写。

> 🛠️ **开发阶段权限绕过**：开发调试时，将 `requireLogin` 设为 `false`、去掉 `permission`，避免权限拦截影响功能测试。功能调通后，再恢复权限校验并重启验证。

### 路由文件 `src/api/<domain>/v1/<route>.js`

```js
import { registerSecureRoute } from '../../../guard.js';

/** <路由功能描述> */
export default async function (fastify, opts) {
  registerSecureRoute(fastify, {
    name: '<routeName>',
    alias: '<中文别名>',
    method: 'GET',
    url: '/<path>',
    requireLogin: true,
    permission: '<app>:<resource>:<action>',
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.userId) return reply.result.fail('未登录', null, 401);
      const { page, pageSize } = request.query;
      const result = await xxxDao.findAll({ page, pageSize, currentUserId: user.userId });
      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });
}
```

### 系统配置 `src/api/<domain>/system.json`

```json
{
  "name": "<domain>",
  "prefix": "/posecraft/v1",
  "enabled": true,
  "requireLogin": false,
  "allowIps": []
}
```

> 权限支持：字符串 / `{ any: ['a','b'] }` / `{ all: ['a','b'] }`。

---

## 二、DAO 模板 `src/app/<app>/dao/`

```js
import sequelize from '../../../db/index.js';

class XxxDao {
  getModel() {
    return sequelize.models.Xxx;
  }

  async findAll(options = {}) {
    const model = this.getModel();
    const { Op } = await import('sequelize');
    const where = { delete_version: 0 };
    if (options.userId) where.user_id = options.userId;
    if (options.status !== undefined) where.status = options.status;
    if (options.keyword) {
      where[Op.or] = [{ title: { [Op.like]: `%${options.keyword}%` } }];
    }
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const { count, rows } = await model.findAndCountAll({
      where,
      include: [{ model: sequelize.models.User, as: 'author', attributes: ['uid', 'username', 'avatar'] }],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });
    return { list: rows, total: count, page, pageSize };
  }

  async findById(id) {
    const model = this.getModel();
    return await model.findOne({
      where: { id, delete_version: 0 },
      include: [{ model: sequelize.models.User, as: 'author', attributes: ['uid', 'username', 'avatar'] }]
    });
  }

  async create(data) {
    return await this.getModel().create(data);
  }

  async update(id, data) {
    const record = await this.findById(id);
    if (!record) return null;
    return await record.update(data);
  }

  /** 软删除：delete_version 设为自身 id */
  async delete(id, userId) {
    const record = await this.findById(id);
    if (!record || record.user_id !== userId) return false;
    await record.update({ delete_version: id });
    return true;
  }
}

export default new XxxDao();
```

---

## 三、模型模板 `src/models/<app>/<Model>.js`

```js
export default (sequelize, DataTypes) => {
  const Xxx = sequelize.define(
    'Xxx',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(200), allowNull: false, comment: '标题' },
      status: { type: DataTypes.TINYINT, defaultValue: 2, comment: '2待审核 1公开 0私密 -1删除 -2拒绝' },
      user_id: { type: DataTypes.BIGINT, allowNull: false, field: 'user_id' },
      delete_version: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }
    },
    {
      tableName: 'posecraft_xxx',
      timestamps: true,
      paranoid: false, // 使用自定义 delete_version 软删除，不启用 Sequelize 内置 paranoid
      indexes: [{ fields: ['user_id'] }, { fields: ['status'] }],
      comment: 'PoseCraft Xxx 表'
    }
  );

  Xxx.associate = models => {
    Xxx.belongsTo(models.User, { foreignKey: 'user_id', as: 'author' });
  };

  return Xxx;
};
```

---

## 四、迁移文件模板 `migrations/<timestamp>-<name>.js`

```js
export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('posecraft_xxx', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    title: { type: Sequelize.STRING(200), allowNull: false },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    status: { type: Sequelize.TINYINT, defaultValue: 2 },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    created_at: { type: Sequelize.DATE, allowNull: false },
    updated_at: { type: Sequelize.DATE, allowNull: false }
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('posecraft_xxx');
}
```

---

## 五、序列化函数模板 `formatXxx`

集中管理字段输出，避免敏感字段泄漏：

```js
function formatXxx(record, isOwner = false) {
  if (!record) return null;
  const data = record.toJSON ? record.toJSON() : record;
  return {
    id: data.id,
    title: data.title,
    status: data.status,
    count: {
      likes: data.likes_count,
      views: isOwner ? data.views_count : undefined // 仅作者可见
    },
    userInteraction: { liked: !!data.liked, collected: !!data.collected },
    created_at: data.createdAt,
    author: data.author ? { uid: data.author.uid, username: data.author.username } : undefined
  };
}
```

---

## 六、关联查询模板

```js
include: [
  { model: sequelize.models.User, as: 'author', attributes: ['uid', 'username', 'avatar'] },
  { model: sequelize.models.Template, as: 'template', attributes: ['id', 'status', 'delete_version'], required: false }
];
```

---

## 七、Loader 注册模板 `src/loader/registry/NN-<name>.js`

```js
export default async function (app) {
  try {
    // 业务逻辑
    app.decorate('<name>', instance);
    console.log(`✅ [Loader] ${C.green}<name> 加载成功${C.reset}`);
  } catch (err) {
    console.error(`❌ [Loader] ${C.red}<name> 加载失败: ${err.message}${C.reset}`);
  }
}
```

---

## 八、统一响应格式

### reply.result 响应方法

所有响应必须通过 `reply.result.*` 方法返回，确保统一格式：

```json
{ "code": 200, "message": "操作成功", "data": null, "timestamp": 1717000000, "requestId": "req-xxx" }
```

| 方法 | 状态码 | 说明 |
|------|--------|------|
| `reply.result.success(data)` | 200 | 成功响应 |
| `reply.result.paginated(data, total, page, pageSize)` | 200 | 分页响应 |
| `reply.result.created(data)` | 201 | 创建成功 |
| `reply.result.noContent()` | 204 | 无内容 |
| `reply.result.fail(message, data, httpCode, bizCode)` | 400 | 通用失败 |
| `reply.result.badRequest(message)` | 400 | 请求参数错误 |
| `reply.result.unauth(message)` | 401 | 认证失败 |
| `reply.result.forbidden(message)` | 403 | 权限不足 |
| `reply.result.notFound(message)` | 404 | 资源不存在 |
| `reply.result.conflict(message)` | 409 | 资源冲突 |
| `reply.result.tooManyRequests(message)` | 429 | 请求频繁 |
| `reply.result.internalError(message)` | 500 | 服务器内部错误 |

```js
// ✅ 正确：使用统一响应方法
return reply.result.success({ id: 1, name: 'test' });
return reply.result.badRequest('参数缺失');
return reply.result.notFound('用户不存在');

// ❌ 禁止：直接 reply.code().send()
return reply.code(400).send({ error: '参数缺失' });
```

### 统一异常处理

异常基类 `ApiException`（`src/shared/exceptions.js`）：

| 异常类                     | 状态码 | 说明          |
| -------------------------- | ------ | ------------- |
| `BadRequestException`      | 400    | 参数错误      |
| `UnauthorizedException`    | 401    | 未登录/未授权 |
| `ForbiddenException`       | 403    | 权限不足      |
| `NotFoundException`        | 404    | 资源不存在    |
| `ConflictException`        | 409    | 资源冲突      |
| `TooManyRequestsException` | 429    | 请求频率过高  |

统一响应格式：

```json
{ "code": 403, "message": "权限不足", "data": null, "timestamp": 1717000000, "requestId": "req-xxx" }
```

### 认证系统

- Session 双令牌：`sid`（2h）+ 可选 `sid_r`（30d 刷新）
- Redis: `session:<id>` = JSON（用户+角色+权限），TTL 与 cookie 同步
- `StpUtil`：`getLoginId()` / `check()` / `checkRole()` / `hasPermission()` / `checkPermissionAnd/Or()`
- ALS：`getCtx()` / `getDb()` / `getServerResource(name)`

### 三级守卫

```
System（system.json）→ Group（registerGroupMetadata()）→ API（registerSecureRoute()）
```

每级可独立拦截：`enabled` / `allowIps` / `allowRoles` / `requireLogin` / `permission`。

### 数据库

- 模型命名空间：`app.db.<namespace>.<Model>`（user / iam / oauth21 / notice / session / posecraft 等）
- 软删除：`delete_version` 模式（`delete_version = id` 表示已删，查询过滤 `delete_version: 0`）
- 关联：`Model.associate = (models) => {}`
- 迁移：`npm run migrate`，回滚 `--down` / `--down-to <name>`

---

## 九、错误处理最佳实践

### 分层职责

| 层级                      | 职责                           | 示例                                      |
| ------------------------- | ------------------------------ | ----------------------------------------- |
| Controller (路由 handler) | 捕获所有异常，转为统一响应格式 | try/catch + reply.result.fail()           |
| Service                   | 抛出业务异常，不捕获           | throw new BadRequestException('参数错误') |
| DAO                       | 不捕获，让异常自然传播         | 直接 await，异常向上传递                  |

### 模板

```js
handler: async (request, reply) => {
  try {
    const result = await xxxService.doSomething(request.body);
    return reply.result.success(result);
  } catch (e) {
    // 业务异常已携带状态码
    if (e instanceof ApiException) {
      return reply.result.fail(e.message, null, e.code);
    }
    // 未知异常记录日志
    console.error(`❌ [API] ${C.red}未知错误: ${e.message}${C.reset}`);
    return reply.result.fail('服务器内部错误', null, 500);
  }
};
```

### 禁止事项

- ❌ 吞掉异常：`catch (e) { }`
- ❌ 只打印不处理：`catch (e) { console.log(e) }`
- ❌ catch 后继续执行：异常后代码可能在数据损坏状态下运行
- ✅ 记录日志 + 向上抛或给用户反馈

---

## 十、开发完成后验证清单

每写完一个 API，逐项检查：

### 路由检查

- [ ] `system.json` 的 `prefix` + `registerGroupMetadata` 的 `prefix` + `registerSecureRoute` 的 `url` 拼接正确
- [ ] 最终路由无重复前缀（如 `/stick/v1/stocks` 无误写为 `/stick/stocks` 或 `/stick/v1/v1/stocks`）
- [ ] 路由注册无冲突（同名 `name` 或同 `method+url` 组合）
- [ ] 前端 API 文件中 `baseURL` 或调用路径与后端路由一致

### 功能检查

- [ ] 用 `curl` 或 Node.js 发送真实请求验证响应，**不依赖前端**
- [ ] 测试 200 正常响应格式，确认返回数据结构与前端类型定义一致
- [ ] 测试 400 参数错误
- [ ] 测试 401 未登录
- [ ] 测试 403 无权限
- [ ] 测试 404 资源不存在
- [ ] 测试空数据边界（空数组、null 字段）

### 外部 API 验证

- [ ] 调用外部数据源前，先用 `curl` 单独请求该外部接口，确认返回格式
- [ ] 集成代码写完后再用 `curl` 验证后端 → 外部 API → 前端的全链路
- [ ] 测试 404 资源不存在

### 前后端对应检查

- [ ] 后端路由的 `url` 和前端 `api/xxx.ts` 中的路径一致
- [ ] 后端 `permission` 和前端 `v-auth` 指令中的权限编码一致
- [ ] 后端请求/响应字段名和前端 TypeScript 类型定义一致
