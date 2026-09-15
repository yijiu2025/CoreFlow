/**
 * 系统管理命令模块
 */
import { testConnection } from '../lib/db.js';
import { connectRedis, closeRedis } from '../lib/redis.js';
import { getModels } from '../lib/db.js';
import { printSuccess, printInfo, printWarning, printError, printLine } from '../lib/table.js';
import { logStdout } from '../../src/framework/log/index.js';

/**
 * 系统健康检查
 */
export async function healthCheck() {
  logStdout('🏥 系统健康检查\n');

  // 数据库
  const dbOk = await testConnection();
  if (dbOk) {
    printSuccess('数据库: 连接正常');
  } else {
    printError('数据库: 连接失败');
  }

  // Redis
  const redis = await connectRedis();
  if (redis) {
    try {
      await redis.ping();
      printSuccess('Redis: 连接正常');
    } catch (err) {
      printError(`Redis: ${err.message}`);
    } finally {
      await closeRedis(redis);
    }
  } else {
    printInfo('Redis: 未启用');
  }

  // 环境变量
  const requiredVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'APP_SECRET', 'SESSION_SECRET', 'FIREWALL_SECRET'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  if (missingVars.length === 0) {
    printSuccess('环境变量: 配置完整');
  } else {
    printWarning(`环境变量: 缺少 ${missingVars.join(', ')}`);
  }

  // 统计
  try {
    const { User, Role, OauthClient } = getModels();

    if (User) {
      const userCount = await User.count();
      printInfo(`用户总数: ${userCount}`);
    }

    if (Role) {
      const roleCount = await Role.count();
      printInfo(`角色总数: ${roleCount}`);
    }

    if (OauthClient) {
      const clientCount = await OauthClient.count();
      printInfo(`OAuth 客户端: ${clientCount}`);
    }
  } catch {
    // 忽略统计错误
  }

  // 进程信息
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  logStdout('\n📊 进程信息：');
  printLine();
  logStdout(`  运行时间:   ${formatUptime(uptime)}`);
  logStdout(`  内存使用:   ${formatBytes(memUsage.heapUsed)}`);
  logStdout(`  内存总量:   ${formatBytes(memUsage.heapTotal)}`);
  logStdout(`  Node 版本:  ${process.version}`);
  logStdout(`  平台:       ${process.platform} ${process.arch}`);
  printLine();

  logStdout('\n🎉 健康检查完成');
}

/**
 * 查看系统信息
 */
export async function systemInfo() {
  logStdout('ℹ️  系统信息\n');

  logStdout('环境变量：');
  printLine();
  logStdout(`  NODE_ENV:        ${process.env.NODE_ENV || '未设置'}`);
  logStdout(`  PORT:            ${process.env.PORT || '3000'}`);
  logStdout(`  DB_HOST:         ${process.env.DB_HOST || '未设置'}`);
  logStdout(`  DB_NAME:         ${process.env.DB_NAME || '未设置'}`);
  logStdout(`  REDIS_ENABLED:   ${process.env.REDIS_ENABLED || 'false'}`);
  logStdout(`  JWT_ENABLED:     ${process.env.JWT_ENABLED || 'false'}`);
  printLine();

  logStdout('\n功能开关：');
  printLine();
  logStdout(`  Redis:           ${process.env.REDIS_ENABLED === 'true' ? '✅ 启用' : '❌ 禁用'}`);
  logStdout(`  JWT 模式:        ${process.env.JWT_ENABLED === 'true' ? '✅ 启用' : '❌ 禁用'}`);
  logStdout(`  SMTP:            ${process.env.SMTP_SERVER ? '✅ 配置' : '❌ 未配置'}`);
  logStdout(`  OSS:             ${process.env.OSS_ACCESS_KEY_ID ? '✅ 配置' : '❌ 未配置'}`);
  printLine();
}

/**
 * 清理过期数据
 */
export async function cleanupExpiredData() {
  const { SessionToken, SessionLog, OauthCode } = getModels();
  const { Op } = await import('sequelize');

  logStdout('🧹 清理过期数据...\n');

  // 清理过期的 session token
  try {
    const expiredTokens = await SessionToken.destroy({
      where: {
        expires_at: { [Op.lt]: new Date() }
      }
    });
    printSuccess(`清理过期 Session Token: ${expiredTokens} 条`);
  } catch (err) {
    printError(`清理 Session Token 失败: ${err.message}`);
  }

  // 清理过期的授权码
  try {
    const expiredCodes = await OauthCode.destroy({
      where: {
        expires_at: { [Op.lt]: new Date() }
      }
    });
    printSuccess(`清理过期授权码: ${expiredCodes} 条`);
  } catch (err) {
    printError(`清理授权码失败: ${err.message}`);
  }

  // 清理 90 天前的 session 日志
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const oldLogs = await SessionLog.destroy({
      where: {
        created_at: { [Op.lt]: ninetyDaysAgo }
      }
    });
    printSuccess(`清理历史 Session 日志: ${oldLogs} 条`);
  } catch (err) {
    printError(`清理 Session 日志失败: ${err.message}`);
  }

  logStdout('\n🎉 清理完成');
}

/**
 * 格式化运行时间
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);

  return parts.join(' ');
}

/**
 * 格式化字节数
 */
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
