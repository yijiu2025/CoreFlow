/**
 * E2 守卫配置跨进程同步复验 —— 驱动进程
 *
 * 验证链路：**A 进程改库 → B 进程的内存配置在同步周期内跟上**。
 * 这正是「同一请求打到不同实例、得到不同鉴权结果」这个安全语义错误的修复验收。
 *
 * 三轮设计（顺序不可换）：
 *   1. 只把 `version` +1、内容逐字节不变 → 验证跨进程**版本感知**（零行为影响）；
 *   2. `version` +1 且改内容               → 验证内容真的被**合并进另一个进程的内存**；
 *   3. 版本不再变化时保持空轮询            → 验证**幂等**（不重复合并）。
 *
 * 用法
 * ----
 *   npm run verify:guard
 *
 * 退出码：0 通过 / 1 断言失败 / 2 **回滚不完整（需人工检查 guard_configs，不要重跑）** / 3 环境不可用
 * 详见同目录 README.md。
 *
 * ⚠️ 本关卡会写真实库，安全措施见下方「安全护栏」小节。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// ⚠️ models.js 刻意**不做静态 import**：ESM 的静态 import 会在本模块体之前求值，
//    那样它就会在 process.loadEnvFile() 之前读到（空的）环境变量。改为动态 import。

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const OBSERVER = path.join(DIR, 'guard-sync-child.mjs');

// 要指向另一套环境时，用这个开关换掉整份 env 文件（原因见下方 loadEnvFile 处）
const ENV_FILE = process.env.VERIFY_ENV_FILE || '.env';

const SYSTEM = process.env.PROBE_SYSTEM || 'Notice';
const GROUP = process.env.PROBE_GROUP || 'config';
const API = process.env.PROBE_API || 'getChannels';
const IP_MARKER = process.env.PROBE_IP_MARKER || '203.0.113.1'; // TEST-NET-3，保证不可路由

const CHILD_TIMEOUT_MS = 30000;
const WAIT_MS = 20000;

const EXIT_PASS = 0;
const EXIT_ASSERT = 1;
const EXIT_ROLLBACK = 2;
const EXIT_ENV = 3;

// 自己加载 env 文件，而不用 `node --env-file`。原因有两条，缺一都会让关卡"无法指向另一套环境"：
//   1. `--env-file` 的取值**不会被命令行环境变量覆盖**（进程环境变量优先，见 Node 语义）；
//   2. `npm run` 会把命令行上的变量**丢掉**（实测 PROBE_PROCS=3 npm run → 仍是默认 5）。
// 对本关卡尤其关键：它会写 guard_configs 真实表，必须能指向测试库。
//   VERIFY_ENV_FILE=.env.testing node scripts/verify/guard-sync.mjs
//   DB_HOST=10.0.0.9             node scripts/verify/guard-sync.mjs
// ⚠️ 覆盖时**必须直接跑 node**，经 `npm run` 传的变量到不了脚本里。
try {
  process.loadEnvFile(ENV_FILE);
} catch (err) {
  console.error(`⛔ 环境不可用：无法加载 env 文件 ${ENV_FILE} —— ${err.message}`);
  console.error('   默认读 .env；换环境用 VERIFY_ENV_FILE=<文件> 并直接跑 node。退出码 3。');
  process.exit(EXIT_ENV);
}

// ─────────────────────────── 安全护栏 ───────────────────────────

// 护栏 1：生产环境一律拒绝（本关卡会写 guard_configs 真实表）
if (process.env.NODE_ENV === 'production') {
  console.error('⛔ 拒绝在 NODE_ENV=production 下运行：本关卡会写入 guard_configs 真实表。退出码 3。');
  process.exit(EXIT_ENV);
}

console.log('═══ E2 守卫配置跨进程同步复验 ═══');
console.log(`目标路径: ${SYSTEM} > ${GROUP} > ${API}`);
console.log(`标记 IP : ${IP_MARKER}`);
console.log(
  `MySQL   : ${process.env.DB_HOST || '(未配置)'}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || '(未配置)'}`
);
console.log('（会写库，但结束前无条件回滚）\n');

// ── 前置检查：先确认 MySQL 可达。
// 直接用 TCP 探一次而不是等 Sequelize 报错 —— pool 的 acquire 默认 30s，
// 加上索引/握手，"环境不可用"会拖到几十秒才浮现，而它本该在 3 秒内说清楚。
{
  const net = await import('node:net');
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT || 3306);
  const reachable = await new Promise(resolve => {
    if (!host) return resolve(false);
    const sock = net.connect({ host, port });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, 3000);
    sock.once('connect', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

  if (!reachable) {
    console.error(`⛔ 环境不可用：MySQL ${host || '(未配置)'}:${port} 不可达（3s 内未建立连接）。退出码 3。`);
    process.exit(EXIT_ENV);
  }
}

// 动态 import：必须晚于上面的 process.loadEnvFile()（见文件头的说明）
const { loadAllModels, closeDb } = await import('../../src/framework/db/models.js');
await loadAllModels();
const { getModel } = await import('../../src/framework/db/index.js');
const { default: Dao } = await import('../../src/app/guard/dao/guard-config.dao.js');
const GuardConfig = getModel('GuardConfig');

// 护栏 2：快照为空时**在任何写入之前**退出。
// restore() 的实现是「destroy 全表 + 按快照回填」，空快照会把整张表清空 ——
// 这在一次性实验里不会发生，但作为可重复调用的关卡必须挡住。
const snapshot = await Dao.backup();
const systemCount = Object.keys(snapshot.configs || {}).length;
if (systemCount === 0) {
  console.error('⛔ 快照为空，拒绝继续。');
  console.error('   restore() 是「清空整表 + 按快照回填」，空快照会把 guard_configs 清空。');
  console.error('   请先在 MySQL 里准备好守卫配置数据。退出码 3。');
  await closeDb();
  process.exit(EXIT_ENV);
}

// 护栏 3：目标路径必须已存在，否则写到一半 mutate 抛错、回滚范围反而更大
const snapTarget = snapshot.configs?.[SYSTEM]?.groups?.[GROUP]?.apis?.[API];
if (!snapTarget) {
  console.error(`⛔ 快照中找不到目标路径 ${SYSTEM} > ${GROUP} > ${API}，拒绝继续。退出码 3。`);
  await closeDb();
  process.exit(EXIT_ENV);
}
if (JSON.stringify(snapTarget.allowIps ?? []).includes(IP_MARKER)) {
  console.error('⛔ 快照里已含标记 IP —— 说明上一次遗留未回滚，请先人工检查。退出码 3。');
  await closeDb();
  process.exit(EXIT_ENV);
}

console.log(`✔ 已备份快照（${systemCount} 个系统，全局 v${snapshot.version}）`);

/**
 * 直接改某一行的 version（可选同时改 config），模拟「运维在别的实例上改了配置并落库」
 * @param {string} systemKey
 * @param {((cfg: object) => void)|null} mutateConfig 若提供，则对解析后的 config 调用该函数后再序列化
 * @returns {Promise<number>} 写入后的 version
 */
async function bump(systemKey, mutateConfig = null) {
  const row = await GuardConfig.findOne({ where: { system_key: systemKey } });
  if (!row) throw new Error(`找不到行 ${systemKey}`);
  const parsed = typeof row.config === 'string' ? JSON.parse(row.config) : { ...(row.config || {}) };
  if (mutateConfig) mutateConfig(parsed);
  row.config = JSON.stringify(parsed);
  row.version = (row.version || 0) + 1;
  await row.save();
  return row.version;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let child;
let childExit = null;
let exitCode = EXIT_ASSERT;

/** 子进程的非协议输出（日志噪声），仅失败时回放，避免淹没判定 */
const childNoise = [];

function dumpNoise() {
  if (!childNoise.length) return;
  console.log('\n—— 子进程日志（仅失败时回放，取末尾 12 条）——');
  childNoise.slice(-12).forEach(l => console.log(`   | ${l}`));
  console.log('');
}

try {
  // ── 启动观测进程 ──
  // 不再传 `--env-file`：父进程已把 env 加载进 process.env，子进程直接继承即可。
  child = spawn(process.execPath, [OBSERVER], {
    cwd: ROOT,
    env: { ...process.env, PROBE_SYSTEM: SYSTEM, PROBE_GROUP: GROUP, PROBE_API: API, PROBE_IP_MARKER: IP_MARKER }
  });

  // 协议行直接显示；日志噪声先收起来，只在失败时回放。
  // 子进程的 stdout 与项目日志出口共用，同步过程每轮都会打若干条 WARN，
  // 不隔离的话结论会被淹没 —— 关卡输出必须让人一眼看到判定。
  const PROTOCOL_RE = /^(READY|OBSERVED_|DONE|TIMEOUT|SYNC_ERROR)/;
  let buf = '';
  const lines = []; // 协议行，供 waitForLine 匹配
  const waiters = [];
  child.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      if (PROTOCOL_RE.test(line)) {
        lines.push(line);
        console.log(`   [子进程] ${line}`);
        waiters.splice(0).forEach(w => w());
      } else {
        childNoise.push(line);
        if (childNoise.length > 200) childNoise.shift();
      }
    }
  });
  child.stderr.on('data', d => process.stderr.write(`   [子错误] ${d}`));
  child.on('close', code => (childExit = code));

  async function waitForLine(pattern, timeoutMs = WAIT_MS) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const hit = lines.find(l => pattern.test(l));
      if (hit) return hit;
      await Promise.race([new Promise(r => waiters.push(r)), sleep(200)]);
    }
    return null;
  }

  // 注意用 `/^READY /`（带空格）：子进程失败时会打印 `READY_ERROR ...`，
  // 若用 `/^READY/` 会把它误判成"已就绪"，随后拿着空配置一路跑到超时。
  const ready = await waitForLine(/^READY /, CHILD_TIMEOUT_MS);
  if (!ready) throw new Error(`观测进程未就绪（${CHILD_TIMEOUT_MS}ms 内未见 READY）`);
  console.log('✔ 观测进程已加载配置进内存\n');

  // ── 阶段 1：只把 version +1，内容逐字节不变 → 跨进程版本感知 ──
  console.log('阶段 1：只 bump version（内容不变，零行为影响）…');
  const v1 = await bump(SYSTEM, null);
  console.log(`   DB 已将 ${SYSTEM} 的 version 置为 v${v1}`);
  const r1 = await waitForLine(/^OBSERVED_VERSION/);
  const pass1 = !!r1;
  console.log(`   ${pass1 ? '✅ ' + r1 : '❌ 未观察到版本变化'}\n`);

  // ── 阶段 2：version +1 且改内容 → 内容被合并进另一个进程的内存 ──
  console.log(`阶段 2：bump version 且修改 allowIps（fail-closed，指向不可路由地址）…`);
  const v2 = await bump(SYSTEM, cfg => {
    cfg.groups[GROUP].apis[API].allowIps = [IP_MARKER];
  });
  console.log(`   DB 已将 ${SYSTEM} 的 version 置为 v${v2}，并写入 allowIps`);
  const r2 = await waitForLine(/^OBSERVED_CONTENT/);
  const pass2 = !!r2;
  console.log(`   ${pass2 ? '✅ ' + r2 : '❌ 未观察到内容同步'}\n`);

  // ── 阶段 3：版本不再变化时应为空轮询（幂等）──
  const r3 = await waitForLine(/^OBSERVED_IDLE/);
  const pass3 = !!r3;
  console.log('阶段 3：等待空轮询确认幂等…');
  console.log(`   ${pass3 ? '✅ ' + r3 : '❌ 未确认幂等'}\n`);

  const all = pass1 && pass2 && pass3;
  if (!all) dumpNoise();
  console.log(all ? '═══ E2 跨进程同步复验：全部通过 ═══' : '═══ E2 复验：存在失败项 ═══');
  exitCode = all ? EXIT_PASS : EXIT_ASSERT;
} catch (err) {
  console.error(`实验异常：${err.message}`);
  if (childExit !== null) console.error(`   观测进程退出码 ${childExit}`);
  dumpNoise();
  exitCode = EXIT_ASSERT;
} finally {
  if (child && !child.killed) child.kill();

  // ── 无条件回滚 ──
  console.log('\n回滚：从快照恢复 guard_configs …');
  await Dao.restore(snapshot);

  const after = await Dao.loadFromDB();
  const okSystems =
    JSON.stringify(Object.keys(after.configs).sort()) === JSON.stringify(Object.keys(snapshot.configs).sort());
  const target = after.configs[SYSTEM]?.groups?.[GROUP]?.apis?.[API];
  const contentBack = JSON.stringify(target?.allowIps ?? []) === '[]';
  const versionsBack = Object.entries(snapshot.versions).every(([k, v]) => (after.versions[k] ?? 0) === v);

  console.log(`   系统集合一致: ${okSystems ? '✅' : '❌'}`);
  console.log(`   版本号已还原: ${versionsBack ? '✅' : '❌'}`);
  console.log(`   allowIps 已还原为空: ${contentBack ? '✅' : '❌'}`);
  console.log(`   快照本身未被污染: ${JSON.stringify(snapTarget?.allowIps ?? []) === '[]' ? '✅' : '❌'}`);

  const rollbackOk = okSystems && versionsBack && contentBack;
  if (!rollbackOk) {
    console.error('❌ 回滚不完整，需要人工检查 guard_configs！退出码 2，请勿盲目重跑。');
    exitCode = EXIT_ROLLBACK;
  } else {
    console.log('   ✅ 数据已完整还原');
  }

  await closeDb();
  process.exit(exitCode);
}
