# 数据库迁移文件规范

本目录存放 Umzug 迁移文件，用于管理数据库表结构变更。

## 命名规范

```
YYYYMMDDHHMMSS-描述.js
```

示例：`20260530000001-create-payment-tables.js`

## 文件模板

新建迁移文件时，严格按以下模板编写：

```js
/**
 * 迁移：创建 XXX 表
 * 包含：table_a, table_b
 * 幂等设计：表已存在时跳过，索引已存在时跳过
 */

export async function up({ queryInterface, Sequelize }) {
  // 幂等建表
  await createTableIfNotExists(queryInterface, 'table_name', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: Sequelize.STRING(100), allowNull: false, comment: '名称' },
    status: { type: Sequelize.TINYINT, defaultValue: 1, comment: '状态' },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '软删除标志' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  // 幂等加索引
  await addIndexIfNotExists(queryInterface, 'table_name', ['name', 'delete_version'], {
    unique: true,
    name: 'uk_name_delete_version'
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('table_name');
}

// ============== 幂等工具函数（每个迁移文件内联定义） ==============

/**
 * 幂等建表：表已存在时跳过
 */
async function createTableIfNotExists(queryInterface, tableName, columns) {
  const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
  const exists = tables.some((t) => Object.values(t)[0] === tableName);
  if (!exists) {
    await queryInterface.createTable(tableName, columns);
  }
}

/**
 * 幂等加索引：索引已存在时跳过
 */
async function addIndexIfNotExists(queryInterface, tableName, columns, options = {}) {
  try {
    await queryInterface.addIndex(tableName, columns, options);
  } catch (err) {
    if (!err.message.includes('Duplicate key name')) throw err;
  }
}
```

## 字段类型速查

| 用途 | Sequelize 类型 | 说明 |
|------|---------------|------|
| 主键 | `Sequelize.BIGINT` + `primaryKey: true, autoIncrement: true` | 自增主键 |
| UUID | `Sequelize.UUID` + `defaultValue: Sequelize.UUIDV4` | 对外标识 |
| 字符串 | `Sequelize.STRING(N)` | N 为最大长度 |
| 文本 | `Sequelize.TEXT` | 长文本 |
| 整数 | `Sequelize.INTEGER` / `Sequelize.TINYINT` | TINYINT 用于状态标志 |
| 布尔 | `Sequelize.BOOLEAN` + `defaultValue: false` | |
| 日期 | `Sequelize.DATE` | |
| JSON | `Sequelize.JSON` | MySQL 5.7+ |
| 枚举 | `Sequelize.ENUM('a', 'b')` | 不推荐，改用 STRING + 应用层校验 |

## 软删除字段规范

需要软删除的表必须包含以下三个字段：

```js
delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '软删除标志(0=活跃)' },
created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
deleted_at: { type: Sequelize.DATE, allowNull: true }
```

唯一索引必须包含 `delete_version` 字段，防止软删除后唯一约束失效：

```js
await addIndexIfNotExists(queryInterface, 'table_name', ['code', 'delete_version'], {
  unique: true,
  name: 'uk_code_delete_version'
});
```

## 索引命名规范

| 类型 | 前缀 | 示例 |
|------|------|------|
| 唯一索引 | `uk_` | `uk_email_delete_version` |
| 普通索引 | `idx_` | `idx_user_id` |
| 复合索引 | `idx_` | `idx_user_app_expire` |

## 常用命令

```bash
npm run migrate                                          # 执行所有待运行迁移
node --env-file=.env src/db/migrate.js --status          # 查看迁移状态
node --env-file=.env src/db/migrate.js --down            # 回滚最近一次
node --env-file=.env src/db/migrate.js --down-to <name>  # 回滚到指定版本
```

## 注意事项

1. **幂等设计**：每个迁移必须可以重复执行不报错（`createTableIfNotExists` + `addIndexIfNotExists`）
2. **不要使用 `DB_SYNC=true`**：生产环境禁止，开发环境也建议用迁移
3. **模型与迁移同步**：新增模型后必须创建对应的迁移文件
4. **回滚函数**：`down` 函数必须能正确回滚 `up` 的所有操作
5. **外键约束**：如果有外键，`down` 函数中先删子表再删父表
