/**
 * 防火墙状态查看
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { connectRedis, closeRedis } from '../../../../scripts/lib/redis.js';
import { printError, printWarning, printLine } from '../../../../scripts/lib/table.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.cli.status');

/**
 * 查看防火墙状态
 */
export async function status() {
  const redis = await connectRedis();

  log.stdout('\n🛡️ 防火墙状态：');
  printLine();

  if (redis) {
    try {
      const blockedIps = await redis.hgetall('fw:blocked:ips');
      const blockedFps = await redis.hgetall('fw:blocked:fps');
      const whitelistIps = await redis.smembers('fw:whitelist:ips');

      log.stdout(`  Redis 连接:   ✅ 正常`);
      log.stdout(`  封禁 IP 数:   ${Object.keys(blockedIps).length}`);
      log.stdout(`  封禁指纹数:   ${Object.keys(blockedFps).length}`);
      log.stdout(`  白名单 IP 数: ${whitelistIps.length}`);
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
