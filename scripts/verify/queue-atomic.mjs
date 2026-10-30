/**
 * U12 队列/环形队列跨进程原子性复验 —— 驱动进程
 *
 * 这两类存储在 **Redis 后端**下把「头尾指针」当成可变共享状态存在 `prefix:meta` 里。
 * 只要指针的读改写在脚本外完成（哪怕只是一次进程内缓存），多实例下就会出现两种静默故障：
 *
 *   1. **指针倒退**：实例 A 在队列为空时读过 meta，把 `{head:0,tail:0}` 缓存下来；
 *      实例 B 随后 push 了 300 条；A 再消费时用缓存的 tail 判断"队列是空的"，
 *      顺手把 `{head:0,tail:0}` 写回去 —— 300 条消息还在 Redis 里，但指针永远走不到。
 *   2. **写入互相覆盖**：两个实例同时 push，各自按自己读到的 tail 落盘，后写覆盖先写；
 *      环形队列还会把 count 算错（实际 120 条、meta 说 60 条）。
 *
 * 单进程测试对这两条**恒真**：进程内缓存永远是最新的，指针也永远只有一个写者。
 * 所以这里必须真多进程 + 真 Redis。
 *
 * 三轮都不可省：
 *   第 1 轮只证明"别人的写入能被看见"，第 2 轮才证明并发消费不重不漏，
 *   第 3 轮覆盖环形队列的 head/tail/count 三元组（与 FIFO 的二元组不是同一套代码）。
 *
 * 用法
 * ----
 *   npm run verify:queue
 *   PROBE_CONSUME_PROCS=4 npm run verify:queue
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
const CHILD = path.join(DIR, 'queue-atomic-child.mjs');

const ENV_FILE = process.env.VERIFY_ENV_FILE || '.env';

const SEED = Number(process.env.PROBE_SEED || 300);
const CONSUMERS = Math.max(2, Number(process.env.PROBE_CONSUME_PROCS || 3));
const RING_MAX = Number(process.env.PROBE_RING_MAX || 100);
const RING_SEED = Math.max(2, Number(process.env.PROBE_RING_SEED || 60));
const CHILD_TIMEOUT_MS = Number(process.env.PROBE_CHILD_TIMEOUT_MS || 30000);
const PREFLIGHT_MS = Number(process.env.PROBE_PREFLIGHT_MS || 8000);
/** 给子进程留出 node 冷启动 + 模块加载的时间，否则"同时"只是字面意思 */
const START_LEAD_MS = 3000;

const RUN = `verify-u12-${Date.now()}`;
const PREFIX_FIFO = `${RUN}:fifo`;
const PREFIX_FIFO_CONCURRENT = `${RUN}:fifo-concurrent`;
const PREFIX_RING = `${RUN}:ring`;

const EXIT_PASS = 0;
const EXIT_ASSERT = 1;
const EXIT_ENV = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  process.loadEnvFile(ENV_FILE);
} catch (err) {
  console.error(`⛔ 环境不可用：无法加载 env 文件 ${ENV_FILE} —— ${err.message}`);
  console.error('   默认读 .env；换环境用 VERIFY_ENV_FILE=<文件> 并直接跑 node。退出码 3。');
  process.exit(EXIT_ENV);
}

const { connectStandalone, disconnectStandalone, createQueue, createRingQueue } = await import(
  '../../src/framework/redis/index.js'
);

{
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
  // 🔴 不要在这里断开：本关卡**由父进程自己**扮演写入者/读取者（第 1 轮的 producer、
  //    第 3 轮的 ring），它直接调用 createQueue/createRingQueue。断连会让 getStore()
  //    虽然 isRedisConfigured()=true 却拿不到客户端，一路抛 RedisRequiredError(503)——
  //    表现成"断言失败"，实际是关卡自己把连接掐了。连接保留到进程结束前统一关闭。
}

/**
 * 拉起一个子进程并解析它的 RESULT 行
 *
 * @param {object} spec
 * @param {'seed-fifo'|'drain-fifo'|'seed-ring'|'read-ring'} spec.mode
 * @param {string} spec.prefix 队列命名空间
 * @param {string} spec.label 汇总时指认用
 * @param {number} [spec.at] 统一起跑时刻
 * @param {number} [spec.count] push 条数
 * @param {number} [spec.max] 环形容量
 * @returns {Promise<{label: string, ids: string[]|null, raw: string}>}
 */
function runChild(spec) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [CHILD], {
      cwd: ROOT,
      env: {
        ...process.env,
        PROBE_MODE: spec.mode,
        PROBE_PREFIX: spec.prefix,
        PROBE_LABEL: spec.label,
        PROBE_AT: String(spec.at ?? 0),
        PROBE_COUNT: String(spec.count ?? 0),
        PROBE_MAX: String(spec.max ?? RING_MAX),
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
    // 硬超时：Redis 卡住时子进程会静默挂着，没有超时这个关卡会**永不返回**
    const timer = setTimeout(() => {
      try {
        p.kill();
      } catch {
        /* 进程可能已退出 */
      }
      finish({ label: spec.label, ids: null, raw: `超时 ${CHILD_TIMEOUT_MS}ms 未退出` });
    }, CHILD_TIMEOUT_MS);

    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (out += d));
    p.on('error', e => finish({ label: spec.label, ids: null, raw: `spawn 失败：${e.message}` }));
    p.on('close', () => {
      const m = /RESULT \S+ (\d+)\s*(.*)/.exec(out);
      if (m) {
        const ids = m[2] ? m[2].split(',').filter(Boolean) : [];
        return finish({ label: spec.label, ids, raw: '' });
      }
      if (/SEEDED \d+/.test(out)) return finish({ label: spec.label, ids: [], raw: '' });
      const tail = out.trim().split('\n').filter(Boolean).slice(-2).join(' | ') || '无输出';
      finish({ label: spec.label, ids: null, raw: tail });
    });
  });
}

const expected = (label, n) => Array.from({ length: n }, (_, i) => `${label}-${i}`);

let failures = 0;
const fail = msg => {
  failures++;
  console.log(`   ❌ ${msg}`);
};
const pass = msg => console.log(`   ✅ ${msg}`);

console.log('═══ U12 队列跨进程原子性复验 ═══');
console.log(`Redis  : ${process.env.REDIS_HOST || '(未配置)'}:${process.env.REDIS_PORT || 6379} (db${PROBE_REDIS_DB})`);
console.log(`前缀   : ${RUN}:{fifo,fifo-concurrent,ring}`);
console.log('');

// ── 第 1 轮：消费者先看到空队列，写入者随后写入 ──
// 这一轮对准的是"进程内缓存 meta"：消费者启动时缓存空指针，写入者的 300 条应当立刻可见。
console.log(`第 1 轮：消费者（已缓存空队列）vs 写入 ${SEED} 条…`);
{
  const at = Date.now() + START_LEAD_MS;
  const consumer = runChild({ mode: 'drain-fifo', prefix: PREFIX_FIFO, label: 'r1-consumer', at });
  const producer = createQueue(PREFIX_FIFO, { backend: 'redis', maxSize: SEED * 4 });
  for (const id of expected('p', SEED)) await producer.push(id);

  const r = await consumer;
  const remaining = await producer.length();
  await producer.clear();

  if (r.ids === null) {
    fail(`消费者异常：${r.raw}`);
  } else {
    const set = new Set(r.ids);
    if (r.ids.length !== SEED) fail(`消费者只收到 ${r.ids.length}/${SEED} 条 —— 指针没跟上别的进程的写入`);
    else if (set.size !== SEED) fail(`消费者收到重复消息（${r.ids.length} 条里只有 ${set.size} 条不同）`);
    else if (!expected('p', SEED).every(id => set.has(id))) fail('收到的 id 与写入的不一致');
    else pass(`${SEED} 条全部可见且不重复`);
    if (remaining !== 0) fail(`消费后队列仍报告 ${remaining} 条 —— 指针写回没跟上`);
  }
}
console.log('');

// ── 第 2 轮：N 个消费者并发消费同一队列 ──
// 对准的是"指针推进不原子"：两个进程从同一 head 取值会重复投递，写回时又可能互相覆盖导致漏投。
console.log(`第 2 轮：${CONSUMERS} 个消费者并发消费 ${SEED} 条…`);
{
  const producer = createQueue(PREFIX_FIFO_CONCURRENT, { backend: 'redis', maxSize: SEED * 4 });
  for (const id of expected('c', SEED)) await producer.push(id);

  const at = Date.now() + START_LEAD_MS;
  const consumers = Array.from({ length: CONSUMERS }, (_, i) =>
    runChild({ mode: 'drain-fifo', prefix: PREFIX_FIFO_CONCURRENT, label: `r2-c${i + 1}`, at })
  );
  const results = await Promise.all(consumers);

  const broken = results.filter(r => r.ids === null);
  if (broken.length) {
    fail(`消费者异常：${broken.map(b => `${b.label} ${b.raw}`).join(' | ')}`);
  } else {
    const all = results.flatMap(r => r.ids);
    const set = new Set(all);
    const counts = results.map(r => `${r.label}=${r.ids.length}`).join(' ');
    if (all.length !== SEED) fail(`共取走 ${all.length}/${SEED} 条（${counts}）—— 漏投`);
    else if (set.size !== SEED) fail(`出现重复投递：${all.length} 条里只有 ${set.size} 条不同（${counts}）`);
    else pass(`合计 ${SEED} 条，无重复无丢失（${counts}）`);
  }

  const remaining = await producer.length();
  await producer.clear();
  if (remaining !== 0) fail(`消费后队列仍报告 ${remaining} 条`);
}
console.log('');

// ── 第 3 轮：环形队列两个写入者并发写 ──
// 环形队列的 meta 是 {head, tail, count} 三元组，写入还要处理"满则覆盖最旧"，
// 与 FIFO 的二元组不是同一段代码：两个写入者各按自己读到的 count 计算，会把 count 算成实际的一半。
console.log(`第 3 轮：环形队列（容量 ${RING_MAX}）两个写入者各写 ${RING_SEED} 条…`);
{
  const at = Date.now() + START_LEAD_MS;
  const writers = ['w1', 'w2'].map(label =>
    runChild({ mode: 'seed-ring', prefix: PREFIX_RING, label, at, count: RING_SEED, max: RING_MAX })
  );
  const writerResults = await Promise.all(writers);
  const brokenWriters = writerResults.filter(w => w.ids === null);
  if (brokenWriters.length) fail(`写入者异常：${brokenWriters.map(b => `${b.label} ${b.raw}`).join(' | ')}`);

  const reader = await runChild({ mode: 'read-ring', prefix: PREFIX_RING, label: 'r3-reader', max: RING_MAX });
  const ring = createRingQueue(PREFIX_RING, { backend: 'redis', maxSize: RING_MAX });

  if (reader.ids === null) {
    fail(`读取者异常：${reader.raw}`);
  } else {
    const total = RING_SEED * 2;
    const expectVisible = Math.min(total, RING_MAX);
    const set = new Set(reader.ids);
    const allowed = new Set([...expected('w1', RING_SEED), ...expected('w2', RING_SEED)]);
    if (reader.ids.length !== expectVisible) {
      fail(`读到 ${reader.ids.length} 条，应为 ${expectVisible} 条（写入 ${total} 条、容量 ${RING_MAX}）`);
    } else if (set.size !== expectVisible) {
      fail(`读到重复条目：${reader.ids.length} 条里只有 ${set.size} 条不同`);
    } else if (reader.ids.some(id => !allowed.has(id))) {
      fail('读到了不属于任何写入者的 id');
    } else {
      pass(`恰好读到 ${expectVisible} 条且互不重复（头部覆盖最旧符合环形语义）`);
    }

    const reported = await ring.length();
    if (reported !== expectVisible) fail(`length() 报 ${reported}，与实际可见 ${expectVisible} 条不符（count 被并发写坏）`);
  }

  await ring.clear();
}

console.log('');
const allPass = failures === 0;
console.log(allPass ? '═══ U12 队列跨进程原子性复验：全部通过 ═══' : `═══ U12 复验：${failures} 项失败 ═══`);

// 退出前必须断开：保留的连接会让进程挂住不退出（关卡"跑完了但不返回"）
await disconnectStandalone();
process.exit(allPass ? EXIT_PASS : EXIT_ASSERT);
