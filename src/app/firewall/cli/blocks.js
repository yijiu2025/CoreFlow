/**
 * 封禁管理命令
 */
import { connectRedis, closeRedis } from '../../../../scripts/lib/redis.js';
import { printTable, printSuccess, printInfo, printError, printWarning } from '../../../../scripts/lib/table.js';
import { createRl, ask, confirm, closeRl } from '../../../../scripts/lib/input.js';

/**
 * 查看封禁列表
 */
export async function listBlocks() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用');
    return;
  }

  try {
    const blockedIps = await redis.hgetall('fw:blocked:ips');
    const entries = Object.entries(blockedIps);

    if (entries.length === 0) {
      printInfo('当前没有封禁的 IP');
      return;
    }

    console.log('\n🚫 封禁列表：');
    printTable(
      ['IP', '封禁时间', '原因'],
      entries.map(([ip, data]) => {
        try {
          const info = JSON.parse(data);
          return [
            ip,
            new Date(info.timestamp).toLocaleString('zh-CN'),
            info.reason || '手动封禁'
          ];
        } catch {
          return [ip, '未知', '未知'];
        }
      })
    );
    console.log(`\n共 ${entries.length} 个封禁 IP`);
  } finally {
    await closeRedis(redis);
  }
}

/**
 * 添加封禁
 */
export async function addBlock() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用');
    return;
  }

  const rl = createRl();
  try {
    const ip = await ask(rl, '🚫 请输入要封禁的 IP: ');
    if (!ip) {
      printError('IP 不能为空');
      return;
    }

    const reason = await ask(rl, '📝 封禁原因（可选）: ') || '手动封禁';

    const ok = await confirm(rl, `确认封禁 IP: ${ip}？`);
    if (!ok) {
      printWarning('操作已取消');
      return;
    }

    await redis.hset('fw:blocked:ips', ip, JSON.stringify({
      timestamp: Date.now(),
      reason,
      source: 'manual'
    }));

    printSuccess(`已封禁 IP: ${ip}`);
  } finally {
    closeRl(rl);
    await closeRedis(redis);
  }
}

/**
 * 解除封禁
 */
export async function removeBlock() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用');
    return;
  }

  const rl = createRl();
  try {
    const blockedIps = await redis.hgetall('fw:blocked:ips');
    const ips = Object.keys(blockedIps);

    if (ips.length === 0) {
      printInfo('当前没有封禁的 IP');
      return;
    }

    console.log('\n当前封禁的 IP：');
    ips.forEach((ip, i) => {
      console.log(`  ${i + 1}. ${ip}`);
    });

    const input = await ask(rl, '\n请输入要解除的序号或 IP: ');

    let targetIp;
    const index = parseInt(input, 10);
    if (!isNaN(index) && index >= 1 && index <= ips.length) {
      targetIp = ips[index - 1];
    } else {
      targetIp = input;
    }

    if (!blockedIps[targetIp]) {
      printError(`IP ${targetIp} 不在封禁列表中`);
      return;
    }

    const ok = await confirm(rl, `确认解除封禁: ${targetIp}？`);
    if (!ok) {
      printWarning('操作已取消');
      return;
    }

    await redis.hdel('fw:blocked:ips', targetIp);
    printSuccess(`已解除封禁: ${targetIp}`);
  } finally {
    closeRl(rl);
    await closeRedis(redis);
  }
}
