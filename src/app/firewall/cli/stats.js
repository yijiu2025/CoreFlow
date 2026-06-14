/**
 * 流量统计命令
 */
import { connectRedis, closeRedis } from '../../../../scripts/lib/redis.js';
import { printWarning, printLine } from '../../../../scripts/lib/table.js';

/**
 * 流量统计
 */
export async function trafficStats() {
  const redis = await connectRedis();
  if (!redis) {
    printWarning('Redis 未启用');
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = `fw:stats:daily:${today}`;
    const stats = await redis.hgetall(dailyKey);

    console.log('\n📊 今日流量统计：');
    printLine();
    console.log(`  总请求数:     ${stats.total || 0}`);
    console.log(`  拦截数:       ${stats.blocked || 0}`);
    console.log(`  挑战数:       ${stats.challenged || 0}`);
    console.log(`  Bot 检测:     ${stats.bot || 0}`);
    printLine();

    const topIpKey = `fw:stats:top_ip:${today}`;
    const topIps = await redis.zrevrange(topIpKey, 0, 9, 'WITHSCORES');

    if (topIps.length > 0) {
      console.log('\n🔝 Top 10 IP:');
      for (let i = 0; i < topIps.length; i += 2) {
        console.log(`  ${Math.floor(i / 2) + 1}. ${topIps[i].padEnd(20)} ${topIps[i + 1]} 次`);
      }
    }
  } finally {
    await closeRedis(redis);
  }
}
