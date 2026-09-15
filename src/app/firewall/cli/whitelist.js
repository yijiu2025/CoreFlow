/**
 * 白名单管理命令
 *
 * 与封禁同构：白名单也有两份真相 ——
 *   1. Redis（`fw:whitelist:{ip}` + `fw:whitelisted:ips` 索引），运行时生效，白名单优先级最高；
 *   2. 配置文件 `data/firewall_config.json` 的 `defense.manualWhitelistIps`，重启重放。
 * 因此增删都走 DAO（`addToWhitelist` / `removeFromWhitelist`），它们已同时覆盖文件与 Redis，
 * 不要再额外调用 `setWhitelist`/`removeWhitelist` —— 那会变成同一份数据写两遍。
 *
 * 使用 DAO 写接口前必须 `initDao()`，否则内存里是默认配置，落盘会覆盖线上文件（详见 blocks.js 注释）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import {
  printSuccess,
  printInfo,
  printError,
  printWarning,
  createRl,
  ask,
  confirm,
  closeRl
} from '../../../framework/cli/index.js';
import { logStdout } from '../../../framework/log/index.js';
import { getActiveWhitelist } from '../dao/block-manager.js';
import { addToWhitelist, removeFromWhitelist, initDao } from '../dao/dao.js';
import { withFirewallRedis } from './redis-boot.js';

/** 默认白名单有效期（秒）—— 与访问层 `normalizeDuration` 的兜底值保持一致 */
const DEFAULT_WHITELIST_TTL = 86400;

/**
 * 格式化剩余时长
 *
 * @param {number|null} seconds 剩余秒数
 * @returns {string} 可读时长
 */
function formatRemaining(seconds) {
  if (seconds === null || seconds === undefined) return '永久';
  if (seconds <= 0) return '已过期';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天${h}小时`;
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${seconds % 60}秒`;
  return `${seconds}秒`;
}

/**
 * 查看白名单
 */
async function listWhitelist() {
  const entries = await withFirewallRedis(() => getActiveWhitelist());
  if (!entries) return;

  if (entries.length === 0) {
    printInfo('白名单为空');
    return;
  }

  logStdout('\n✅ 白名单：');
  entries.forEach((e, i) => {
    const target = e.type === 'ip' ? e.ip : e.fingerprint;
    logStdout(
      `  ${i + 1}. [${e.type === 'ip' ? 'IP' : '指纹'}] ${target}  剩余 ${formatRemaining(e.remainingSeconds)}`
    );
  });
  logStdout(`\n共 ${entries.length} 条白名单记录（含指纹维度）`);
}

/**
 * 添加白名单
 */
async function addWhitelist() {
  initDao();

  const rl = createRl();
  try {
    const ip = (await ask(rl, '✅ 请输入白名单 IP: ')).trim();
    if (!ip) {
      printError('IP 不能为空');
      return;
    }

    const input = (await ask(rl, `⏱️  有效期秒数（留空=${DEFAULT_WHITELIST_TTL}）: `)).trim();
    let duration = DEFAULT_WHITELIST_TTL;
    if (input) {
      duration = Number(input);
      if (!Number.isInteger(duration) || duration < 1) {
        printError('有效期必须是正整数秒');
        return;
      }
    }

    const done = await withFirewallRedis(async () => {
      // addToWhitelist 已同时写配置文件与 Redis，无需再调 setWhitelist
      await addToWhitelist(ip, duration);
      return true;
    });
    if (!done) return;

    printSuccess(`已添加白名单: ${ip}（${formatRemaining(duration)}）`);
  } finally {
    closeRl(rl);
  }
}

/**
 * 移除白名单
 */
async function removeWhitelist() {
  initDao();

  const entries = await withFirewallRedis(() => getActiveWhitelist());
  if (!entries) return;

  const ips = entries.filter(e => e.type === 'ip').map(e => e.ip);
  if (ips.length === 0) {
    printInfo('当前没有白名单 IP');
    return;
  }

  logStdout('\n当前白名单 IP：');
  ips.forEach((ip, i) => {
    logStdout(`  ${i + 1}. ${ip}`);
  });

  const rl = createRl();
  try {
    const input = (await ask(rl, '\n请输入要移除的序号或 IP: ')).trim();

    const index = parseInt(input, 10);
    const targetIp = !isNaN(index) && index >= 1 && index <= ips.length ? ips[index - 1] : input;

    if (!ips.includes(targetIp)) {
      printError(`IP ${targetIp} 不在白名单中`);
      return;
    }

    const ok = await confirm(rl, `确认移除白名单: ${targetIp}？`);
    if (!ok) {
      printWarning('操作已取消');
      return;
    }

    const done = await withFirewallRedis(async () => {
      // removeFromWhitelist 已同时处理配置文件与 Redis
      await removeFromWhitelist(targetIp);
      return true;
    });
    if (!done) return;

    printSuccess(`已移除白名单: ${targetIp}`);
  } finally {
    closeRl(rl);
  }
}

export { listWhitelist, addWhitelist, removeWhitelist };
