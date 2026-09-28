/**
 * 别名单一来源关卡：`config/aliases.ts` ↔ `tsconfig.app.json` paths ↔ vitest 实解析
 *
 * 背景：`@` / `skinsuite` / `stable-deviceid` 三个路径别名同时被三处消费：
 *   - `vite.config.ts`（构建 + dev server）
 *   - `vitest.config.ts`（单测）
 *   - `tsconfig.app.json` 的 `compilerOptions.paths`（类型检查）
 * 前两处已收敛到 `config/aliases.ts`（import 同一份）；第三处因为是静态 JSON
 * 无法 import，只能手写副本。
 *
 * 🔴 为什么必须有关卡：这类漂移**全都不报错** ——
 *   - vite/vitest 漏改 → 构建期 `Cannot find module`（还算显式）
 *   - tsconfig 漏改 → `vue-tsc -b` 可能退化成 any / 或报"找不到声明"，
 *     也可能因为路径仍存在（只是指向别处）而**完全静默**
 *   - aliases.ts 与 tsconfig 各指不同实现 → 类型检查用 A、运行用 B，最阴险
 * 所以这里做三件事：
 *   (1) 逐条比对 aliases.ts 与 tsconfig.app.json 的**语义一致**（解析到同一绝对路径）
 *   (2) 确认 aliases.ts 里每条在 tsconfig 里都有对应项（反之亦然）
 *   (3) 真起一次 vitest 的 alias 解析（用 vite 的 resolveConfig + resolveId 探针），
 *       确认 `skinsuite` / `stable-deviceid` 真的解析到 packages 下的 src/index.ts
 *       而不是 node_modules 里的 dist 目录
 *
 * 退出码：0 全绿 / 1 有失败
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..'); // oauth21/

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

/**
 * 读 JSONC（tsconfig 允许注释与尾逗号）。
 * ⚠️ 刻意**不**用「正则去注释」的土办法：tsconfig 里 `"@/*"` 这种键名本身含 `/*`，
 *    任何朴素的块注释正则会从它开始吃掉后面一大段（实测踩过）。
 *    这里用 TypeScript 自带的 `parseConfigFileTextToJson`，它就是 tsc 读 tsconfig 的实现。
 */
async function readJsonc(file) {
  const ts = await import('typescript');
  const text = readFileSync(file, 'utf8');
  const parsed = ts.parseConfigFileTextToJson(file, text);
  if (parsed.error) {
    throw new Error(
      `JSONC 解析失败：${ts.flattenDiagnosticMessageText(parsed.error.messageText, ' ')}`
    );
  }
  return parsed.config;
}

// ---------------------------------------------------------------- 1) 加载 aliases.ts
console.log('== 1) config/aliases.ts ==');
const aliasesFile = join(ROOT, 'config', 'aliases.ts');
check('config/aliases.ts 存在', existsSync(aliasesFile), aliasesFile);

let aliases = {};
let tsconfigPathsExport = {};
try {
  const mod = await import(pathToFileURL(aliasesFile).href);
  aliases = mod.aliases || {};
  tsconfigPathsExport = mod.tsconfigPaths || {};
} catch (e) {
  check('config/aliases.ts 可加载', false, e.message);
}

const aliasKeys = Object.keys(aliases).sort();
check(
  '导出 aliases 含 3 个键（@ / skinsuite / stable-deviceid）',
  aliasKeys.length === 3 && aliasKeys.join(',') === '@,skinsuite,stable-deviceid',
  `实际：${aliasKeys.join(', ') || '(空)'}`
);

// 解析出的绝对路径必须真实存在（否则构建期就是 Cannot find module）
for (const [k, v] of Object.entries(aliases)) {
  check(`alias ${JSON.stringify(k)} 指向的文件存在`, existsSync(v), v);
}

// 两个本地包必须指向源码（src/index.ts），不是 node_modules dist
for (const pkg of ['skinsuite', 'stable-deviceid']) {
  const target = aliases[pkg] || '';
  check(
    `${pkg} 指向 packages/*/src/index.ts（源码直供）`,
    /packages\/(theme-core|shared-device)\/src\/index\.ts$/.test(target.replace(/\\/g, '/')),
    `实际：${target}`
  );
  check(
    `${pkg} 不指向 node_modules`,
    !target.includes('node_modules'),
    `实际：${target}`
  );
}

// ---------------------------------------------------------------- 2) 与 tsconfig.app.json 比对
console.log('\n== 2) tsconfig.app.json paths 一致性 ==');
const tsconfigFile = join(ROOT, 'tsconfig.app.json');
check('tsconfig.app.json 存在', existsSync(tsconfigFile), tsconfigFile);

const tsconfig = await readJsonc(tsconfigFile);
const tsPaths = tsconfig.compilerOptions?.paths || {};

/**
 * 把 tsconfig 的相对 path（相对 tsconfig 所在目录 oauth21/）解析成绝对路径。
 * @ 那条写作 `@/*` → `./src/*`，比对时把 `/*` 去掉再比。
 */
function resolveTsPath(p) {
  return resolve(ROOT, p).replace(/\\/g, '/');
}

// @ → src
const tsAt = (tsPaths['@/*'] || [])[0];
check(
  'tsconfig `@/*` 与 aliases.ts 的 `@` 同源（都指 oauth21/src）',
  tsAt && resolveTsPath(tsAt).replace(/\/\*$/, '') === aliases['@'].replace(/\\/g, '/'),
  `tsconfig=${tsAt ? resolveTsPath(tsAt) : '(缺)'}  aliases=${aliases['@']}`
);

for (const pkg of ['skinsuite', 'stable-deviceid']) {
  const tsVal = (tsPaths[pkg] || [])[0];
  check(
    `tsconfig 声明了 "${pkg}"`,
    Boolean(tsVal),
    tsVal ? '' : '缺少该键'
  );
  if (tsVal) {
    check(
      `tsconfig "${pkg}" 与 aliases.ts 解析到同一文件`,
      resolveTsPath(tsVal) === aliases[pkg].replace(/\\/g, '/'),
      `tsconfig=${resolveTsPath(tsVal)}  aliases=${aliases[pkg]}`
    );
  }
}

// 反向：tsconfig 里的别名键，aliases.ts 里应当有非通配的对应项
const tsKeys = Object.keys(tsPaths);
for (const k of tsKeys) {
  const base = k.replace(/\/\*$/, '');
  if (base === '@') continue; // @/* 已在上面单比
  check(
    `tsconfig 键 "${k}" 在 aliases.ts 里有对应项`,
    Object.prototype.hasOwnProperty.call(aliases, base) || Object.prototype.hasOwnProperty.call(aliases, k),
    `aliases 里有：${aliasKeys.join(', ')}`
  );
}

// 自描述：aliases.ts 导出的 tsconfigPaths 应与真实 tsconfig 一致（防两处又抄一遍）
if (Object.keys(tsconfigPathsExport).length) {
  const exported = JSON.stringify(tsconfigPathsExport, Object.keys(tsconfigPathsExport).sort());
  const actual = JSON.stringify(
    Object.fromEntries(Object.entries(tsPaths).sort(([a], [b]) => a.localeCompare(b)))
  );
  check(
    'aliases.ts 导出的 tsconfigPaths 与真实 tsconfig.app.json 一致',
    exported === actual,
    exported === actual ? '' : `导出=${exported}\n    实际=${actual}`
  );
}

// ---------------------------------------------------------------- 3) 真解析探针（vite resolve）
console.log('\n== 3) vite/vitest 实解析探针 ==');
let server;
try {
  server = await createServer({
    root: ROOT,
    configFile: join(ROOT, 'vitest.config.ts'),
    server: { middlewareMode: true },
    logLevel: 'silent'
  });

  for (const [spec, expectSuffix] of [
    ['skinsuite', 'packages/theme-core/src/index.ts'],
    ['stable-deviceid', 'packages/shared-device/src/index.ts']
  ]) {
    try {
      const resolved = await server.pluginContainer.resolveId(spec, join(ROOT, 'src', '__probe__.ts'));
      const id = (resolved && resolved.id) || '';
      const norm = id.replace(/\\/g, '/');
      check(
        `运行期解析 ${JSON.stringify(spec)} → ${expectSuffix}`,
        norm.endsWith(expectSuffix),
        `实际：${id || '(未解析)'}`
      );
    } catch (e) {
      check(`运行期解析 ${JSON.stringify(spec)}`, false, e.message);
    }
  }
} catch (e) {
  check('起 vite 解析探针', false, e.message);
} finally {
  if (server) await server.close();
}

// ---------------------------------------------------------------- 汇总
const total = pass + failures.length;
console.log(`\n===== ${failures.length === 0 ? '全绿' : '有失败'}：${pass}/${total} 通过 =====`);
if (failures.length) {
  console.log('失败项：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
