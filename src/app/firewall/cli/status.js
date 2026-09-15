/**
 * 防火墙状态查看
 *
 * 与其他子命令不同，status 在 Redis 不可用时**仍然要给出可读输出**（配置文件里的手动名单
 * 就是 Redis 挂掉时的兜底依据），所以这里不走 `withFirewallRedis`，而是自己管理连接。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { printWarning, printLine } from '../../../framework/cli/index.js';
import { logStdout, createLogger } from '../../../framework/log/index.js';
import { connectStandalone, disconnectStandalone } from '../../../framework/redis/index.js';
import { getActiveBlocks, getActiveWhitelist } from '../dao/block-manager.js';
import { initDao, getSecuritySettings, getServerNode } from '../dao/dao.js';

const log = createLogger('app.firewall.cli.status');

/**
 * 查看防火墙状态
 */
async function status() {
  initDao();
  const defense = getSecuritySettings().defense || {};
  const node = getServerNode();

  logStdout('\n🛡️ 防火墙状态：');
  printLine();

  const { ready, reason } = await connectStandalone();
  if (!ready) {
    printWarning(`Redis 连接: 不可用（${reason}）`);
    printLine();
    printConfigSummary(defense, node);
    return;
  }

  try {
    const [blocks, whitelist] = await Promise.all([getActiveBlocks(), getActiveWhitelist()]);
    const ipBlocks = blocks.filter(b => b.type === 'ip');
    const fpBlocks = blocks.filter(b => b.type === 'fingerprint');
    const ipWhitelist = whitelist.filter(e => e.type === 'ip');
    const fpWhitelist = whitelist.filter(e => e.type === 'fingerprint');

    logStdout(`  Redis 连接:     ✅ 正常 (${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379})`);
    logStdout(`  封禁 IP 数:     ${ipBlocks.length}（永久 ${ipBlocks.filter(b => b.permanent).length}）`);
    logStdout(`  封禁指纹数:     ${fpBlocks.length}（永久 ${fpBlocks.filter(b => b.permanent).length}）`);
    logStdout(`  白名单 IP 数:   ${ipWhitelist.length}`);
    logStdout(`  白名单指纹数:   ${fpWhitelist.length}`);
  } catch (err) {
    printWarning(`Redis 查询失败: ${err.message}`);
  } finally {
    try {
      await disconnectStandalone();
    } catch (err) {
      log.warn('释放 Redis 连接失败', err);
    }
  }

  printLine();
  printConfigSummary(defense, node);
}

/**
 * 打印配置文件侧的手动名单与节点信息
 *
 * @param {object} defense 防御配置（manualBlacklistIps / manualWhitelistIps …）
 * @param {object} node 服务器节点信息
 */
function printConfigSummary(defense, node) {
  const blacklist = defense.manualBlacklistIps || [];
  const whitelist = defense.manualWhitelistIps || [];

  logStdout(`  手动黑名单 IP:  ${blacklist.length}  ← 配置文件，Redis 不可用时兜底`);
  logStdout(`  手动白名单 IP:  ${whitelist.length}  ← 配置文件，重启后重放`);

  if (node && node.ip) {
    const region = [node.country, node.region, node.city].filter(Boolean).join('/');
    logStdout(`  服务器节点:     ${node.ip} ${region}`);
  }
  printLine();
}

export { status };
