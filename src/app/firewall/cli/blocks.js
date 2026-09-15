/**
 * 封禁管理命令
 *
 * 存储一致性：封禁数据有两份真相 ——
 *   1. Redis（`fw:block:{ip}` + `fw:blocked:ips` 索引），由 `util/redis.js` 访问层维护，运行时生效；
 *   2. 配置文件 `data/firewall_config.json` 的 `defense.manualBlacklistIps`，重启后重放 + Redis 不可用时兜底。
 * 因此「封禁」= 写 Redis + 写配置文件，「解封」= 清两份。只写一份就会出现
 * 「面板里解了、CLI 里还在」或「重启后封禁复活」这类不一致。
 *
 * 注意：使用 DAO 的写接口前必须调用 `initDao()` 把配置读进内存，否则内存里是
 * `DEFAULT_SECURITY_SETTINGS`，`triggerSave()` 会拿默认值**覆盖**线上配置文件（数据丢失）。
 * 配置落盘是 1s 防抖，本文件不调用 `process.exit()`，由 Node 等待定时器自然 flush。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import {
  printTable,
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
import { getActiveBlocks, setBlock, removeBlock as removeBlockEntry } from '../dao/block-manager.js';
import { addToBlacklist, removeFromBlacklist, initDao } from '../dao/dao.js';
import { removeKeys, rel } from '../util/redis.js';
import { withFirewallRedis } from './redis-boot.js';

/**
 * 格式化剩余时长
 *
 * @param {number|null} seconds 剩余秒数（永久条目为 null）
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
 * 查看封禁列表
 */
async function listBlocks() {
  const blocks = await withFirewallRedis(() => getActiveBlocks());
  if (!blocks) return;

  if (blocks.length === 0) {
    printInfo('当前没有生效的封禁记录');
    return;
  }

  logStdout('\n🚫 封禁列表：');
  printTable(
    ['类型', '目标', '状态', '来源', '剩余'],
    blocks.map(b => [
      b.type === 'ip' ? 'IP' : '指纹',
      b.type === 'ip' ? b.ip : b.fingerprint,
      b.status || 'BLOCKED',
      b.source || 'auto',
      formatRemaining(b.remainingSeconds)
    ])
  );
  logStdout(`\n共 ${blocks.length} 条封禁记录（含指纹维度）`);
}

/**
 * 添加封禁
 *
 * 交互输入：IP → 原因 → 时长（留空为永久）→ 确认
 */
async function addBlock() {
  initDao();

  const rl = createRl();
  try {
    const ip = (await ask(rl, '🚫 请输入要封禁的 IP: ')).trim();
    if (!ip) {
      printError('IP 不能为空');
      return;
    }

    const reason = (await ask(rl, '📝 封禁原因（可选）: ')).trim() || '手动封禁';

    const durationInput = (await ask(rl, '⏱️  封禁时长（秒，留空=永久）: ')).trim();
    let duration = null;
    if (durationInput) {
      duration = Number(durationInput);
      if (!Number.isInteger(duration) || duration < 1) {
        printError('封禁时长必须是正整数秒');
        return;
      }
    }

    const permanent = duration === null;
    const ok = await confirm(rl, `确认${permanent ? '永久' : `封禁 ${formatRemaining(duration)}`}封禁 IP: ${ip}？`);
    if (!ok) {
      printWarning('操作已取消');
      return;
    }

    const now = Date.now();
    const done = await withFirewallRedis(async () => {
      await setBlock(ip, {
        status: 'BLOCKED',
        source: 'manual',
        permanent,
        createdAt: now,
        expiresAt: permanent ? null : now + duration * 1000,
        reason
      });
      // 持久化到配置文件：重启重放 + Redis 不可用时由 checkGlobalBlock 兜底
      addToBlacklist('ip', ip);
      return true;
    });
    if (!done) return;

    printSuccess(`已${permanent ? '永久' : `封禁 ${formatRemaining(duration)}`}封禁 IP: ${ip}`);
  } finally {
    closeRl(rl);
  }
}

/**
 * 解除封禁
 *
 * 只能解除 IP 维度；指纹封禁请在管理面板按指纹解除。
 */
async function removeBlock() {
  initDao();

  const blocks = await withFirewallRedis(() => getActiveBlocks());
  if (!blocks) return;

  const ips = blocks.filter(b => b.type === 'ip').map(b => b.ip);
  if (ips.length === 0) {
    printInfo('当前没有封禁的 IP');
    return;
  }

  logStdout('\n当前封禁的 IP：');
  ips.forEach((ip, i) => {
    logStdout(`  ${i + 1}. ${ip}`);
  });

  const rl = createRl();
  try {
    const input = (await ask(rl, '\n请输入要解除的序号或 IP: ')).trim();

    let targetIp;
    const index = parseInt(input, 10);
    if (!isNaN(index) && index >= 1 && index <= ips.length) {
      targetIp = ips[index - 1];
    } else {
      targetIp = input;
    }

    if (!ips.includes(targetIp)) {
      printError(`IP ${targetIp} 不在封禁列表中`);
      return;
    }

    const ok = await confirm(rl, `确认解除封禁: ${targetIp}？`);
    if (!ok) {
      printWarning('操作已取消');
      return;
    }

    const done = await withFirewallRedis(async () => {
      await removeBlockEntry(targetIp);
      removeFromBlacklist('ip', targetIp);
      // 顺带清掉该 IP 的暴力破解计数，避免解封后计数仍处于「已超限」而立刻又被挑战。
      // ⚠️ 这里**只能清 IP 维度的键**：账号锁定键是 `lock:<username>`（见 rel.accountLock），
      // 用 IP 去拼这个键得到的是 `lock:<ip>`，永远不命中 —— 旧实现正是如此，属静默空操作。
      // 账号锁定需要按用户名解除（`fw blocks unlock-user <username>` 或等其自然过期）。
      await removeKeys([rel.bruteIp(targetIp)]);
      return true;
    });
    if (!done) return;

    printSuccess(`已解除封禁: ${targetIp}`);
  } finally {
    closeRl(rl);
  }
}

export { listBlocks, addBlock, removeBlock };
