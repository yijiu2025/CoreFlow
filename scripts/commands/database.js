/**
 * 数据库管理命令模块
 */
import { execSync } from 'child_process';
import { getSequelize, getTableNames, testConnection } from '../lib/db.js';
import { printSuccess, printInfo, printError, printLine } from '../lib/table.js';

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
  console.log(`📊 共 ${tables.length} 张表`);

  console.log('\n表列表：');
  tables.forEach((table, i) => {
    console.log(`  ${i + 1}. ${table}`);
  });
}

/**
 * 执行数据库迁移
 */
export async function dbMigrate() {
  console.log('🔄 执行数据库迁移...');
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

  console.log('\n📋 表结构详情：\n');

  for (const table of tables) {
    const [columns] = await sequelize.query(`DESCRIBE ${table}`);

    console.log(`表名: ${table}`);
    printLine(80);
    console.log('  列名'.padEnd(25) + '类型'.padEnd(25) + '允许空'.padEnd(10) + '键');
    printLine(80);

    columns.forEach((col) => {
      const key = col.Key === 'PRI' ? '🔑 主键' : col.Key === 'MUL' ? '🔗 索引' : col.Key === 'UNI' ? '✨ 唯一' : '';
      console.log(
        `  ${col.Field.padEnd(23)}${col.Type.padEnd(23)}${(col.Null === 'YES' ? '是' : '否').padEnd(8)}${key}`
      );
    });

    console.log('');
  }
}

/**
 * 数据库优化
 */
export async function dbOptimize() {
  const tables = await getTableNames();
  const sequelize = getSequelize();

  console.log('🔧 优化数据库表...\n');

  for (const table of tables) {
    try {
      await sequelize.query(`OPTIMIZE TABLE ${table}`);
      printSuccess(`${table} 优化完成`);
    } catch (err) {
      printError(`${table} 优化失败: ${err.message}`);
    }
  }
}
