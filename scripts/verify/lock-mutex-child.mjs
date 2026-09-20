/**
 * E1 跨进程互斥复验 —— 子进程
 *
 * 由 `lock-mutex.mjs` 拉起，**不要单独运行**（缺少 PROBE_* 环境变量）。
 *
 * 职责只有一个：在统一的起跑时刻，与兄弟进程同时抢同一把锁，
 * 然后向 stdout 打印一行 `RESULT <label> <true|false>`，交由父进程汇总判定。
 * 父进程之所以不自己抢，是因为「互斥」只有在**不同进程**之间才有意义。
 *
 * 隔离：切到 `REDIS_DB=15`（默认），不污染 db0 里的真实键。
 * 该变量由 `framework/redis/plugin.js:249` 读取并作为连接的 database 选项。
 *
 * 输出协议：`RESULT <label> <acquired> 起跑偏差Nms 判定耗时Nms`
 */

const REDIS_DB = process.env.PROBE_REDIS_DB || '15';
process.env.REDIS_DB = REDIS_DB;

const TASK_KEY = process.env.PROBE_TASK_KEY;
const TTL_MS = Number(process.env.PROBE_TTL_MS);
const AT_EPOCH = Number(process.env.PROBE_AT);
const LABEL = process.env.PROBE_LABEL || 'child';

if (!TASK_KEY || !Number.isFinite(TTL_MS) || !Number.isFinite(AT_EPOCH)) {
  console.log(`RESULT ${LABEL} ERROR missing_env（本文件应由 lock-mutex.mjs 拉起）`);
  process.exit(2);
}

const { connectStandalone, disconnectStandalone } = await import('../../src/framework/redis/index.js');
const { acquirePeriodLock } = await import('../../src/framework/scheduler/index.js');

const conn = await connectStandalone({ timeoutMs: 8000 });
if (!conn.ready) {
  console.log(`RESULT ${LABEL} ERROR connect_failed:${conn.reason}`);
  process.exit(3);
}

// 忙等到统一的起跑线，尽量让各进程落在同一瞬间竞争。
// 这是**刻意的**忙等：setTimeout 的定时精度不足以让 5 个进程同时出发，
// 而本实验的有效性正取决于它们真的撞在一起。
while (Date.now() < AT_EPOCH) {
  /* spin */
}

const t0 = Date.now();
const acquired = await acquirePeriodLock(TASK_KEY, TTL_MS);
const drift = Math.max(0, t0 - AT_EPOCH);

console.log(`RESULT ${LABEL} ${acquired} 起跑偏差${drift}ms 判定耗时${Date.now() - t0}ms`);

await disconnectStandalone();
process.exit(0);
