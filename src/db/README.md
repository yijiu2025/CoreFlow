# DB 模块

基于 Sequelize v6 + MySQL 的数据库访问层，提供连接管理、Umzug 迁移、模型自动加载、软删除钩子等能力。

## 文件结构

```
src/db/
├── index.js              # Sequelize 实例初始化、连接池配置
└── migrate.js            # Umzug 迁移运行器（独立脚本）

src/models/               # 模型定义目录（按领域分子目录）
├── user/                 # 用户域：User, UserIdentity
├── iam/                  # 权限域：Role, UserRole, InlinePolicy, Permission
├── oauth21/              # OAuth 域：OauthClient, OauthCode, OauthToken, OauthApproval, OauthConsent
├── notice/               # 通知域：EmailCode, NoticeConfig
└── session/              # 会话域：UserSession, SessionToken, SessionLog

src/utils/
└── softDeleteHooks.js    # 软删除 delete_version 钩子工具

migrations/               # Umzug 迁移文件目录
```

## 环境变量

| 变量              | 默认值  | 说明                                     |
| ----------------- | ------- | ---------------------------------------- |
| `DB_TYPE`         | `mysql` | 数据库类型（mysql / postgres / sqlite）  |
| `DB_HOST`         | -       | 数据库主机地址                           |
| `DB_PORT`         | `3306`  | 数据库端口                               |
| `DB_NAME`         | -       | 数据库名称                               |
| `DB_USER`         | -       | 数据库用户名                             |
| `DB_PASS`         | -       | 数据库密码                               |
| `DB_SYNC`         | `false` | 启动时是否自动同步表结构（仅限开发环境） |
| `DB_POOL_MAX`     | `10`    | 连接池最大连接数                         |
| `DB_POOL_MIN`     | `2`     | 连接池最小连接数                         |
| `DB_POOL_ACQUIRE` | `30000` | 获取连接超时（ms）                       |
| `DB_POOL_IDLE`    | `10000` | 空闲连接释放时间（ms）                   |

## 启动流程

```
index.js → createApp() → initLoader(app)
                            ↓
                     03-db.js（数据库连接）
                       ├─ sequelize.authenticate()
                       ├─ app.decorate('db', { sequelize, Sequelize, transaction })
                       └─ onClose → sequelize.close()
                            ↓
                     06-models.js（模型加载）
                       ├─ 扫描 src/models/ 目录
                       ├─ 注册模型到 app.db.<namespace>.<ModelName>
                       ├─ 执行 model.associate() 建立关联
                       └─ DB_SYNC=true 时 sync({ alter: true })
```

## 核心 API

### app.db

Fastify 装饰器，注入的数据库对象。

```js
// 在路由中使用
const user = await app.db.user.User.findByPk(1);
const role = await app.db.iam.Role.findOne({ where: { code: 'admin' } });

// 事务
const result = await app.db.transaction(async (t) => {
  const user = await app.db.user.User.create(
    { username: 'test' },
    { transaction: t }
  );
  await app.db.user.UserIdentity.create(
    {
      user_id: user.id,
      identity_type: 'password',
      identifier: 'test',
      credential: hash
    },
    { transaction: t }
  );
  return user;
});
```

### 模型命名空间

模型按领域子目录自动注册为二级命名空间：

| 命名空间         | 模型                                                            | 表名                                                                          |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `app.db.user`    | User, UserIdentity                                              | user_user, user_identity                                                      |
| `app.db.iam`     | Role, UserRole, InlinePolicy, Permission                        | iam_role, iam_user_role, iam_inline_policy, permissions                       |
| `app.db.oauth21` | OauthClient, OauthCode, OauthToken, OauthApproval, OauthConsent | oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents |
| `app.db.notice`  | EmailCode, NoticeConfig                                         | notice_email_codes, notice_configs                                            |
| `app.db.session` | UserSession, SessionToken, SessionLog                           | session_user_session, session_tokens, session_logs                            |

## 迁移系统

基于 Umzug v3，迁移文件存储在 `migrations/` 目录，执行记录保存在数据库 `SequelizeMeta` 表中。

### 常用命令

```bash
# 执行所有待运行的迁移
npm run migrate

# 查看迁移状态（已执行 / 待执行）
node --env-file=.env src/db/migrate.js --status

# 回滚最近一次迁移
node --env-file=.env src/db/migrate.js --down

# 回滚到指定版本（该版本也会被回滚）
node --env-file=.env src/db/migrate.js --down-to 20260527000002-create-iam-tables

# 创建新迁移文件
npx umzug migration:create --name add-xxx-column
```

### 迁移文件规范

```js
// migrations/20260527000002-create-iam-tables.js
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('iam_role', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    // ... 其他字段
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal(
        'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      )
    }
  });
  await queryInterface.addIndex(
    'iam_role',
    ['app_id', 'code', 'delete_version'],
    { unique: true, name: 'uk_role_app_code' }
  );
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('iam_role');
}
```

### 现有迁移文件

| 文件                                           | 说明                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `20260424000001-create-users-table.js`         | user_user 表                                                                  |
| `20260424000002-create-user-identity-table.js` | user_identity 表                                                              |
| `20260527000001-baseline-all-tables.js`        | 基线标记（不执行操作）                                                        |
| `20260527000002-create-iam-tables.js`          | iam_role, iam_user_role, iam_inline_policy, permissions                       |
| `20260527000003-create-notice-tables.js`       | notice_email_codes, notice_configs                                            |
| `20260527000004-create-oauth21-tables.js`      | oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents |
| `20260527000005-create-session-tables.js`      | session_user_session, session_tokens, session_logs                            |

## 模型定义规范

每个模型文件导出一个工厂函数，接收 `(sequelize, DataTypes)`，返回定义好的 Model。

```js
// src/models/iam/Role.js
import { registerDeleteVersionHooks } from '../../utils/softDeleteHooks.js';

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
      paranoid: true, // 启用软删除
      indexes: [
        {
          unique: true,
          fields: ['app_id', 'code', 'delete_version'],
          name: 'uk_role_app_code'
        }
      ]
    }
  );

  // 关联定义
  Role.associate = (models) => {
    Role.hasMany(models.UserRole, { foreignKey: 'role_id', as: 'userRoles' });
  };

  // 注册软删除钩子
  registerDeleteVersionHooks(Role);

  return Role;
};
```

### 模型文件约定

| 规则   | 说明                                                                           |
| ------ | ------------------------------------------------------------------------------ |
| 文件名 | 大驼峰，与 `sequelize.define()` 的第一个参数一致                               |
| 目录   | 按领域放入 `src/models/<namespace>/` 子目录                                    |
| 导出   | 工厂函数 `(sequelize, DataTypes) => Model`                                     |
| 关联   | 通过 `Model.associate = (models) => {}` 静态方法定义                           |
| 软删除 | 需要 `paranoid: true` + `delete_version` 字段 + `registerDeleteVersionHooks()` |
| 时间戳 | 统一 `timestamps: true`，`underscored: true` 由全局配置生效                    |

## 软删除机制 (delete_version)

解决 MySQL 唯一索引与 NULL 值冲突的创新方案：

```
正常记录: delete_version = 0（参与唯一约束）
已删除:   delete_version = id（不与正常记录冲突）
```

**工作流程：**

1. `beforeDestroy` 钩子：将 `delete_version` 设为记录的 `id`
2. `beforeRestore` 钩子：将 `delete_version` 恢复为 `0`
3. 批量操作自动开启 `individualHooks`，确保钩子生效

**使用场景：** User（邮箱/手机唯一）、UserIdentity（认证标识唯一）、Role（角色编码唯一）、UserRole（用户角色组合唯一）

## 连接池配置

通过环境变量控制，不同部署环境可按需调整：

| 环境变量          | 默认值  | 说明                   |
| ----------------- | ------- | ---------------------- |
| `DB_POOL_MAX`     | `10`    | 最大连接数             |
| `DB_POOL_MIN`     | `2`     | 最小连接数             |
| `DB_POOL_ACQUIRE` | `30000` | 获取连接超时（ms）     |
| `DB_POOL_IDLE`    | `10000` | 空闲连接释放时间（ms） |

## 注意事项

1. **表结构变更**必须通过迁移文件，禁止直接修改模型后依赖 `sync()`
2. **生产环境** `DB_SYNC=true` 会拒绝启动并报错，必须使用 `npm run migrate`
3. **软删除查询**使用 `paranoid: true` 的模型会自动过滤已删除记录，`paranoid: false` 可查询全部
4. **事务使用**推荐通过 `app.db.transaction()` 而非直接调用 `sequelize.transaction()`，保持一致性
5. **模型加载顺序**：06-models.js 在 03-db.js 之后执行，确保数据库连接已就绪
