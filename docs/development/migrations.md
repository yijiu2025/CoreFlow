# 数据库迁移 {#migrations}

## 迁移命令

```bash
npm run migrate                                          # 执行所有待运行迁移
node --env-file=.env src/db/migrate.js --status          # 查看迁移状态
node --env-file=.env src/db/migrate.js --down            # 回滚最近一次
node --env-file=.env src/db/migrate.js --down-to <name>  # 回滚到指定版本
```

::: warning 禁止在生产环境使用 `DB_SYNC=true`
必须通过迁移文件管理表结构变更。
:::

## 创建迁移文件

```bash
npx umzug migration:create --name create-myapp-tables
```

## 迁移文件模板

```js
// migrations/20260601000001-create-myapp-tables.js
export async function up({ queryInterface, Sequelize }) {
  async function createTableIfNotExists(tableName, columns) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some((t) => Object.values(t)[0] === tableName);
    if (!exists) await queryInterface.createTable(tableName, columns);
  }

  async function addIndexIfNotExists(tableName, columns, options = {}) {
    try {
      await queryInterface.addIndex(tableName, columns, options);
    } catch (err) {
      if (!err.message.includes('Duplicate key name')) throw err;
    }
  }

  await createTableIfNotExists('myapp_article', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    title: { type: Sequelize.STRING(200), allowNull: false },
    content: { type: Sequelize.TEXT },
    status: { type: Sequelize.TINYINT, defaultValue: 1 },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('myapp_article', ['user_id'], { name: 'idx_article_user' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('myapp_article');
}
```

## 迁移文件规范

| 规则 | 说明 |
|------|------|
| 文件名 | `{timestamp}-{description}.js` |
| 导出 | `up` 和 `down` 两个异步函数 |
| 幂等性 | 使用 `createTableIfNotExists` 等辅助函数 |
| 回滚 | `down` 函数必须能完全回滚 `up` 的操作 |
| 时间戳列 | 统一使用 `created_at`, `updated_at`, `deleted_at` |

## MySQL 表分区（海量数据）

对于审计日志等海量时间序列数据，使用物理表分区：

```sql
CREATE TABLE `session_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `event` varchar(50) NOT NULL,
  PRIMARY KEY (`id`, `created_at`)
) PARTITION BY RANGE (TO_DAYS(created_at)) (
  PARTITION p_history VALUES LESS THAN (TO_DAYS('2026-04-01')),
  PARTITION p_2026_04 VALUES LESS THAN (TO_DAYS('2026-05-01')),
  PARTITION p_2026_05 VALUES LESS THAN (TO_DAYS('2026-06-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

清理旧数据（毫秒级）：

```sql
-- ❌ 严禁使用
DELETE FROM session_logs WHERE created_at < '2026-04-01';

-- ✅ 物理销毁
ALTER TABLE session_logs DROP PARTITION p_history;
```
