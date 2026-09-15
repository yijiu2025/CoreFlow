/**
 * 防火墙运行统计
 *
 * 历史问题：本命令过去读 `fw:stats:daily:*` / `fw:stats:top_ip:*`，但全仓**没有任何地方写入**
 * 这两个 key（迁移到 hash 索引时被一并丢弃），因此命令恒显示 0，是纯装饰。
 *
 * 现在改为**从真实存在的 key 空间统计**：封禁/白名单取 DAO 的活跃列表，
 * 限流窗口、404 陷阱、登录失败、账号锁定、挑战令牌各用一次 SCAN 计数。
 * 这些 key 就是运行时的真实状态，不需要为了统计在请求路径上额外写计数
 * （那会增加每请求的 Redis 往返，与本轮的优化目标相反）。
 *
 * SCAN 有 O(N) 成本，但只在 CLI 手动执行时发生，不落在请求路径上。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { printLine } from '../../../framework/cli/index.js';
import { logStdout } from '../../../framework/log/index.js';
import { getActiveBlocks, getActiveWhitelist } from '../dao/block-manager.js';
import { scanKeys } from '../util/redis.js';
import { withFirewallRedis } from './redis-boot.js';

/**
 * 统计各类运行时 key 数量
 *
 * @returns {Promise<object>} 各类计数
 */
async function collectCounts() {
  const [blocks, whitelist, rateWindows, traps, bruteIps, bruteUsers, locks, passes, passFps] = await Promise.all([
    getActiveBlocks(),
    getActiveWhitelist(),
    scanKeys('rl:*'),
    scanKeys('trap:*'),
    scanKeys('brute:ip:*'),
    scanKeys('brute:user:*'),
    scanKeys('lock:*'),
    scanKeys('pass:*'),
    scanKeys('pass:fp:*')
  ]);

  const ipBlocks = blocks.filter(b => b.type === 'ip');
  const fpBlocks = blocks.filter(b => b.type === 'fingerprint');

  return {
    ipBlocks,
    fpBlocks,
    whitelist,
    rateWindows: rateWindows.length,
    traps: traps.length,
    bruteIps: bruteIps.length,
    bruteUsers: bruteUsers.length,
    locks: locks.length,
    // ⚠️ `pass:*` 的前缀天然覆盖 `pass:fp:*`，直接用 passes.length 会把指纹维度的令牌
    // 重复计入总数（展示成"共 N 条"但其实只有 N-M 个 IP 令牌）。这里减去指纹维度，
    // 得到真正的 IP 维度计数；两个数字相加才是总数。
    passes: passes.length - passFps.length,
    passFps: passFps.length
  };
}

/**
 * 流量统计（实际为「防火墙运行状态统计」）
 */
async function trafficStats() {
  const stats = await withFirewallRedis(collectCounts);
  if (!stats) return;

  logStdout('\n📊 防火墙运行统计：');
  printLine();

  logStdout('  封禁');
  logStdout(
    `    封禁中 IP:              ${stats.ipBlocks.length}（永久 ${stats.ipBlocks.filter(b => b.permanent).length}）`
  );
  logStdout(
    `    封禁中 指纹:            ${stats.fpBlocks.length}（永久 ${stats.fpBlocks.filter(b => b.permanent).length}）`
  );
  logStdout('  白名单');
  logStdout(`    白名单 IP:              ${stats.whitelist.filter(e => e.type === 'ip').length}`);
  logStdout(`    白名单 指纹:            ${stats.whitelist.filter(e => e.type === 'fingerprint').length}`);
  logStdout('  检测器运行时状态');
  logStdout(`    限流窗口 (rl:*):        ${stats.rateWindows}`);
  logStdout(`    404 陷阱计数 (trap:*):  ${stats.traps}`);
  logStdout(`    登录失败·按 IP:         ${stats.bruteIps}`);
  logStdout(`    登录失败·按账号:        ${stats.bruteUsers}`);
  logStdout(`    账号锁定 (lock:*):      ${stats.locks}`);
  logStdout(
    `    挑战令牌 (pass:*):      IP 维度 ${stats.passes} + 指纹维度 ${stats.passFps} = ${stats.passes + stats.passFps}`
  );

  printLine();
}

export { trafficStats };
