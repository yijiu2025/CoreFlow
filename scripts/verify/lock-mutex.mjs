/**
 * E1 跨进程互斥复验 —— 驱动进程
 *
 * 验证调度器分布式锁在**真实多进程**下的三条语义（不做单进程模拟）：
 *
 *   1. N 个进程同时抢同一把锁 → **恰好 1 个**成功；
 *   2. TTL 未过时，后续进程仍抢不到   → 锁没有被提前释放；
 *   3. TTL 过后，新进程能抢到         → 锁会自然过期，不会永久卡死。
 *
 * 第 2、3 轮缺任何一轮都会漏掉一种失败：只验第 1 轮，无法区分
 * 「锁正常工作」与「锁永远拿不到 / 拿到就不放」。
 *
 * 用法
 * ----
 *   npm run verify:lock
 *   PROBE_PROCS=10 npm run verify:lock      # 加大竞争进程数
 *
 * 退出码：0 通过 / 1 断言失败 / 3 环境不可用（详见同目录 README.md）
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { explainRedisEncodeErrors } from './lib/redis-debug.mjs';

// 父子进程统一切库，避免碰到 db0 里的真实键
const PROBE_REDIS_DB = process.env.PROBE_REDIS_DB || '15';
process.env.REDIS_DB = PROBE_REDIS_DB;

const DIR = path.dirname(fileURLToPath(import.meta.url));
/* 让编码错误带上命令名（排障辅助，见 lib/redis-debug.mjs） */
explainRedisEncodeErrors();
const ROOT = path.resolve(DIR, '..', '..');
const CHILD = path.join(DIR, 'lock-mutex-child.mjs');

// 要指向另一套环境时，用这个开关换掉整份 env 文件（原因见下方 loadEnvFile 处）
const ENV_FILE = process.env.VERIFY_ENV_FILE || '.env';

const N = Math.max(2, Number(process.env.PROBE_PROCS || 5));
const TTL_MS = Number(process.env.PROBE_TTL_MS || 3000);
const TASK_KEY = `verify-e1-${Date.now()}`;
const CHILD_TIMEOUT_MS = 20000;
const DRIFT_WARN_MS = 500;
const PREFLIGHT_MS = Number(process.env.PROBE_PREFLIGHT_MS || 8000);

const EXIT_PASS = 0;
const EXIT_ASSERT = 1;
const EXIT_ENV = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 自己加载 env 文件，而不用 `node --env-file`。原因有两条，缺一都会让关卡"无法指向另一套环境"：
//   1. `--env-file` 的取值**不会被命令行环境变量覆盖**（进程环境变量优先，见 Node 语义）；
//   2. `npm run` 会把命令行上的变量**丢掉**（实测 PROBE_PROCS=3 npm run → 仍是默认 5）。
// 改用 process.loadEnvFile 后，已存在的进程环境变量优先，于是下面两种覆盖都能生效：
//   VERIFY_ENV_FILE=.env.staging node scripts/verify/lock-mutex.mjs
//   REDIS_HOST=10.0.0.5          node scripts/verify/lock-mutex.mjs
// ⚠️ 覆盖时**必须直接跑 node**，经 `npm run` 传的变量到不了脚本里。
try {
  process.loadEnvFile(ENV_FILE);
} catch (err) {
  console.error(`⛔ 环境不可用：无法加载 env 文件 ${ENV_FILE} —— ${err.message}`);
  console.error('   默认读 .env；换环境用 VERIFY_ENV_FILE=<文件> 并直接跑 node。退出码 3。');
  process.exit(EXIT_ENV);
}

// 连接工具提到顶层：前置检查、PTTL 断言、退出清理三处都要用。
// 放在块级作用域里会被挡住（`const` 不外泄），表现为后面"未定义"而非"连不上"。
const { connectStandalone, disconnectStandalone, getStore } = await import('../../src/framework/redis/index.js');

// ── 前置检查：环境不可用要和断言失败分开，否则关卡会因环境问题长期变红 ──
{
  // 有界前置检查（2026-09-20 起由 connectStandalone 自身保证）：
  // 它先做有界 TCP 预检、再以 'bounded' 重连策略 + 外层超时连接，
  // 环境不可用时数秒内返回 ready:false，不再挂进客户端永不放弃的重连循环。
  // 这里额外保留一层 Promise.race 作为兜底：即便将来连接实现回退，
  // 「环境问题应在数秒内说清楚」这条不变量也不会破。
  const conn = await Promise.race([
    connectStandalone({ timeoutMs: PREFLIGHT_MS }),
    sleep(PREFLIGHT_MS + 2000).then(() => ({ ready: false, reason: `连接超时（${PREFLIGHT_MS}ms 内未就绪）` }))
  ]);

  if (!conn.ready) {
    console.error(`⛔ 环境不可用：Redis 连接失败 —— ${conn.reason}`);
    console.error(
      `   目标 ${process.env.REDIS_HOST || '(未配置)'}:${process.env.REDIS_PORT || 6379} (db${PROBE_REDIS_DB})`
    );
    console.error('   本关卡验证的是代码语义，不是给你排查环境问题的。退出码 3。');
    process.exit(EXIT_ENV);
  }
  // ⚠️ 这里**不能**断开：后面要用同一个连接读 `PTTL scheduler:<key>` 断言派生的锁 TTL。
  //    断连后 getStore() 仍然 isRedisConfigured()=true 但没有客户端，直接抛
  //    RedisRequiredError(503)，表现成"关卡断言失败"，实际是关卡自己掐了连接。
  //    统一在退出前 disconnectStandalone()。
}

/**
 * 拉起一个子进程并解析它的一行结果
 *
 * 加了硬超时：Redis 卡住时子进程会静默挂着，没有超时的话关卡会**永不返回**
 * —— 一个会挂死的关卡比没有关卡更糟。
 *
 * @param {number} at 统一的起跑时刻（epoch ms）
 * @param {string} label 标签，用于汇总时指认是哪个竞争者
 * @param {object} [opts]
 * @param {'period'|'lock'} [opts.mode='period'] 抢锁方式（见 lock-mutex-child.mjs 的说明）
 * @param {string} [opts.taskKey=TASK_KEY] 锁名（第 3/4 轮用独立的 key，避免复用 63s 的周期锁）
 */
function runChild(at, label, opts = {}) {
  const mode = opts.mode || 'period';
  const taskKey = opts.taskKey || TASK_KEY;
  return new Promise(resolve => {
    // 不再传 `--env-file`：父进程已把 env 加载进 process.env，子进程直接继承即可。
    const p = spawn(process.execPath, [CHILD], {
      cwd: ROOT,
      env: {
        ...process.env,
        PROBE_TASK_KEY: taskKey,
        PROBE_MODE: mode,
        PROBE_TTL_MS: String(TTL_MS),
        PROBE_AT: String(at),
        PROBE_LABEL: label,
        PROBE_REDIS_DB
      }
    });

    let out = '';
    let settled = false;
    const finish = r => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      try {
        p.kill();
      } catch {
        /* 进程可能已退出 */
      }
      finish({ label, ok: null, raw: `超时 ${CHILD_TIMEOUT_MS}ms 未退出` });
    }, CHILD_TIMEOUT_MS);

    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (out += d));
    p.on('error', e => finish({ label, ok: null, raw: `spawn 失败：${e.message}` }));
    p.on('close', () => {
      const m = /RESULT (\S+) (true|false)\s+起跑偏差(\d+)ms/.exec(out);
      if (m) return finish({ label: m[1], ok: m[2] === 'true', drift: Number(m[3]) });
      const tail = out.trim().split('\n').filter(Boolean).slice(-2).join(' | ') || '无输出';
      finish({ label, ok: null, raw: tail });
    });
  });
}

console.log('═══ E1 跨进程互斥复验 ═══');
console.log(`锁 key : lock:scheduler:${TASK_KEY}`);
console.log(`周期   : ${TTL_MS}ms（调度器派生锁 TTL ≥ 2 倍周期；原始锁 TTL 见第 3/4 轮）`);
console.log(`Redis  : ${process.env.REDIS_HOST || '(未配置)'}:${process.env.REDIS_PORT || 6379} (db${PROBE_REDIS_DB})`);
console.log(`竞争者 : ${N} 个独立进程\n`);

// ── 第 1 轮：N 个进程在同一时刻抢锁 ──
// 留 2.5s 给子进程完成 node 冷启动 + 模块加载，否则它们会晚于起跑线到达
const startAt = Date.now() + 2500;
console.log(`第 1 轮：${N} 个进程在同一时刻抢锁…`);
const r1 = await Promise.all(Array.from({ length: N }, (_, i) => runChild(startAt, `r1-p${i + 1}`)));
r1.forEach(r =>
  console.log(`   ${r.label.padEnd(8)} ${r.ok === null ? `⚠️  ${r.raw}` : r.ok ? '✅ 抢到' : '⛔ 未抢到'}`)
);

const winners1 = r1.filter(r => r.ok === true);
const errors = r1.filter(r => r.ok === null);
const drifts = r1.map(r => r.drift).filter(Number.isFinite);
const maxDrift = drifts.length ? Math.max(...drifts) : null;
const pass1 = winners1.length === 1 && errors.length === 0;

// 起跑偏差是**实验有效性**的指标：偏得太多就不算"同时"竞争，
// 「恰好 1 个成功」就可能是弱证据。但要警告而不是失败 —— 因时序抖动而变红的关卡没人会看。
if (maxDrift !== null && maxDrift > DRIFT_WARN_MS) {
  console.log(`   ⚠️  最大起跑偏差 ${maxDrift}ms（> ${DRIFT_WARN_MS}ms）—— 本轮"同时抢"的强度被削弱，结论偏弱`);
}

// ── 派生 TTL：任务周期 → 锁 TTL 必须留出余量 ──
// 回归守卫：调度器曾把锁 TTL 取成"等于任务周期"，任务跑超周期时锁就过期，
// 其他实例并发执行同一任务（重复执行）。现在派生规则是 max(2×周期, 周期+60s)。
// 这条断言同时也是本关卡第 3 轮的前置：不先证明"TTL 被放大"，第 3 轮等 TTL_MS 就等不到。
// 真实键名 = `lock:`（lock-store.js 的 LOCK_PREFIX）+ 传入的 name。
// 少写这一层前缀时 PTTL 返回 -2（键不存在），看起来像"锁没建起来"。
const lockKey = `lock:scheduler:${TASK_KEY}`;
// 🔴 `store.call()` 的签名是 (fn, timeout)，不是 (command, ...args)：
//    fn 会收到**裸客户端**，命令由调用方自己发。写成 `call('PTTL', key)` 会得到
//    `TypeError: fn is not a function` —— 而 MapStore 版恰好对任何入参都抛
//    "无 Redis 客户端"，所以单测覆盖不到这个错法。
const pttl = await getStore('verify-e1').call(client => client.pTTL(lockKey));
const derivedTtlOk = typeof pttl === 'number' && pttl >= TTL_MS * 2;
console.log('');
console.log(
  `派生锁 TTL（周期 ${TTL_MS}ms）  ${derivedTtlOk ? `✅ ${pttl}ms（≥ 2×周期）` : `❌ ${pttl}ms —— 不足 2 倍周期，任务跑超周期会重复执行`}`
);

// ── 第 2 轮：TTL 未过，单进程再抢（应当失败）──
await sleep(300);
const r2 = await runChild(Date.now() + 400, 'r2-solo');
const pass2 = r2.ok === false;

// ── 第 3/4 轮：原始锁的过期语义（独立 key，TTL 精确 = TTL_MS）──
// 这两轮刻意**不走** acquirePeriodLock：那个路径会把 TTL 放大到 ≥60s，
// 拿它验"到期可重抢"要么等一分钟、要么得出"锁泄漏"的假结论。
// 要验的是"锁本身不会永久卡死"，那是 lock-store 的属性，用 createLock 直连才对得上。
const TTL_KEY = `verify-e1-ttl-${Date.now()}`;
const r3 = await runChild(Date.now() + 300, 'r3-raw', { mode: 'lock', taskKey: TTL_KEY });
const pass3 = r3.ok === true;

await sleep(TTL_MS + 400);
const r4 = await runChild(Date.now() + 300, 'r4-after-ttl', { mode: 'lock', taskKey: TTL_KEY });
const pass4 = r4.ok === true;

console.log('');
console.log(`第 2 轮（TTL 内再抢）      ${pass2 ? '✅ 未抢到，符合预期' : '❌ 抢到了 → 锁被提前释放'}`);
console.log(`第 3 轮（原始锁首次抢）    ${pass3 ? '✅ 抢到' : '❌ 空锁都抢不到 → 锁实现坏了'}`);
console.log(`第 4 轮（TTL 过期后重抢）  ${pass4 ? '✅ 抢到，锁会自然过期' : '❌ 仍未抢到 → 锁泄漏了'}`);
console.log('');
console.log(
  `第 1 轮竞争者 ${N} 个，成功 ${winners1.length} 个 → ${pass1 ? '✅ 恰好 1 个（互斥成立）' : '❌ 互斥不成立'}`
);

const allPass = pass1 && pass2 && pass3 && pass4 && derivedTtlOk;
console.log(allPass ? '\n═══ E1 跨进程互斥复验：全部通过 ═══' : '\n═══ E1 复验：存在失败项 ═══');

// 退出前断开：保留的连接会让进程挂住不退出
await disconnectStandalone();
process.exit(allPass ? EXIT_PASS : EXIT_ASSERT);
