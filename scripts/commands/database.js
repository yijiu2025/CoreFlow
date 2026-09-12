/**
 * 数据库管理命令模块
 */
import { execSync } from 'child_process';
import { getSequelize, getTableNames, testConnection } from '../lib/db.js';
import { printSuccess, printInfo, printError, printLine } from '../lib/table.js';
import { createLogger } from '../../src/framework/log/index.js';

const log = createLogger('scripts.commands.database');

/**
 * 查看数据库状态
 */
export async function dbStatus() {
  const connected = await testConnection();

  if (!connected) {
    printError('数据库连接失败');
    return;
  }

  printSuccess('数据库连接正常');

  const tables = await getTableNames();
  log.stdout(`📊 共 ${tables.length} 张表`);

  log.stdout('\n表列表：');
  tables.forEach((table, i) => {
    log.stdout(`  ${i + 1}. ${table}`);
  });
}

/**
 * 执行数据库迁移
 */
export async function dbMigrate() {
  log.stdout('🔄 执行数据库迁移...');
  try {
    execSync('node --env-file=.env src/db/migrate.js', { stdio: 'inherit' });
    printSuccess('迁移完成');
  } catch (err) {
    printError(`迁移失败: ${err.message}`);
  }
}

/**
 * 查看迁移状态
 */
export async function dbMigrateStatus() {
  try {
    execSync('node --env-file=.env src/db/migrate.js --status', { stdio: 'inherit' });
  } catch (err) {
    printError(`查询失败: ${err.message}`);
  }
}

/**
 * 回滚迁移
 */
export async function dbRollback() {
  try {
    execSync('node --env-file=.env src/db/migrate.js --down', { stdio: 'inherit' });
    printSuccess('回滚完成');
  } catch (err) {
    printError(`回滚失败: ${err.message}`);
  }
}

/**
 * 查看表结构
 */
export async function dbTableInfo() {
  const tables = await getTableNames();
  const sequelize = getSequelize();

  log.stdout('\n📋 表结构详情：\n');

  for (const table of tables) {
    const [columns] = await sequelize.query(`DESCRIBE ${table}`);

    log.stdout(`表名: ${table}`);
    printLine(80);
    log.stdout('  列名'.padEnd(25) + '类型'.padEnd(25) + '允许空'.padEnd(10) + '键');
    printLine(80);

    columns.forEach(col => {
      const key = col.Key === 'PRI' ? '🔑 主键' : col.Key === 'MUL' ? '🔗 索引' : col.Key === 'UNI' ? '✨ 唯一' : '';
      log.stdout(
        `  ${col.Field.padEnd(23)}${col.Type.padEnd(23)}${(col.Null === 'YES' ? '是' : '否').padEnd(8)}${key}`
      );
    });

    log.stdout('');
  }
}

/**
 * 数据库优化
 */
export async function dbOptimize() {
  const tables = await getTableNames();
  const sequelize = getSequelize();

  log.stdout('🔧 优化数据库表...\n');

  for (const table of tables) {
    try {
      await sequelize.query(`OPTIMIZE TABLE ${table}`);
      printSuccess(`${table} 优化完成`);
    } catch (err) {
      printError(`${table} 优化失败: ${err.message}`);
    }
  }
}
