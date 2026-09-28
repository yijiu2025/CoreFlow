/**
 * 统一关卡入口 —— 一键跑全部「活跃」验收关卡，汇总报告。
 *
 * 为什么要有它：
 *   以前关卡散落、启动方式不一（有的要 5174、有的要 5177/5197/5189、有的要生产构建、
 *   有的纯静态），每次全量回归都要人肉记端口、手动串行。这个脚本把「跑哪些、用什么环境、
 *   环境没起时怎么办」收敛到一处，并把结果汇总成一张表。
 *
 * 退出码约定（沿用各关卡既有语义）：
 *   0 = 全部通过（或全部「通过 + 跳过」）
 *   1 = 至少一个断言失败
 *   3 = 环境不可用（所有关卡都因端口/产物没就绪而跳过）
 *
 * 用法：
 *   node oauth21/e2e/verify-all.mjs
 *   node oauth21/e2e/verify-all.mjs --dev 5174          # 覆盖 dev 实例端口
 *   node oauth21/e2e/verify-all.mjs --skip-prod         # 跳过需要生产构建的关卡
 *   node oauth21/e2e/verify-all.mjs --only static       # 只跑静态关卡（无浏览器/服务器）
 *   node oauth21/e2e/verify-all.mjs --list              # 只打印关卡清单，不跑
 *
 * 端口约定（与 docs/frontend/multi-theme.md §十、MEMORY §9 一致）：
 *   5174 = dev（默认实例）  5177 = compact 版式实例  5197 = color-peer 专用
 *   5189 = dist 预览（生产构建，量流量/验 SW 用）
 *
 * 关卡清单（权威口径）与每个关卡的用途/环境见同目录 VERIFY.md。
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
// 关卡所在目录 = oauth21/e2e/，oauth21 就是上一级
const OA = join(HERE, '..');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const flagVal = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const DEV = flagVal('--dev', 'http://127.0.0.1:5174');
const COMPACT = flagVal('--compact', 'http://127.0.0.1:5177');
const COLOR_PEER = flagVal('--color-peer', 'http://127.0.0.1:5197');
const PROD = flagVal('--prod', 'http://127.0.0.1:5189');
const ONLY = flagVal('--only', 'all');
const SKIP_PROD = flag('--skip-prod');

// 每一组关卡：{ name, cmd:[...], needs: {port?, dist?} }
// needs 里的值用于「环境没就绪 → 跳过」而不是「跑出一片红」。
const GROUPS = [
  {
    title: '① 静态关卡（无浏览器 / 无服务器）',
    only: 'static',
    items: [
      { name: 'verify-theme-dirs', cmd: ['verify-theme-dirs.mjs'], needs: {} },
      { name: 'verify-glob-device', cmd: ['verify-glob-device.mjs'], needs: {} },
      // 2026-09-28 新增：别名三处一致（aliases.ts ↔ tsconfig.app.json ↔ vite 实解析）
      { name: 'verify-alias-single-source', cmd: ['verify-alias-single-source.mjs'], needs: {} },
      // 2026-09-28 新增：内核零框架耦合（防 packages/* 引入 vue → 静默双实例）
      { name: 'verify-kernel-zero-coupling', cmd: ['verify-kernel-zero-coupling.mjs'], needs: {} },
      // 2026-09-28 新增：console 剥离真生效（自建一次生产构建扫产物；Vite 8 下曾长期静默失效）
      { name: 'verify-console-strip', cmd: ['verify-console-strip.mjs'], needs: {} },
      // 2026-09-28 新增：类型逃逸清零（any/@ts-ignore 关在 types/external.ts 单一入口）
      { name: 'verify-no-any-debt', cmd: ['verify-no-any-debt.mjs'], needs: {} },
      { name: 'verify-no-pwa', cmd: ['verify-no-pwa.mjs', '--dir', 'dist-nopwa'], needs: { dist: join(OA, 'dist-nopwa') } },
    ],
  },
  {
    title: '② dev 实例关卡（默认 5174）',
    only: 'dev',
    items: [
      { name: 'verify-panel-v3', cmd: ['verify-panel-v3.mjs', DEV], needs: { port: DEV } },
      { name: 'verify-tablet-landing', cmd: ['verify-tablet-landing.mjs', DEV], needs: { port: DEV } },
      { name: 'verify-tone-memory', cmd: ['verify-tone-memory.mjs', DEV], needs: { port: DEV } },
      { name: 'verify-tone-unified', cmd: ['verify-tone-unified.mjs', DEV], needs: { port: DEV } },
      { name: 'verify-login-view', cmd: ['verify-login-view.mjs'], needs: { port: DEV } },
      { name: 'verify-register-view', cmd: ['verify-register-view.mjs'], needs: { port: DEV } },
      { name: 'verify-forgot-view', cmd: ['verify-forgot-view.mjs'], needs: { port: DEV } },
      { name: 'verify-view-priority', cmd: ['verify-view-priority.mjs', DEV, '--env-base', COMPACT], needs: { port: DEV } },
      { name: 'verify-mobile-forgot', cmd: ['verify-mobile-forgot.mjs'], needs: { port: DEV } },
    ],
  },
  {
    title: '③ 特殊端口关卡',
    only: 'special',
    items: [
      { name: 'verify-color-peer', cmd: ['verify-color-peer.mjs', COLOR_PEER], needs: { port: COLOR_PEER } },
      { name: 'verify-first-paint-budget', cmd: ['verify-first-paint-budget.mjs', COMPACT], needs: { port: COMPACT } },
      { name: 'verify-colors-in-views', cmd: ['verify-colors-in-views.mjs', DEV], needs: { port: DEV } },
    ],
  },
  {
    title: '④ 生产构建关卡（dist 预览 5189）',
    only: 'prod',
    skipIf: SKIP_PROD,
    items: [
      { name: 'verify-responsive-switch', cmd: ['verify-responsive-switch.mjs', PROD], needs: { port: PROD } },
      { name: 'verify-sw-migration', cmd: ['verify-sw-migration.mjs', PROD, join(OA, 'dist-nopwa')], needs: { port: PROD, dist: join(OA, 'dist-nopwa') } },
    ],
  },
];

function portUp(url) {
  const m = /:\/\/([^:/]+):(\d+)/.exec(url);
  if (!m) return false;
  const [, host, port] = m;
  return new Promise((resolve) => {
    const s = net.connect(Number(port), host);
    let done = false;
    const finish = (ok) => { if (!done) { done = true; s.destroy(); resolve(ok); } };
    s.setTimeout(800, () => finish(false));
    s.on('connect', () => finish(true));
    s.on('error', () => finish(false));
    s.on('timeout', () => finish(false));
  });
}

function runOne(item) {
  const { name, cmd } = item;
  const r = spawnSync(process.execPath, cmd.map((c) => c), {
    cwd: HERE,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    name,
    code: r.status,
    tail: (r.stdout || '').split('\n').filter(Boolean).slice(-3).join(' | '),
    errTail: (r.stderr || '').split('\n').filter(Boolean).slice(-2).join(' | '),
  };
}

function printList() {
  console.log('关卡清单（权威口径见 VERIFY.md）：\n');
  for (const g of GROUPS) {
    console.log(g.title);
    for (const it of g.items) console.log(`  - ${it.name}`);
    console.log('');
  }
}

if (flag('--list')) {
  printList();
  process.exit(0);
}

async function main() {
  if (ONLY !== 'all' && !GROUPS.some((g) => g.only === ONLY)) {
    console.error(`未知 --only 值：${ONLY}（可选 static|dev|special|prod）`);
    process.exit(2);
  }

  const results = [];
  let failed = 0;
  let skipped = 0;
  let ran = 0;

  for (const g of GROUPS) {
    if (ONLY !== 'all' && g.only !== ONLY) continue;
    if (g.skipIf) {
      console.log(`\n⏭️  跳过 ${g.title}（--skip-prod）`);
      continue;
    }
    console.log(`\n══════ ${g.title} ══════`);
    for (const it of g.items) {
      // 环境预检
      let ready = true;
      let why = '';
      if (it.needs.port) {
        ready = await portUp(it.needs.port);
        if (!ready) why = `端口未就绪 ${it.needs.port}`;
      }
      if (ready && it.needs.dist && !existsSync(it.needs.dist)) {
        ready = false;
        why = `产物不存在 ${it.needs.dist}`;
      }
      if (!ready) {
        skipped++;
        console.log(`  ⏭️  ${it.name.padEnd(28)} 跳过（${why}）`);
        continue;
      }
      ran++;
      const r = runOne(it);
      results.push(r);
      const mark = r.code === 0 ? '✅' : '❌';
      if (r.code !== 0) failed++;
      console.log(`  ${mark} ${r.name.padEnd(28)} exit=${r.code}`);
      if (r.code !== 0) console.log(`       ${r.tail || r.errTail || '（无输出）'}`);
    }
  }

  console.log('\n════════════════ 汇总 ════════════════');
  console.log(`  通过：${ran - failed} / 运行 ${ran} · 跳过 ${skipped}`);
  if (failed > 0) {
    console.log(`  失败：${failed} 个关卡（见上 ❌）`);
    process.exit(1);
  }
  if (ran === 0) {
    console.log('  没有关卡真正运行 —— 环境未就绪（端口/产物都没起）');
    console.log('  起环境：先看 VERIFY.md 里的端口约定，串行起 dev / preview。');
    process.exit(3);
  }
  console.log('  全部通过 ✅');
  process.exit(0);
}

main();
