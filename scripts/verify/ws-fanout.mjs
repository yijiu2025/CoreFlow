/**
 * 关卡：跨实例 WS 广播（E3 —— 进程内状态外置）
 *
 * === 它验证什么 ===
 * 防火墙监控的 WebSocket 客户端集合是**进程内**的，于是多实例部署时
 * 「A 实例产生的封禁告警送不到连在 B 实例上的浏览器」。
 * 本关卡用两个**真实进程** + 真实 Redis 验证消息确实跨实例送达，并且不重复。
 *
 * === 三条断言（缺任何一条都会漏掉一种失败） ===
 *   ① 子进程收到该告警            → 跨实例送达成立（否则功能等于没做）
 *   ② 父进程本地**恰好收到 1 条**  → origin 过滤生效（否则本地重复两条：直投 + 自发自收）
 *   ③ 子进程也**恰好收到 1 条**    → Redis 没有重复投递
 *
 * 只验 ① 的话，「既发又收」造成的重复投递完全测不出来 —— 而那正是本改动最容易出的 bug。
 *
 * 用法：node scripts/verify/ws-fanout.mjs
 * 退出码：0 通过 / 1 断言失败 / 3 环境不可用（Redis 不可达）
 */
process.loadEnvFile(process.env.VERIFY_ENV_FILE || '.env');
process.env.FW_TRAFFIC_STATS_FILE = process.env.FW_TRAFFIC_STATS_FILE || '.tmp-probe/ws-fanout-stats.json';

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXIT_PASS = 0;
const EXIT_ASSERT = 1;
const EXIT_ENV = 3;

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CHILD = path.join(DIR, 'ws-fanout-child.mjs');
const STATS_FILE = process.env.FW_TRAFFIC_STATS_FILE;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 轮询等待条件成立 @returns {Promise<boolean>} */
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

console.log('══ E3 跨实例 WS 广播复验 ══');
console.log('（两个真实进程 + 真实 Redis）\n');

const { connectStandalone, disconnectStandalone, isPubSubReady } = await import(
  '../../src/framework/redis/index.js'
);

const conn = await connectStandalone();
if (!conn.ready) {
  console.error(`⛔ 环境不可用：Redis 连接失败 —— ${conn.reason}`);
  console.error('   本关卡验证的是代码语义，不是给你排查环境问题的。退出码 3。');
  process.exit(EXIT_ENV);
}

const { registerMonitorClient, broadcastLog } = await import(
  '../../src/app/firewall/services/monitor.service.js'
);

// ── 父进程自己的假客户端：用于验证「本地不重复」 ──
const localTexts = [];
registerMonitorClient({
  readyState: 1,
  on() {},
  removeListener() {},
  send(data) {
    localTexts.push(data);
  }
});

const localReady = await waitFor(() => isPubSubReady(), 10_000);
if (!localReady) {
  console.error('⛔ 环境不可用：本进程订阅连接未在 10s 内就绪。退出码 3。');
  await disconnectStandalone();
  process.exit(EXIT_ENV);
}

// ── 起接收端子进程 ──
const child = spawn(process.execPath, [CHILD], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });

let buf = '';
const childLines = [];
const childNoise = [];

child.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    if (/^(READY|CLIENT_RECV |ENV_UNAVAILABLE)/.test(line)) childLines.push(line);
    else childNoise.push(line);
  }
});

const childErr = [];
child.stderr.on('data', d => childErr.push(d.toString()));

let exitCode = EXIT_ASSERT;
let childExit;

/** 从子进程协议行里解析出指定类型的 WS 消息 */
function childMessages(type) {
  return childLines
    .filter(l => l.startsWith('CLIENT_RECV '))
    .map(l => l.slice('CLIENT_RECV '.length))
    .map(raw => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter(m => m && m.type === type);
}

try {
  const ready = await waitFor(() => childLines.includes('READY'), 15_000);
  if (!ready) {
    const env = childLines.find(l => l.startsWith('ENV_UNAVAILABLE'));
    if (env) {
      console.error(`⛔ 环境不可用（接收端）：${env.slice('ENV_UNAVAILABLE '.length)}`);
      exitCode = EXIT_ENV;
    } else {
      console.error('❌ 接收端未在 15s 内就绪');
      exitCode = EXIT_ASSERT;
    }
  } else {
    console.log('   接收端就绪（独立进程，已订阅 Redis 频道）\n');

    // ── 触发一条告警 ──
    const marker = { __probe: true, ip: '203.0.113.7', reason: 'fanout-probe', ts: Date.now() };
    console.log(`   本实例产生一条告警：ip=${marker.ip} ts=${marker.ts}`);
    broadcastLog(marker);

    // ── 等待两端投递完成 ──
    await waitFor(() => childMessages('LOG').length > 0 && localTexts.length >= 2, 5000);
    await sleep(500); // 多留一点窗口：若发生重复投递，让它有机会显现

    const childLogs = childMessages('LOG');
    const localLogs = localTexts
      .map(raw => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })
      .filter(m => m && m.type === 'LOG');

    const pass1 = childLogs.length >= 1 && childLogs[0].data?.ts === marker.ts;
    const pass2 = localLogs.length === 1 && localLogs[0].data?.ts === marker.ts;
    const pass3 = childLogs.length === 1;

    console.log('');
    console.log(`   ① 子进程收到该告警            ${pass1 ? '✅' : '❌'}（收到 ${childLogs.length} 条）`);
    console.log(`   ② 父进程本地恰好 1 条（不重复）${pass2 ? '✅' : '❌'}（收到 ${localLogs.length} 条）`);
    console.log(`   ③ 子进程恰好 1 条（无重复投递）${pass3 ? '✅' : '❌'}（收到 ${childLogs.length} 条）`);
    console.log('');

    const all = pass1 && pass2 && pass3;
    console.log(all ? '═══ E3 跨实例广播复验：全部通过 ═══' : '═══ E3 复验：存在失败项 ═══');
    exitCode = all ? EXIT_PASS : EXIT_ASSERT;

    if (!all) {
      console.log('\n--- 接收端协议行 ---');
      childLines.forEach(l => console.log('   ' + l));
      if (childNoise.length) {
        console.log('--- 接收端日志（末 20 行）---');
        childNoise.slice(-20).forEach(l => console.log('   ' + l));
      }
    }
  }
} catch (err) {
  console.error(`实验异常：${err.message}`);
  exitCode = EXIT_ASSERT;
} finally {
  // 收尾必须无条件执行：子进程挂着会阻塞关卡返回
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
    console.log(`（接收端退出码 ${childExit}）`);
  }
  if (childErr.length) console.log('--- 接收端 stderr ---\n' + childErr.join(''));

  await disconnectStandalone();
  // 清理隔离用的遥测文件，避免留下无关产物
  try {
    if (STATS_FILE && fs.existsSync(STATS_FILE)) fs.unlinkSync(STATS_FILE);
  } catch {
    /* 忽略 */
  }
}

process.exit(exitCode);
