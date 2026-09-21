/**
 * 关卡：遥测统计跨实例汇聚 —— 写入端（子进程）
 *
 * 扮演「另一个实例」：产生 3 条访问记录并刷写进 Redis 汇聚。
 * 父进程随后读取聚合值，断言能看到这 3 条 —— 这才能证明「统计不再是进程内切片」。
 *
 * 协议行：
 *   PUSHED <n>       已写入 n 条并完成刷写
 *   ENV_UNAVAILABLE  Redis 不可用
 */
process.loadEnvFile(process.env.VERIFY_ENV_FILE || '.env');
// ⚠️ 必须在 loadEnvFile 之后：env 文件里的取值不会被进程环境变量覆盖，
// 反过来才是我们要的（进程环境变量优先）。
process.env.REDIS_DB = process.env.PROBE_REDIS_DB || '15';
process.env.FW_TRAFFIC_STATS_FILE = process.env.PROBE_CHILD_STATS_FILE || '.tmp-probe/stats-child.json';

const { connectStandalone, disconnectStandalone } = await import('../../src/framework/redis/index.js');

const conn = await connectStandalone({ timeoutMs: 8000 });
if (!conn.ready) {
  console.log(`ENV_UNAVAILABLE ${conn.reason}`);
  process.exit(3);
}

const store = await import('../../src/app/firewall/data/store.js');

const COUNT = 3;
for (let i = 0; i < COUNT; i++) {
  store.pushRecord({
    url: '/from-child',
    ip: `198.51.100.${10 + i}`,
    region: 'CN',
    city: '测试市',
    blocked: false,
    __probe: 'child'
  });
}

// 立即刷写，不等 3s 的统计刷写周期（STATS_FLUSH_INTERVAL）
//
// ⚠️ 这里必须驱动的是**跨实例汇聚**（写 Redis），不是本地 JSON 持久化。
//    此前误用了 `__test__persistNow()`：它写的是 FW_TRAFFIC_STATS_FILE 那个文件，
//    对"父进程能不能看到"毫无贡献，而本关卡的全部意义就在于跨进程可见性。
//    更隐蔽的是子进程紧随其后就 exit，3s 刷写周期永远等不到 ——
//    父进程读到的自然只有它自己那 2 条。
//    本机无 Redis 时关卡以退出码 3 提前结束，所以这个错一直没被暴露，
//    直到第一次在真 Redis 上跑（2026-09-21 CI）。
await store.__test__flushStats();
store.__test__stopStatsFlushTimer();
store.stopPersistTimer();

console.log(`PUSHED ${COUNT}`);
await disconnectStandalone();
process.exit(0);
