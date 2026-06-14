/**
 * 防火墙状态查看
 */
import { connectRedis, closeRedis } from '../../../../scripts/lib/redis.js';
import { printError, printWarning, printLine } from '../../../../scripts/lib/table.js';

/**
 * 查看防火墙状态
 */
export async function status() {
  const redis = await connectRedis();

  console.log('\n🛡️ 防火墙状态：');
  printLine();

  if (redis) {
    try {
      const blockedIps = await redis.hgetall('fw:blocked:ips');
      const blockedFps = await redis.hgetall('fw:blocked:fps');
      const whitelistIps = await redis.smembers('fw:whitelist:ips');

      console.log(`  Redis 连接:   ✅ 正常`);
      console.log(`  封禁 IP 数:   ${Object.keys(blockedIps).length}`);
      console.log(`  封禁指纹数:   ${Object.keys(blockedFps).length}`);
      console.log(`  白名单 IP 数: ${whitelistIps.length}`);
    } catch (err) {
      printError(`Redis 查询失败: ${err.message}`);
    } finally {
      await closeRedis(redis);
    }
  } else {
    printWarning('Redis 未启用，防火墙功能受限');
  }

  printLine();
}
