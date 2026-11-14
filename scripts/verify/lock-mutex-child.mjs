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
 * 该变量由 `framework/persistence/redis/plugin.js:249` 读取并作为连接的 database 选项。
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

const { connectStandalone, disconnectStandalone } = await import('../../src/framework/persistence/redis/index.js');
const { acquirePeriodLock } = await import('../../src/framework/lifecycle/scheduler/index.js');
const { createLock } = await import('../../src/framework/persistence/redis/lock-store.js');

/**
 * 抢锁方式（`PROBE_MODE`）
 *
 *   period —— 走真实调度器路径 `acquirePeriodLock()`，父进程给的是**任务周期**，
 *             实际锁 TTL 会被派生（≥ 2 倍周期）。第 1/2 轮用它，验中间件真实行为。
 *   lock   —— 直接用 `createLock(..., { ttl })`，TTL **精确等于**父进程给的值。
 *             第 3/4 轮用它验"锁本身会自然过期，不会永久卡死"这条原始语义。
 *
 * 为什么必须分开：调度器的 TTL 派生（周期 ×2 或 +60s）意味着拿一个 3s 的周期
 * 去等 3s 看锁过期**永远等不到**（实际 TTL 63s）。把两种语义塞进同一轮，
 * 关卡要么等 63s、要么得出"锁泄漏"的错误结论。实测 2026-10-30。
 */
const MODE = process.env.PROBE_MODE === 'lock' ? 'lock' : 'period';

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
/*
 * 周期序号取哪个时间点
 *
 * 默认用真实抢锁时刻（t0）。第 2 轮"TTL 内再抢应当失败"必须落回**第 1 轮那把锁**，
 * 而它可能在 3s 周期边界之后才跑到 —— 此时按 t0 算会得到**下一周期的另一把锁**，
 * 抢到是正常的，却会被判成"锁被提前释放"（2026-11-14 实际红过一次）。
 * 所以父进程可以显式指定 keyAt，复现同一把锁。
 */
const KEY_AT = Number.isFinite(Number(process.env.PROBE_KEY_AT)) && Number(process.env.PROBE_KEY_AT) > 0
  ? Number(process.env.PROBE_KEY_AT)
  : t0;
const acquired =
  MODE === 'lock'
    ? await createLock(`scheduler:${TASK_KEY}`, { ttl: TTL_MS }).tryAcquire()
    : // 把 KEY_AT 显式传进去：父进程要按**同一个周期序号**去读 PTTL / 判互斥，
      // 让两边用同一时间点算锁名，避免跨周期边界时读到不存在的键（PTTL = -2）
      await acquirePeriodLock(TASK_KEY, TTL_MS, KEY_AT);
const drift = Math.max(0, t0 - AT_EPOCH);

// 末尾的 at= 供父进程复现周期锁名（periodLockKey(taskKey, ttl, at)），不要删
console.log(`RESULT ${LABEL} ${acquired} 起跑偏差${drift}ms 判定耗时${Date.now() - t0}ms at=${KEY_AT}`);

await disconnectStandalone();
process.exit(0);
