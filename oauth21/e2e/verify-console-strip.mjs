/**
 * console 剥离关卡：确认生产构建真的删掉了 console.*
 *
 * === 为什么要有这个关卡 ===
 * 🔴 2026-09-28 实测发现：本仓 `build.esbuild.drop: ['console']` **在 Vite 8 下完全无效**，
 *    生产产物里仍残留 **28 处 console.***（warn/error 为主）。
 *
 *    成因是"三重静默"：
 *      ① Vite 8 改用 Rolldown + Oxc，`build.esbuild` 已不是合法字段（顶部 `esbuild` 亦 deprecated）；
 *         正确入口是 `build.rolldownOptions.output.minify.compress.dropConsole`。
 *      ② `vite.config` 当时是 **`.js`**，从不参与 `vue-tsc -b` 类型检查 ⇒ 字段名写错无声。
 *      ③ 构建本身**成功**（exit 0），只是配置被忽略 —— 没有任何信号。
 *    ⇒ 改的时候是"有意图的保护"（防 Error 堆栈/内部标识泄露到 DevTools），
 *      但实际等于**根本没做**。这种"以为有、其实没有"的安全措施必须有关卡守。
 *
 * === 本关卡做什么 ===
 *   (1) 从 `vite.config.ts` 里断言 `dropConsole: true` 仍在（配置层防删除）
 *   (2) **真构建一次**（临时 outDir），扫产物确认 `console.*` 数量为 0（行为层防失效）
 *   (3) 反面对照：确认源码里**确实有** console 待删（否则"0 残留"是假绿 —— 可能源码本来就没有）
 *
 * ⚠️ 不依赖已存在的 dist（那是上一次构建的产物，可能是旧的）—— 本关卡自己构建。
 *
 * 退出码：0 通过 / 1 断言失败
 */
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let pass = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    failures.push(label);
    console.log(`  \u2717 ${label}${detail ? `  \u2192 ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------- 1) 配置层
console.log('== 1) vite.config.ts 配置层 ==');
const cfgPath = join(ROOT, 'vite.config.ts');
check('vite.config.ts 存在（已由 .js 改为 .ts，纳入类型检查）', existsSync(cfgPath), cfgPath);

const cfg = readFileSync(cfgPath, 'utf8');
check('配置里声明了 dropConsole: true', /dropConsole:\s*true/.test(cfg), '找不到 dropConsole: true');
check(
  '没有回退到失效的 build.esbuild.drop 写法',
  !/esbuild:\s*\{[^}]*drop:/.test(cfg),
  '仍在使用 Vite 8 下无效的 build.esbuild.drop'
);

// ---------------------------------------------------------------- 2) 源码对照（防假绿）
console.log('\n== 2) 源码对照（确认"有东西可删"） ==');
const srcDir = join(ROOT, 'src');
let srcConsoleCount = 0;
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(ts|vue|js)$/.test(entry.name)) {
      const hits = readFileSync(p, 'utf8').match(/console\.(log|warn|error|info|debug)/g);
      if (hits) srcConsoleCount += hits.length;
    }
  }
})(srcDir);
check(
  'src/ 下确实存在 console 调用（否则"0 残留"是假绿）',
  srcConsoleCount > 0,
  `源码里 0 处 console —— 关卡失去意义，请连同本关卡一起复核`
);
console.log(`    （参考：源码里共 ${srcConsoleCount} 处 console.*）`);

// ---------------------------------------------------------------- 3) 真构建 + 扫产物
console.log('\n== 3) 真构建并扫描产物 ==');
const outDirName = `dist-console-guard`;
const outDir = join(ROOT, outDirName);
try {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });

  console.log(`    构建中（--outDir ${outDirName}）…`);
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', outDirName], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  check('生产构建成功', true);
} catch (e) {
  check('生产构建成功', false, String(e.message).split('\n')[0]);
}

let distConsoleCount = 0;
const details = [];
const assetsDir = join(outDir, 'assets');
if (existsSync(assetsDir)) {
  for (const f of readdirSync(assetsDir)) {
    if (!f.endsWith('.js')) continue;
    const hits = readFileSync(join(assetsDir, f), 'utf8').match(/console\.(log|warn|error|info|debug)/g);
    if (hits) {
      distConsoleCount += hits.length;
      details.push(`${f}: ${hits.length}`);
    }
  }
}

check(
  '产物里 console.* 残留为 0',
  distConsoleCount === 0,
  distConsoleCount === 0 ? '' : `残留 ${distConsoleCount} 处 → ${details.join(', ')}`
);

// 清理临时产物（本关卡自产自销，不入库；gitignore 已覆盖 dist-*）
if (existsSync(outDir)) {
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch {
    /* 清理失败不影响判定 */
  }
}

// ---------------------------------------------------------------- 汇总
const total = pass + failures.length;
console.log(`\n===== ${failures.length === 0 ? '全绿' : '有失败'}：${pass}/${total} 通过 =====`);
if (failures.length) {
  console.log('失败项：');
  for (const f of failures) console.log(`  - ${f}`);
  console.log('\n提示：Vite 8 下删 console 的唯一入口是');
  console.log('  build.rolldownOptions.output.minify.compress.dropConsole = true');
  process.exit(1);
}
process.exit(0);
