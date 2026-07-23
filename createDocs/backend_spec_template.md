# 后端功能规格书模版 (Backend Spec Template)

---

## 1. 模块与业务基本信息 (Module Metadata)

- **模块名称**：[例如：用户资产管理]
- **路由统一前缀 (Prefix)**：[例如：`/api/v1/assets`]
- **安全认证策略**：[例如：三级守卫引擎校验 (requireLogin: true)，需要满足特定权限 `'asset:write'`]
- **底层缓存策略**：[例如：Redis 缓存 10 分钟，缓存键 `cache:user:assets:<userId>`]

---

## 2. 源码物理布局规范 (Source Files Directory)

请指示 AI 在以下物理路径下创建和组织后端代码：

```text
├── src/
│   ├── api/[模块名称]/
│   │   ├── system.json                  # 定义安全默认值、enabled 和 prefix
│   │   └── v1/
│   │       └── [业务名称].js            # 路由插件入口，使用 registerSecureRoute 注册
│   ├── app/[模块名称]/
│   │   ├── permission/
│   │   │   └── [业务名称].permission.js # 注册该模块所需的角色与操作权限名 (PBAC)
│   │   └── dao/
│   │       └── [业务名称].dao.js        # 数据操作访问层，专门编写 Sequelize Query
│   └── models/[模块名称]/
│       └── [模型名称].js                 # Sequelize Model 定义文件
```

---

## 3. 数据库结构设计与迁移 (Database Design & Migration)

### 3.1 实体关系设计 (Entity Relationship)

- **模型类名**：`Asset` （表名：`iam_assets`）
- **物理表结构设计**：
  | 字段名 (Field) | 类型 (Type) | 属性 (Constraints) | 说明 (Description) |
  | :--- | :--- | :--- | :--- |
  | `id` | `INT` | PRIMARY KEY, AUTO_INCREMENT | 唯一主键 |
  | `name` | `VARCHAR(50)` | NOT NULL | 资产名称 |
  | `amount` | `DECIMAL(12,2)` | DEFAULT 0.00, NOT NULL | 资产金额 |
  | `delete_version` | `INT` | DEFAULT 0, NOT NULL | 软删除版本标记（基于软删除 Hook 校验） |

### 3.2 迁移文件规格 (Umzug Migration File)

请指示 AI 编写 Umzug v3 迁移脚本，导出包含 `up` 与 `down` 逻辑的迁移：

```javascript
export async function up({ context: sequelize }) {
  const { DataTypes } = sequelize.constructor;
  await sequelize.getQueryInterface().createTable('iam_assets', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    // 写入字段明细
  });
  // 建立索引
  await sequelize.getQueryInterface().addIndex('iam_assets', ['name']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('iam_assets');
}
```

---

## 4. API 路由接口契约设计 (API Route Contracts)

每一个端点都应该遵循以下契约，并包含 AJV Schema 参数校验：

### 接口一：新增用户资产 (Create Asset)

- **Method & URL**：`POST /api/v1/assets/create`
- **安全守卫限制**：`requireLogin: true`, `permission: 'asset:create'`
- **AJV Schema 请求校验 (Schema)**：
  ```javascript
  const bodySchema = {
    type: 'object',
    required: ['name', 'amount'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 50 },
      amount: { type: 'number', minimum: 0 }
    }
  };
  ```
- **请求及应答样例 (Request & Response Example)**：
  - **Request Body**: `{"name": "比特币", "amount": 1.25}`
  - **Response Body**:
    ```json
    {
      "code": 200,
      "message": "资产创建成功",
      "data": { "id": 5, "name": "比特币", "amount": 1.25 },
      "timestamp": 17170000000,
      "requestId": "req-xxxx"
    }
    ```

---

## 5. 核心业务处理流程 (Service Logic & Transactions)

请让 AI 严格按照以下逻辑步骤进行逻辑方法的实现（在对应的 DAO/Service 中封装）：

1.  **参数预检**：
    - 从 `StpUtil.getLoginId()` 获取当前登录用户的 ID。
    - 校验当前用户的总资产个数，如果超过限额 10 个，则提前抛出 `BadRequestException('资产数量已达上限')`。
2.  **事务控制 (Transaction)**：
    - 调用 `app.db.transaction` 开启全局事务。
    - 在事务中新建资产记录。
    - 更新用户总账表中的总额度，锁定该行记录（`select ... for update`）。
3.  **事务提交与收尾**：
    - 若上述任意一步骤失败，抛出错误，事务将自动 Rollback。
    - 事务提交成功后，清除 Redis 缓存 `cache:user:assets:<userId>`。

---

## 6. 异常控制与全局错误映射 (Error Mapping)

所有的业务逻辑执行中产生的非预期情况，必须显式地使用我们在 `src/shared/exceptions.js` 中定义的统一异常类进行抛出，全局错误处理器将自动进行格式化：

- **资源不存在**：
  - 触发场景：当查找的资产 ID 并不属于当前用户。
  - 抛出异常：`throw new NotFoundException('资产不存在或已被删除')`。
- **参数逻辑错误**：
  - 触发场景：删除还有余额的资产。
  - 抛出异常：`throw new BadRequestException('无法删除仍有余额的资产，请先提现', 30005)` （业务自定义状态码为 30005）。

---

## 7. 编码规范约束 (Coding Standards)

1.  **模块自治性**：不鼓励直接在路由文件中进行复杂的业务开发。复杂的数据库事务和逻辑必须统一编写到独立的 `dao.js` 或者 `service.js` 文件中，并通过 `import` 引用。
2.  **优雅退出与资源清理**：如有定时任务、连接池创建，必须注册在 `fastify.addHook('onClose')` 中进行连接释放或注销，保证服务器优雅退出。
3.  **严格遵循 ESM**：所有导入文件必须携带明确的扩展名（例如 `import { getDb } from './db/index.js'`），不可省略 `.js` 扩展名。
