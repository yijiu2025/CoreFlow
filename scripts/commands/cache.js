/**
 * 缓存管理命令模块
 */
import { connectRedis, closeRedis, getRedisInfo } from '../lib/redis.js';
import {
  createRl,
  confirm,
  closeRl,
  printSuccess,
  printInfo,
  printWarning,
  printLine
} from '../../src/framework/cli/index.js';
import { logStdout } from '../../src/framework/log/index.js';

/**
 * 查看 Redis 状态
 */
export async function redisStatus() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用或连接失败');
    return;
  }

  try {
    const info = await getRedisInfo(redis);

    logStdout('\n🔴 Redis 状态：');
    printLine();
    logStdout(`  版本:       ${info.version || '未知'}`);
    logStdout(`  运行时间:   ${formatUptime(info.uptime)}`);
    logStdout(`  连接数:     ${info.connectedClients || '未知'}`);
    logStdout(`  内存使用:   ${info.usedMemory || '未知'}`);
    logStdout(`  内存峰值:   ${info.usedMemoryPeak || '未知'}`);
    logStdout(`  总键数:     ${info.totalKeys}`);
    printLine();
  } finally {
    await closeRedis(redis);
  }
}

/**
 * 清除所有 session
 */
export async function clearAllSessions() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用');
    return;
  }

  try {
    const keys = await redis.keys('session:*');
    if (keys.length === 0) {
      printInfo('没有 session 数据');
      return;
    }

    const rl = createRl();
    try {
      printWarning(`即将清除 ${keys.length} 个 session`);
      const ok = await confirm(rl, '确认清除？');
      if (!ok) {
        printWarning('操作已取消');
        return;
      }
    } finally {
      closeRl(rl);
    }

    await redis.del(keys);
    printSuccess(`已清除 ${keys.length} 个 session`);
  } finally {
    await closeRedis(redis);
  }
}

/**
 * 清除指定模式的缓存
 */
export async function clearCacheByPattern() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用');
    return;
  }

  try {
    const rl = createRl();
    try {
      logStdout('\n常用模式：');
      logStdout('  session:*    - 所有 session');
      logStdout('  perm:*       - 所有权限缓存');
      logStdout('  rate:*       - 所有限频计数');
      logStdout('  fw:*         - 所有防火墙数据');
      logStdout('  *            - 所有数据（危险！）');

      const pattern = await rl.question('\n请输入要清除的 key 模式: ');
      if (!pattern) {
        printWarning('操作已取消');
        return;
      }

      // 先统计数量
      const keys = await redis.keys(pattern);
      if (keys.length === 0) {
        printInfo('没有匹配的 key');
        return;
      }

      printWarning(`匹配到 ${keys.length} 个 key`);
      const ok = await confirm(rl, '确认清除？');
      if (!ok) {
        printWarning('操作已取消');
        return;
      }

      await redis.del(keys);
      printSuccess(`已清除 ${keys.length} 个 key`);
    } finally {
      closeRl(rl);
    }
  } finally {
    await closeRedis(redis);
  }
}

/**
 * 查看 Redis key 列表
 */
export async function listRedisKeys() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用');
    return;
  }

  try {
    const rl = createRl();
    try {
      const pattern = (await rl.question('请输入 key 模例（留空显示全部）: ')) || '*';
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        printInfo('没有匹配的 key');
        return;
      }

      logStdout(`\n🔑 Key 列表 (共 ${keys.length} 个):`);
      printLine();

      // 只显示前 100 个
      const displayKeys = keys.slice(0, 100);
      displayKeys.forEach((key, i) => {
        logStdout(`  ${i + 1}. ${key}`);
      });

      if (keys.length > 100) {
        printInfo(`... 还有 ${keys.length - 100} 个 key`);
      }
    } finally {
      closeRl(rl);
    }
  } finally {
    await closeRedis(redis);
  }
}

/**
 * 格式化运行时间
 * @param {string} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  if (!seconds) return '未知';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);

  return parts.join(' ') || '刚刚启动';
}
