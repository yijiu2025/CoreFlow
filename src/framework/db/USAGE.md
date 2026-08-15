# DB 模块使用文档

## 文件结构

```
src/db/
├── index.js              # Sequelize 实例初始化、连接池配置
├── migrate.js            # Umzug 迁移运行器（独立 CLI 脚本）
├── softDeleteHooks.js    # 软删除 delete_version 钩子工具函数
└── USAGE.md              # 本文档

src/loader/registry/
├── 03-db.js              # 启动时注入 app.db 装饰器
└── 06-models.js          # 自动加载 src/models/ 下的模型 + 注册 getModel

migrations/               # Umzug 迁移文件目录
```

---

## 一、模型获取

### 1.1 `app.db.getModel()` — 推荐入口

统一获取模型，支持命名空间点号或双参数两种写法：

```js
// 方式一：点号分隔（推荐）
const userModel = app.db.getModel('user.User');
const user = await userModel.findByPk(1);

// 方式二：双参数
const roleModel = app.db.getModel('iam', 'Role');
const roles = await roleModel.findAll({ where: { app_id: 'admin' } });
```

**相比直接 `app.db.user.User` 的优势：**
- 统一的错误提示（模型不存在时列出可用命名空间）
- Map 缓存，重复调用无遍历开销
- 点号语法更简洁，避免深层嵌套

**错误处理：**
```js
app.db.getModel('unknown.Model');
// TypeError: getModel: 模型 unknown.Model 不存在。可用命名空间: user, iam, oauth21, notice, session

app.db.getModel('user');
// TypeError: getModel: 需要命名空间和模型名，如 getModel("user.User") 或 getModel("user", "User")
```

### 1.2 直接访问（等价）

```js
const user = await app.db.user.User.findByPk(1);
const role = await app.db.iam.Role.findOne({ where: { code: 'admin' } });
```

---

## 二、连接管理

### 1.1 环境变量

| 变量              | 默认值  | 说明                                     |
| ----------------- | ------- | ---------------------------------------- |
| `DB_TYPE`         | `mysql` | 数据库类型                                |
| `DB_HOST`         | -       | 数据库主机地址（必填）                    |
| `DB_PORT`         | `3306`  | 数据库端口                                |
| `DB_NAME`         | -       | 数据库名称（必填）                        |
| `DB_USER`         | -       | 数据库用户名（必填）                      |
| `DB_PASS`         | -       | 数据库密码                                |
| `DB_SYNC`         | `false` | 启动时自动同步表结构（仅开发环境）        |
| `DB_POOL_MAX`     | `10`    | 连接池最大连接数                          |
| `DB_POOL_MIN`     | `2`     | 连接池最小连接数                          |
| `DB_POOL_ACQUIRE` | `30000` | 获取连接超时（ms）                        |
| `DB_POOL_IDLE`    | `10000` | 空闲连接释放时间（ms）                   |

### 1.2 连接池配置

```js
// src/db/index.js 默认配置
pool: {
  max: 10,    // 最大连接数，根据 QPS 调整
  min: 2,     // 最小连接数，保持常驻
  acquire: 30000, // 获取连接超时 30s
  idle: 10000     // 空闲连接释放 10s
}
```

**推荐生产环境配置：**

| 场景 | DB_POOL_MAX | DB_POOL_MIN | 说明 |
|------|:-----------:|:-----------:|------|
| 低并发（< 100 QPS） | 10 | 2 | 默认 |
| 中等并发（100-500 QPS） | 20 | 5 | 适中 |
| 高并发（> 500 QPS） | 50 | 10 | 注意 DB 连接数上限 |

### 1.3 启动流程

```
03-db.js:
  1. sequelize.authenticate()       ← 验证连接（30s 超时）
  2. app.decorate('db', dbObj)      ← 注入 app.db 装饰器
  3. onClose → sequelize.close()    ← 优雅关闭
```

### 1.4 在路由中使用

```js
// 查询
const user = await app.db.user.User.findByPk(1);
const roles = await app.db.iam.Role.findAll({ where: { app_id: 'admin' } });

// 事务
const result = await app.db.transaction(async t => {
  const user = await app.db.user.User.create({ username: 'test' }, { transaction: t });
  await app.db.user.UserIdentity.create(
    { user_id: user.id, identity_type: 'password', identifier: 'test' },
    { transaction: t }
  );
  return user;
});
```

---

## 二、模型定义

### 2.1 文件结构

```
src/models/
├── user/              # 用户域
│   ├── User.js
│   └── UserIdentity.js
├── iam/               # 权限域
│   ├── Role.js
│   ├── UserRole.js
│   ├── InlinePolicy.js
│   └── Permission.js
├── oauth21/           # OAuth 域
│   ├── OauthClient.js
│   ├── OauthCode.js
│   ├── OauthToken.js
│   ├── OauthApproval.js
│   └── OauthConsent.js
├── notice/            # 通知域
│   ├── EmailCode.js
│   └── NoticeConfig.js
└── session/           # 会话域
    ├── UserSession.js
    ├── SessionToken.js
    └── SessionLog.js
```

### 2.2 模型定义规范

```js
// src/models/iam/Role.js
import { DataTypes } from 'sequelize';
import { registerDeleteVersionHooks } from '../../db/softDeleteHooks.js';

export default (sequelize, DataTypes) => {
  const Role = sequelize.define(
    'Role',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(50), allowNull: false },
      name: { type: DataTypes.STRING(50), allowNull: false },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'iam_role',
      timestamps: true,
      paranoid: true,  // 启用软删除
      indexes: [
        { unique: true, fields: ['app_id', 'code', 'delete_version'], name: 'uk_role_app_code' }
      ]
    }
  );

  Role.associate = models => {
    Role.hasMany(models.UserRole, { foreignKey: 'role_id', as: 'userRoles' });
  };

  registerDeleteVersionHooks(Role);
  return Role;
};
```

### 2.3 模型注册

`06-models.js` 自动扫描 `src/models/` 子目录，按目录名注册命名空间：

| 命名空间 | 目录 | 模型 |
|----------|------|------|
| `app.db.user` | `src/models/user/` | User, UserIdentity |
| `app.db.iam` | `src/models/iam/` | Role, UserRole, InlinePolicy, Permission |
| `app.db.oauth21` | `src/models/oauth21/` | OauthClient, OauthCode, OauthToken, OauthApproval, OauthConsent |
| `app.db.notice` | `src/models/notice/` | EmailCode, NoticeConfig |
| `app.db.session` | `src/models/session/` | UserSession, SessionToken, SessionLog |

---

## 三、软删除（delete_version 机制）

### 3.1 原理

MySQL 唯一索引中，多个 `NULL` 值被视为不冲突（MySQL 官方行为）。标准的 `deletedAt` 软删除方案被删除后设为 `NULL`，会导致唯一约束失效——同一条记录可以被"软删除"多次，且无法阻止重复邮箱/手机号注册。

**delete_version 方案：**

```
记录状态    | delete_version 值 | 唯一约束效果
正常活跃    | 0                 | 参与唯一约束，正常保护
已删除      | 记录 ID           | 每条被删记录的值不同，互不冲突
```

### 3.2 注册钩子

```js
import { registerDeleteVersionHooks } from '../../db/softDeleteHooks.js';

// 基本用法（默认字段名 delete_version）
registerDeleteVersionHooks(Role);

// 自定义字段名
registerDeleteVersionHooks(Model, { field: 'is_deleted' });

// 启用恢复冲突预检（恢复前检查唯一字段是否已被占用）
registerDeleteVersionHooks(User, { checkConflict: true });
```

### 3.3 安全防护

| 防护 | 钩子 | 行为 |
|------|------|------|
| 硬删除保护 | `beforeDestroy` | 拦截 `force: true`，抛出 Error |
| 重复恢复保护 | `beforeRestore` | `delete_version === 0` 时抛 Error |
| 防误改标记 | `beforeUpdate` | 手动改 `delete_version` 抛 Error |
| 无 where 批量删除 | `beforeBulkDestroy` | 无条件 `destroy()` 抛 Error |
| 无 where 批量恢复 | `beforeBulkRestore` | 无条件 `restore()` 抛 Error |
| 恢复冲突预检 | `beforeRestore` | `checkConflict=true` 时查唯一索引冲突 |

### 3.4 使用示例

```js
// 软删除
await Role.destroy({ where: { id: 1 } });
// → delete_version = 1，记录被标记为删除

// 恢复
await Role.restore({ where: { id: 1 } });
// → delete_version = 0，记录恢复为活跃状态

// 禁止的操作
await Role.destroy({ where: { id: 1 }, force: true });
// → Error: [软删除] 禁止硬删除

await Role.destroy();
// → Error: [软删除] 禁止无 where 条件的批量 destroy

await Role.restore({ where: { id: 1 } });
// 如果 delete_version 已为 0 → Error: [软删除] 记录未删除，禁止重复恢复
```

### 3.5 唯一索引定义

所有包含 `delete_version` 字段的唯一索引必须包含 `delete_version`：

```sql
CREATE UNIQUE INDEX uk_role_app_code ON iam_role (app_id, code, delete_version);
```

### 3.6 查询全部记录（含已删除）

```js
// 默认：paranoid: true 自动过滤已删除
await Role.findAll({ where: { app_id: 'admin' } });

// 查全部（含已删除）
await Role.findAll({ where: { app_id: 'admin' }, paranoid: false });
```

---

## 四、迁移管理

### 4.1 常用命令

```bash
# 执行所有待运行迁移
npm run migrate

# 查看迁移状态
node --env-file=.env src/db/migrate.js --status

# 回滚最近一次
node --env-file=.env src/db/migrate.js --down

# 回滚到指定版本
node --env-file=.env src/db/migrate.js --down-to 20260527000002-create-iam-tables

# 创建新迁移文件
npx umzug migration:create --name add-xxx-column
```

### 4.2 迁移文件规范

```js
// migrations/YYYYMMDDHHMMSS-description.js
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('iam_role', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    code: { type: Sequelize.STRING(50), allowNull: false },
    name: { type: Sequelize.STRING(50), allowNull: false },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });
  await queryInterface.addIndex('iam_role', ['app_id', 'code', 'delete_version'], {
    unique: true, name: 'uk_role_app_code'
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('iam_role');
}
```

### 4.3 迁移文件列表

| 文件 | 说明 |
|------|------|
| `20260424000001-create-users-table.js` | user_user 表 |
| `20260424000002-create-user-identity-table.js` | user_identity 表 |
| `20260527000001-baseline-all-tables.js` | 基线标记 |
| `20260527000002-create-iam-tables.js` | iam_role, iam_user_role, iam_inline_policy, permissions |
| `20260527000003-create-notice-tables.js` | notice_email_codes, notice_configs |
| `20260527000004-create-oauth21-tables.js` | oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents |
| `20260527000005-create-session-tables.js` | session_user_session, session_tokens, session_logs |

---

## 五、注意事项

1. **禁止在生产环境使用 `DB_SYNC=true`**，`06-models.js` 会检测并拒绝启动
2. **表结构变更必须通过迁移文件**，禁止直接修改模型后依赖 `sync()`
3. **软删除模型的唯一索引必须包含 `delete_version` 字段**，否则 delete_version=0 的多条记录会冲突
4. **批量删除性能**：`individualHooks: true` 使批量操作变慢（逐条触发钩子），大表批量操作需注意
5. **事务使用**推荐通过 `app.db.transaction()` 而非直接调用 `sequelize.transaction()`