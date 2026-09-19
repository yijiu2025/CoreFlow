/**
 * 关卡：遥测统计跨实例汇聚（E3 —— 进程内状态外置）
 *
 * === 它验证什么 ===
 * `data/store.js` 的统计（总请求数 / Top 地域 / Top IP）原本是进程内变量，
 * 多实例下面板显示的是「处理该请求的那个实例的切片」。
 * 本关卡用两个**真实进程** + 真实 Redis 验证：一个进程产生的流量
 * 会出现在另一个进程的聚合值里，且**不会被重复计数**。
 *
 * === 三条断言 ===
 *   ① 子进程写入的 3 条出现在父进程的聚合值中（跨实例可见）
 *   ② 总数恰为 5（3 子 + 2 父）—— 少了是丢、多了是重复计算
 *   ③ 连续两次读取结果一致（刷新不会让数字漂移）
 *
 * 断言 ② 是关键：只验"能看到别人的数据"无法发现重复计算，
 * 而重复计算（已刷写的部分又被加一遍）正是本实现最容易出的错。
 *
 * 隔离：父子都切到 PROBE_REDIS_DB（默认 db15）并重定向遥测落盘文件，
 * 不碰 db0 的键，也不写被 git 跟踪的 src/data/traffic_stats.json。
 *
 * 用法：node scripts/verify/stats-aggregation.mjs
 * 退出码：0 通过 / 1 断言失败 / 3 环境不可用
 */
process.loadEnvFile(process.env.VERIFY_ENV_FILE || '.env');
process.env.REDIS_DB = process.env.PROBE_REDIS_DB || '15';
process.env.FW_TRAFFIC_STATS_FILE = process.env.PROBE_STATS_FILE || '.tmp-probe/stats-parent.json';

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXIT_PASS = 0;
const EXIT_ASSERT = 1;
const EXIT_ENV = 3;

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CHILD = path.join(DIR, 'stats-child.mjs');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function waitFor(pred, ms) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (pred()) {
        clearInterval(iv);
        resolve(true);
      } else if (Date.now() - t0 > ms) {
        clearInterval(iv);
        resolve(false);
      }
    }, 50);
  });
}

const CLEANUP_FILES = [process.env.FW_TRAFFIC_STATS_FILE, process.env.PROBE_CHILD_STATS_FILE || '.tmp-probe/stats-child.json'];

console.log('══ E3 遥测统计跨实例汇聚复验 ══');
console.log('（两个真实进程 + 真实 Redis）\n');

const { connectStandalone, disconnectStandalone } = await import('../../src/framework/redis/index.js');

const conn = await connectStandalone();
if (!conn.ready) {
  console.error(`⛔ 环境不可用：Redis 连接失败 —— ${conn.reason}`);
  console.error('   本关卡验证的是代码语义，不是给你排查环境问题的。退出码 3。');
  process.exit(EXIT_ENV);
}

const store = await import('../../src/app/firewall/data/store.js');

let exitCode;
let childExit;

try {
  // ── 从干净状态开始（只清 fw:stats:* 语义 key，且只在隔离 db 上）──
  await store.clearAll();
  console.log(`   已清空汇聚基数（db${process.env.REDIS_DB || 0}，仅 fw:stats:*）\n`);

  // ── 起写入端子进程 ──
  const child = spawn(process.execPath, [CHILD], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });

  let buf = '';
  const lines = [];
  const noise = [];
  child.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      if (/^(PUSHED |ENV_UNAVAILABLE)/.test(line)) lines.push(line);
      else noise.push(line);
    }
  });
  const childErr = [];
  child.stderr.on('data', d => childErr.push(d.toString()));

  const pushed = await waitFor(() => lines.some(l => l.startsWith('PUSHED')) || lines.length > 0, 20_000);
  if (!pushed || !lines.some(l => l.startsWith('PUSHED'))) {
    const env = lines.find(l => l.startsWith('ENV_UNAVAILABLE'));
    console.error(env ? `⛔ 环境不可用（写入端）：${env.slice('ENV_UNAVAILABLE '.length)}` : '❌ 写入端未完成');
    if (noise.length) console.error(noise.slice(-10).join('\n'));
    if (childErr.length) console.error(childErr.join(''));
    exitCode = env ? EXIT_ENV : EXIT_ASSERT;
  } else {
    console.log('   写入端已完成：3 条记录已刷写进 Redis\n');

    // ── 父进程自己也产生 2 条 ──
    for (let i = 0; i < 2; i++) {
      store.pushRecord({
        url: '/from-parent',
        ip: `198.51.100.${20 + i}`,
        region: 'CN',
        city: '测试市',
        blocked: i === 0,
        __probe: 'parent'
      });
    }
    await store.__test__persistNow();
    store.stopPersistTimer();

    // ── 读聚合值 ──
    const agg1 = await store.getSummaryAggregated();
    const records1 = await store.getRecentRecordsAggregated(50);

    const childIps = ['198.51.100.10', '198.51.100.11', '198.51.100.12'];
    const parentIps = ['198.51.100.20', '198.51.100.21'];
    const ipMap = new Map(agg1.topIps.map(i => [i.ip, i.count]));

    const passChildVisible = childIps.every(ip => ipMap.get(ip) === 1);
    const passParentVisible = parentIps.every(ip => ipMap.get(ip) === 1);
    const passTotal = agg1.totalRequests === 5;
    const passRegion = (agg1.topRegions.find(r => r.region === 'CN-测试市') || {}).count === 5;
    const urls = new Set(records1.map(r => r.url));
    const passRecords = urls.has('/from-child') && urls.has('/from-parent');

    console.log(`   ① 子进程的 3 条跨实例可见      ${passChildVisible ? '✅' : '❌'}`);
    console.log(`   ② 本实例的 2 条也在聚合值里    ${passParentVisible ? '✅' : '❌'}`);
    console.log(`   ③ 总数恰为 5（不丢不重）       ${passTotal ? '✅' : '❌'}（实际 ${agg1.totalRequests}）`);
    console.log(`   ④ 地域计数 = 5（不重复计算）   ${passRegion ? '✅' : '❌'}（实际 ${JSON.stringify(agg1.topRegions)}）`);
    console.log(`   ⑤ 记录含两端的 url             ${passRecords ? '✅' : '❌'}（${[...urls].join(', ')}）`);

    // ── 再读一次：数字必须稳定 ──
    const agg2 = await store.getSummaryAggregated();
    const passStable = agg2.totalRequests === agg1.totalRequests;
    console.log(`   ⑥ 连续两次读取一致（不漂移）   ${passStable ? '✅' : '❌'}（${agg1.totalRequests} → ${agg2.totalRequests}）`);
    console.log('');

    const all =
      passChildVisible && passParentVisible && passTotal && passRegion && passRecords && passStable;
    console.log(all ? '═══ E3 统计汇聚复验：全部通过 ═══' : '═══ E3 统计汇聚复验：存在失败项 ═══');
    exitCode = all ? EXIT_PASS : EXIT_ASSERT;

    if (!all) {
      console.log(`\nTopIP: ${JSON.stringify(agg1.topIps)}`);
      console.log(`TopRegion: ${JSON.stringify(agg1.topRegions)}`);
    }

    // 允许子进程自然退出
    await sleep(200);
  }

  if (child.exitCode === null && !child.killed) child.kill();
  childExit = await new Promise(r => {
    if (child.exitCode !== null) return r(child.exitCode);
    const t = setTimeout(() => r('timeout'), 3000);
    child.once('exit', c => {
      clearTimeout(t);
      r(c);
    });
  });
  if (childExit !== null && childExit !== 0 && exitCode === EXIT_PASS) {
    console.log(`（写入端退出码 ${childExit}）`);
  }
} catch (err) {
  console.error(`实验异常：${err.message}`);
  exitCode = EXIT_ASSERT;
} finally {
  // 收尾：清掉本次关卡写进 Redis 的基数，避免污染后续运行
  try {
    await store.clearAll();
  } catch {
    /* 忽略 */
  }
  store.stopPersistTimer();
  await disconnectStandalone();
  for (const f of CLEANUP_FILES) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      /* 忽略 */
    }
  }
}

// ?? EXIT_ASSERT：任何未预期路径都必须以「断言失败」而非 0 退出，
// 否则一次崩溃会被 CI 当成通过。
process.exit(exitCode ?? EXIT_ASSERT);
