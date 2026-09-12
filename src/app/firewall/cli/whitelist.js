/**
 * 白名单管理命令
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { connectRedis, closeRedis } from '../../../../scripts/lib/redis.js';
import { printSuccess, printInfo, printError, printWarning } from '../../../../scripts/lib/table.js';
import { createRl, ask, closeRl } from '../../../../scripts/lib/input.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.cli.whitelist');

/**
 * 查看白名单
 */
export async function listWhitelist() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用');
    return;
  }

  try {
    const whitelist = await redis.smembers('fw:whitelist:ips');

    if (whitelist.length === 0) {
      printInfo('白名单为空');
      return;
    }

    log.stdout('\n✅ 白名单：');
    whitelist.forEach((ip, i) => {
      log.stdout(`  ${i + 1}. ${ip}`);
    });
    log.stdout(`\n共 ${whitelist.length} 个白名单 IP`);
  } finally {
    await closeRedis(redis);
  }
}

/**
 * 添加白名单
 */
export async function addWhitelist() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用');
    return;
  }

  const rl = createRl();
  try {
    const ip = await ask(rl, '✅ 请输入白名单 IP: ');
    if (!ip) {
      printError('IP 不能为空');
      return;
    }

    await redis.sadd('fw:whitelist:ips', ip);
    printSuccess(`已添加白名单: ${ip}`);
  } finally {
    closeRl(rl);
    await closeRedis(redis);
  }
}
