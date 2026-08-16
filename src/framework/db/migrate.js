/* eslint-disable no-console */
/**
 * 数据库迁移脚本运行器 (基于 Umzug + Sequelize)
 * 运行方式：
 *   node --env-file=.env src/framework/db/migrate.js           # 执行所有待运行迁移
 *   node --env-file=.env src/framework/db/migrate.js --down     # 回滚最近一次迁移
 *   node --env-file=.env src/framework/db/migrate.js --status   # 查看迁移状态
 *   node --env-file=.env src/framework/db/migrate.js --down-to <name> # 回滚到指定版本
 *
 * @author yijiu2025
 * @since 2026-07-22
 */
import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from './index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 递归扫描迁移目录，收集顶层与所有子目录下的 .js 文件
 * 按应用划分子目录（user/ oauth21/ posecraft/ ...），基线迁移留在顶层
 *
 * 关键兼容性：Umzug 用 name 匹配 sequelize_meta 表中的已执行记录，
 * 而 DB 中历史记录均为纯 basename（无目录前缀），因此 name 必须取 basename。
 * 跨目录迁移按 basename 时间戳前缀排序，保证全局执行顺序不变。
 *
 * @param {string} dir - 迁移根目录绝对路径
 * @returns {Array<{name: string, path: string}>} 迁移项（name 为 basename，path 为文件 URL）
 */
function scanMigrations(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const collected = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collected.push(...scanMigrations(fullPath));
    } else if (entry.name.endsWith('.js')) {
      collected.push({ name: entry.name.replace('.js', ''), path: pathToFileURL(fullPath).href });
    }
  }
  return collected.sort((a, b) => a.name.localeCompare(b.name));
}

const migrationsDir = path.resolve(__dirname, '../../../migrations');
const migrationItems = scanMigrations(migrationsDir);

const umzug = new Umzug({
  migrations: migrationItems.map(item => ({
    name: item.name,
    path: item.path,
    up: async ({ context }) => {
      const mod = await import(item.path);
      return mod.up({ queryInterface: context, Sequelize: sequelize.constructor });
    },
    down: async ({ context }) => {
      const mod = await import(item.path);
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
    migrations.forEach(m => console.log(`  + ${m.name}`));
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
    migrations.forEach(m => console.log(`  - ${m.name}`));
  }
}

/**
 * 回滚到指定版本（包含该版本本身也会被回滚）
 * @param {string} targetName 目标迁移名称
 */
async function runDownTo(targetName) {
  const executed = await umzug.executed();
  const target = executed.find(m => m.name === targetName || m.name.endsWith(targetName));
  if (!target) {
    console.error(`[Migrate] 未找到已执行的迁移: ${targetName}`);
    setTimeout(() => process.exit(1), 100);
  }
  const migrations = await umzug.down({ to: target.name });
  if (migrations.length === 0) {
    console.log('[Migrate] 没有可回滚的迁移。');
  } else {
    console.log(`[Migrate] 已回滚 ${migrations.length} 个迁移至 ${target.name}：`);
    migrations.forEach(m => console.log(`  - ${m.name}`));
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
    executed.forEach(m => console.log(`  * ${m.name}`));
  }

  console.log('\n[Migrate] 待执行的迁移:');
  if (pending.length === 0) {
    console.log('  (无，数据库已是最新状态)');
  } else {
    pending.forEach(m => console.log(`  ! ${m.name}`));
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
          setTimeout(() => process.exit(1), 100);
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
    setTimeout(() => process.exit(1), 100);
  } finally {
    await sequelize.close();
  }
}

main();

export { umzug };
