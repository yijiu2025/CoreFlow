/* eslint-disable no-console */
/**
 * 数据库迁移脚本运行器 (基于 Umzug + Sequelize)
 * 运行方式：
 *   node --env-file=.env src/db/migrate.js           # 执行所有待运行迁移
 *   node --env-file=.env src/db/migrate.js --down     # 回滚最近一次迁移
 *   node --env-file=.env src/db/migrate.js --status   # 查看迁移状态
 *   node --env-file=.env src/db/migrate.js --down-to <name> # 回滚到指定版本
 */
import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from './index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 手动扫描迁移文件（避免 glob 在 Windows 上的兼容性问题）
const migrationsDir = path.resolve(__dirname, '../../migrations');
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.js'))
  .sort();

const umzug = new Umzug({
  migrations: migrationFiles.map((file) => ({
    name: file.replace('.js', ''),
    path: pathToFileURL(path.join(migrationsDir, file)).href,
    up: async ({ context }) => {
      const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
      return mod.up({ queryInterface: context, Sequelize: sequelize.constructor });
    },
    down: async ({ context }) => {
      const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
      return mod.down({ queryInterface: context, Sequelize: sequelize.constructor });
    }
  })),
  storage: new SequelizeStorage({ sequelize }),
  context: sequelize.getQueryInterface(),
  logger: console
});

/**
 * 执行所有待运行的迁移
 */
async function runUp() {
  const migrations = await umzug.up();
  if (migrations.length === 0) {
    console.log('[Migrate] 没有需要执行的迁移，数据库已是最新状态。');
  } else {
    console.log(`[Migrate] 成功执行了 ${migrations.length} 个迁移：`);
    migrations.forEach((m) => console.log(`  + ${m.name}`));
  }
}

/**
 * 回滚最近一次迁移
 */
async function runDown() {
  const migrations = await umzug.down();
  if (migrations.length === 0) {
    console.log('[Migrate] 没有可回滚的迁移。');
  } else {
    console.log(`[Migrate] 已回滚 ${migrations.length} 个迁移：`);
    migrations.forEach((m) => console.log(`  - ${m.name}`));
  }
}

/**
 * 回滚到指定版本（包含该版本本身也会被回滚）
 * @param {string} targetName 目标迁移名称
 */
async function runDownTo(targetName) {
  const executed = await umzug.executed();
  const target = executed.find((m) => m.name === targetName || m.name.endsWith(targetName));
  if (!target) {
    console.error(`[Migrate] 未找到已执行的迁移: ${targetName}`);
    process.exit(1);
  }
  const migrations = await umzug.down({ to: targetName });
  if (migrations.length === 0) {
    console.log('[Migrate] 没有可回滚的迁移。');
  } else {
    console.log(`[Migrate] 已回滚 ${migrations.length} 个迁移至 ${targetName}：`);
    migrations.forEach((m) => console.log(`  - ${m.name}`));
  }
}

/**
 * 显示迁移状态（已执行 / 待执行）
 */
async function runStatus() {
  const executed = await umzug.executed();
  const pending = await umzug.pending();

  console.log('\n[Migrate] 已执行的迁移:');
  if (executed.length === 0) {
    console.log('  (无)');
  } else {
    executed.forEach((m) => console.log(`  * ${m.name}`));
  }

  console.log('\n[Migrate] 待执行的迁移:');
  if (pending.length === 0) {
    console.log('  (无，数据库已是最新状态)');
  } else {
    pending.forEach((m) => console.log(`  ! ${m.name}`));
  }
  console.log();
}

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0] || 'up';
const downToTarget = args[1];

async function main() {
  try {
    await sequelize.authenticate();
    console.log('[Migrate] 数据库连接成功');

    switch (command) {
      case '--down-to':
        if (!downToTarget) {
          console.error('[Migrate] 用法: node --env-file=.env src/db/migrate.js --down-to <迁移名称>');
          process.exit(1);
        }
        await runDownTo(downToTarget);
        break;
      case '--down':
      case 'down':
        await runDown();
        break;
      case '--status':
      case 'status':
        await runStatus();
        break;
      case '--up':
      case 'up':
      default:
        await runUp();
        break;
    }
  } catch (err) {
    console.error('[Migrate] 执行失败:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();

export { umzug };
