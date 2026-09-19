/**
 * 压测基线（P0）—— 真实应用 + 真实依赖的零依赖压测器
 *
 * === 它测什么 ===
 * 对**真实启动的应用**（index.js，含 DB / Redis / 全部加载器）打固定并发流量，
 * 每个场景记录：RPS、延迟分位数（p50/p90/p95/p99/max）、错误数，以及 ——
 * 这是本仓库特有的 —— **服务进程事件循环的最长冻结时长**（tick 间隔法，
 * 由 tick-probe.mjs 通过 `--import` 注入，业务代码零侵入）。
 *
 * 吞吐量只能证明「跑得动」，冻结时长才能证明「没退化回阻塞实现」：
 *   bcryptjs 那次的形态就是 RPS 正常、tick gap 774ms、p99 爆炸。
 *
 * === 场景 ===
 *   S1 live      GET  /health/live                —— 管线地板（Fastify + 钩子，无 I/O）
 *   S2 ready     GET  /health/ready               —— I/O 扇出（Redis + DB 就绪检查）
 *   S3 challenge POST /api/firewall/v1/challenge/verify
 *                —— 防火墙热路径（每请求走访问层 Lua 读 + 挑战查询未命中即拒绝）
 *
 * === 与真实流量的差异（读结果前必看）===
 *   ① IP 限流上限被环境变量 FW_RATE_LIMIT_OVERRIDE 上调到 1000000/窗口：
 *      基线量的是服务器容量，不是限流器（否则三个场景共用 127.0.0.1 的
 *      10000/60s 预算，跑不到一半就全是 429）。限流计数本身的 Redis 开销
 *      仍包含在每个请求里。该变量只在设置了合法正整数时生效，见
 *      first-ratelimit.js 的 resolveRateLimitMax。
 *   ② S3 的挑战 ID 是随机不存在的 → 走的是「查询未命中 → 拒绝」分支，
 *      代表防火墙热路径开销，不代表验证成功分支的成本。
 *   ③ 单机回环、无网络延迟，绝对值只可用于**同机前后对比**，不可跨机器比较。
 *
 * === 留档 ===
 * 结果写入 scripts/bench/results/baseline-<时间戳>.json（含机器指纹），
 * 供后续优化前后对照。对比口径：同场景、同并发、同时长。
 *
 * 用法：node scripts/bench/baseline.mjs [--quick]
 *   --quick：每场景 3s（冒烟用，留档请用完整时长）
 * 退出码：0 完成 / 1 有场景产生服务端错误（5xx 或连接失败）
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXIT_PASS = 0;
const EXIT_FAIL = 1;

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const RESULTS_DIR = path.join(DIR, 'results');
const TICK_FILE = path.join(ROOT, '.tmp-probe', 'bench-tick.txt');
const TICK_RESET_FILE = path.join(ROOT, '.tmp-probe', 'bench-tick-reset.flag');
const SERVER_LOG = path.join(ROOT, '.tmp-probe', 'bench-server.log');

const QUICK = process.argv.includes('--quick');
const DURATION_MS = QUICK ? 3000 : 8000;
const WARMUP_MS = 2000;
const PORT = Number(process.env.BENCH_PORT || 3177);
const HOST = `127.0.0.1:${PORT}`;

/** 场景定义（并发与时长在此统一调整）
 *
 * 路径口径：`system.json` 的 prefix 为空 → 健康检查全路径是 `/v1/health/*`（不是 `/health/*`）；
 * firewall 的系统前缀是 `/api/firewall` → 挑战路由是 `/api/firewall/v1/challenge/verify`。
 */
const SCENARIOS = [
  { id: 'S1-live', method: 'GET', urlPath: '/v1/health/live', concurrency: 50 },
  { id: 'S2-ready', method: 'GET', urlPath: '/v1/health/ready', concurrency: 20 },
  {
    id: 'S3-challenge',
    method: 'POST',
    urlPath: '/api/firewall/v1/challenge/verify',
    concurrency: 20,
    body: () => JSON.stringify({ challengeId: randomChallengeId(), answer: '0' })
  }
];

function randomChallengeId() {
  // 32 位 hex，符合路由 schema；内容随机 → 必然未命中
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 请求原语（keepAlive，响应体必须 resume 才能复用连接）
// ---------------------------------------------------------------------------

function requestOnce({ method, urlPath, body }) {
  return new Promise(resolve => {
    const payload = typeof body === 'function' ? body() : body;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path: urlPath,
        agent,
        headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}
      },
      res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', () => resolve(0));
    if (payload) req.write(payload);
    req.end();
  });
}

let agent = null;

// ---------------------------------------------------------------------------
// 负载发生器
// ---------------------------------------------------------------------------

async function hammer(scenario, durationMs, collect) {
  const deadline = Date.now() + durationMs;
  const worker = async () => {
    while (Date.now() < deadline) {
      const t0 = process.hrtime.bigint();
      const code = await requestOnce(scenario);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      collect(code, ms);
    }
  };
  await Promise.all(Array.from({ length: scenario.concurrency }, worker));
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function runScenario(scenario) {
  agent = new http.Agent({ keepAlive: true, maxSockets: scenario.concurrency });
  const latencies = [];
  let completed = 0;
  let clientErr = 0;
  let serverErr = 0;
  const statusCount = new Map();
  const collect = (code, ms) => {
    latencies.push(ms);
    statusCount.set(code, (statusCount.get(code) || 0) + 1);
    if (code >= 500) serverErr++;
    else if (code === 0) clientErr++;
    else completed++;
  };

  await hammer(scenario, WARMUP_MS, () => {}); // 预热：不计数
  const t0 = Date.now();
  await hammer(scenario, DURATION_MS, collect);
  const elapsed = (Date.now() - t0) / 1000;
  agent.destroy();

  latencies.sort((a, b) => a - b);
  const n = latencies.length;
  return {
    scenario: scenario.id,
    method: scenario.method,
    url: scenario.urlPath,
    concurrency: scenario.concurrency,
    durationSec: Number(elapsed.toFixed(1)),
    requests: n,
    rps: Number((n / elapsed).toFixed(0)),
    completed,
    serverErrors: serverErr,
    connectionErrors: clientErr,
    statusCodes: Object.fromEntries([...statusCount.entries()].sort((a, b) => a[0] - b[0])),
    latencyMs: {
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p90: Number(percentile(latencies, 90).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
      p99: Number(percentile(latencies, 99).toFixed(1)),
      max: Number(latencies[n - 1].toFixed(1))
    }
  };
}

// ---------------------------------------------------------------------------
// 编排
// ---------------------------------------------------------------------------

function readTick() {
  try {
    const text = fs.readFileSync(TICK_FILE, 'utf-8');
    const get = k => {
      const m = text.match(new RegExp(`^${k}=(.*)$`, 'm'));
      return m ? Number(m[1]) : null;
    };
    return { maxGapMs: get('TICK_MAX_GAP'), avgGapMs: get('TICK_AVG_GAP'), samples: get('TICK_SAMPLES') };
  } catch {
    return { maxGapMs: null, avgGapMs: null, samples: 0 };
  }
}

function waitForHealth(timeoutMs) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const req = http.get(`http://${HOST}/v1/health/live`, res => {
        res.resume();
        clearInterval(iv);
        resolve(res.statusCode === 200);
      });
      req.on('error', () => {});
      req.end();
      if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        resolve(false);
      }
    }, 300);
  });
}

log('══ P0 压测基线 ══');
log(`（真实应用 + 真实 Redis/DB，端口 ${PORT}${QUICK ? '，--quick 冒烟模式' : ''}）\n`);

fs.mkdirSync(path.dirname(TICK_FILE), { recursive: true });
fs.rmSync(TICK_FILE, { force: true });

const tickProbeUrl = `file://${path.join(DIR, 'tick-probe.mjs').replace(/\\/g, '/')}`;
const server = spawn(
  process.execPath,
  // ⚠️ 必须带 --env-file：ESM 的静态 import 先于 index.js 里的 dotenvConfig() 执行，
  // framework/db 在模块求值期就检查 DB_HOST —— 等 dotenv 注入就来不及了。
  // （dev/start 脚本也都是 --env-file 先行，这里是同一个约束。）
  // --env-file 不会覆盖已存在的环境变量，因此下面的 PORT 覆盖仍然生效。
  ['--import', tickProbeUrl, '--env-file=.env', 'index.js'],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      // 管理端持久化配置（firewall_config.json，被 git 跟踪）里的 10000/60s
      // 会被三个场景共用并跨运行持久在 Redis —— 必须旁路掉，详见文件头说明①。
      // FW_RATE_LIMIT 只影响「无持久化文件时」的默认值，对已持久化的配置无效。
      FW_RATE_LIMIT_OVERRIDE: '1000000',
      BENCH_TICK_FILE: TICK_FILE,
      BENCH_TICK_RESET_FILE: TICK_RESET_FILE
    },
    stdio: ['ignore', fs.openSync(SERVER_LOG, 'a'), fs.openSync(SERVER_LOG, 'a')]
  }
);

let results;
let bootTick = null;
let serverFailed = false;

try {
  log('   等待应用就绪（/health/live）…');
  const ok = await waitForHealth(90_000);
  if (!ok) {
    console.error(`\n⛔ 应用未在 90s 内就绪 —— 查看日志：${SERVER_LOG}`);
    serverFailed = true;
  } else {
    log('   应用已就绪，开始压测\n');
    // 启动期与负载期分开留档：模块加载 / 模型同步的冻结不代表请求路径的健康度。
    bootTick = readTick();
    log(
      `   [启动期] 事件循环最长冻结 ${bootTick.maxGapMs ?? '未取到'}ms` +
        `（模型加载/同步阶段，仅供参考）\n`
    );
    // 通过标记文件让探针归零，之后的数字只反映负载期
    fs.writeFileSync(TICK_RESET_FILE, String(Date.now()));
    await sleep(1300); // ≥ 探针 1s 的 flush 周期，确保重置已生效

    results = [];
    for (const scenario of SCENARIOS) {
      const r = await runScenario(scenario);
      results.push(r);
      log(`   ${r.scenario.padEnd(14)} ${String(r.rps).padStart(6)} rps   p50=${r.latencyMs.p50}ms  p95=${r.latencyMs.p95}ms  p99=${r.latencyMs.p99}ms  err=${r.serverErrors + r.connectionErrors}`);
    }
  }
} catch (err) {
  console.error(`压测异常：${err.message}`);
  serverFailed = true;
} finally {
  if (!server.killed && server.exitCode === null) server.kill();
}

const tick = readTick();
if (results) {
  log(
    `\n   [负载期] 事件循环最长冻结（tick gap，10ms 心跳）：${tick.maxGapMs ?? '未取到'}ms` +
      `（采样 ${tick.samples ?? 0} 次，均值 ${tick.avgGapMs ?? '-'}ms）`
  );
  log('   ⚠️  tick gap 含定时器固有漂移与 GC；>50ms 才值得追查（噪声下限约 20ms）。');
}

if (results) {
  const record = {
    meta: {
      generatedAt: new Date().toISOString(),
      quickMode: QUICK,
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
      cpu: `${os.cpus()[0]?.model || 'unknown'} × ${os.cpus().length}`,
      port: PORT,
      rateLimitOverridden: 'FW_RATE_LIMIT_OVERRIDE=1000000',
      notes:
        '事件循环冻结分两段留档：boot 为模块加载/模型同步阶段（不代表请求路径），load 为就绪后的压测期。' +
        'Fastify logger 固定 level=info（dev 模式 pino-pretty），其成本计入管线地板，前后对比口径一致。'
    },
    eventLoop: { ...tick, phase: 'load' },
    eventLoopBoot: bootTick ? { ...bootTick, phase: 'boot' } : null,
    scenarios: results
  };
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(RESULTS_DIR, `baseline-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2) + '\n');
  log(`\n   留档：${path.relative(ROOT, outFile)}`);
}

process.exit(serverFailed || (results && results.some(r => r.serverErrors + r.connectionErrors > 0)) ? EXIT_FAIL : EXIT_PASS);
