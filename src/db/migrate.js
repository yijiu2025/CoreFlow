// src/db/migrate.js
// 数据库迁移脚本运行器 (基于 Umzug + Sequelize)
// 运行方式：node --env-file=.env src/db/migrate.js
import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const umzug = new Umzug({
  migrations: {
    // 从 /migrations 目录递归扫描所有 .js 迁移文件
    glob: path.join(__dirname, '../../migrations/*.js'),
    resolve: ({ name, path: migrationPath, context }) => {
      // 动态 ESM 导入支持
      return {
        name,
        up: async () => {
          const { up } = await import(migrationPath);
          return up({
            queryInterface: context,
            Sequelize: sequelize.constructor
          });
        },
        down: async () => {
          const { down } = await import(migrationPath);
          return down({
            queryInterface: context,
            Sequelize: sequelize.constructor
          });
        }
      };
    }
  },
  // 使用数据库表记录已执行的迁移，避免重复执行
  storage: new SequelizeStorage({ sequelize }),
  context: sequelize.getQueryInterface(),
  logger: console
});

// 运行所有待执行迁移
async function runMigrations() {
  try {
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功，开始执行迁移...');

    const migrations = await umzug.up();

    if (migrations.length === 0) {
      console.log('✅ 没有需要执行的迁移，数据库已是最新状态。');
    } else {
      console.log(`✅ 成功执行了 ${migrations.length} 个迁移：`);
      migrations.forEach((m) => console.log(`  ⬆️  ${m.name}`));
    }
  } catch (err) {
    console.error('❌ 迁移执行失败:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigrations();

export { umzug };
