/**
 * utils 门面（entry）契约测试
 *
 * 2026-11-09 起 `src/utils/` 只对外暴露 `utils/index.js` 一个入口。这条约定不能用
 * "大家都记得"来维持 —— 它有三个具体的失效方式，每一种都不报错、只在半年后显出代价：
 *
 *   ① 有人从 `utils/crypto.js` 直接 import → 门面形同虚设，成员文件被当成公开 API，
 *      以后想合并/改名就要全仓 grep；
 *   ② `utils/cors.js` 反过来 import `./index.js` → 门面 ↔ 成员成环，拿到未初始化的绑定；
 *   ③ 新增一个 util 忘了挂到门面 → 调用方拿不到，只能又走回具体文件（规则①复发）。
 *
 * 另有一条依赖方向：`utils/` 是**零依赖叶子层**，成员不得 import `framework/**`。
 * 曾经唯一的越层者是 `ip.js`（要写非法 CIDR 的诊断日志），2026-11-09 已迁到
 * `framework/ingress/net/ip.js` —— 迁走后门面才真正"可被任何层 import"，
 * 这条不变量由本文件的第三条判据守着（不再有任何例外）。
 *
 * 配套的一条：`framework/support/log` 必须保持零 src 依赖（不得 import 门面）。
 * 它是全仓最底层，一旦反向依赖 utils，任何 import utils 的模块都会与 log 互锁。
 *
 * @author yijiu2025
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';
import * as espree from 'espree';
// 真加载门面：除了"删掉模块仍全绿"的反例，也让下面的完整性断言能对比**运行时**命名空间
import * as facadeNamespace from '../../utils/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SRC = path.join(ROOT, 'src');
const UTILS = path.join(SRC, 'utils');
const LOG_DIR = path.join(SRC, 'framework', 'support', 'log');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** 所有 import 声明的 source 值 */
function importSpecs(file) {
  const ast = espree.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', loc: true });
  return ast.body
    .filter(n => n.type === 'ImportDeclaration')
    .map(n => ({ spec: String(n.source.value), line: n.loc.start.line }));
}

/** 文件里 `export { a, b }` 具名导出的名字集合 */
function namedExports(file) {
  const ast = espree.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  const names = new Set();
  for (const node of ast.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    for (const s of node.specifiers || []) names.add(s.exported.name);
  }
  return names;
}

const isUnder = (file, dir) => file === dir || file.startsWith(dir + path.sep);

/** 把 import 的相对说明符解析成绝对路径（非相对说明符返回 null） */
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  return path.resolve(path.dirname(fromFile), spec);
}

/** 生产代码：src/** 去掉 utils 自身与 __tests__，外加根入口 index.js */
function productionTargets() {
  return [...walk(SRC), path.join(ROOT, 'index.js')].filter(
    f => !isUnder(f, UTILS) && !isUnder(f, path.join(SRC, '__tests__'))
  );
}

describe('utils 门面：唯一入口', () => {
  it('🔴 生产代码不得 import utils 的具体成员文件（必须走 utils/index.js）', () => {
    const offenders = [];

    for (const file of productionTargets()) {
      for (const { spec, line } of importSpecs(file)) {
        const resolved = resolveSpec(file, spec);
        // 只认 src/utils 下的成员；app 自己的 utils/（如 app/posecraft/utils/preview.js）不算
        if (!resolved || path.dirname(resolved) !== UTILS) continue;
        if (path.basename(resolved) === 'index.js') continue;
        offenders.push(`${rel(file)}:${line} → ${spec}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('🔴 utils 成员不得反向 import 门面（门面 → 成员 → 门面 会成环）', () => {
    const FACADE = path.join(UTILS, 'index.js');
    const offenders = [];
    for (const file of walk(UTILS)) {
      if (file === FACADE) continue;
      for (const { spec, line } of importSpecs(file)) {
        if (resolveSpec(file, spec) === FACADE) offenders.push(`${rel(file)}:${line} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('🔴 utils 是零依赖叶子层：成员不得 import framework/**（无例外）', () => {
    const FRAMEWORK = path.join(SRC, 'framework');
    const offenders = [];
    for (const file of walk(UTILS)) {
      if (path.basename(file) === 'index.js') continue;
      for (const { spec, line } of importSpecs(file)) {
        const resolved = resolveSpec(file, spec);
        if (!resolved || !isUnder(resolved, FRAMEWORK)) continue;
        offenders.push(`${rel(file)}:${line} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('🔴 framework/support/log 保持零 src 依赖：不得 import utils 门面', () => {
    const FACADE = path.join(UTILS, 'index.js');
    const offenders = [];
    for (const file of walk(LOG_DIR)) {
      for (const { spec, line } of importSpecs(file)) {
        if (resolveSpec(file, spec) === FACADE) offenders.push(`${rel(file)}:${line} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('门面完整性：每个成员的具名导出都已挂到 utils/index.js（静态 + 运行时双重核对）', () => {
    const declared = namedExports(path.join(UTILS, 'index.js'));
    const missing = [];

    for (const file of walk(UTILS)) {
      const name = path.basename(file);
      if (name === 'index.js') continue;
      for (const exported of namedExports(file)) {
        if (!declared.has(exported)) missing.push(`${name} 的 ${exported}`);
      }
    }
    expect(missing).toEqual([]);

    // 静态写了但没真正导出（拼接错误 / 拼错名字）→ 运行时命名空间里会缺
    const runtimeMissing = [...declared].filter(name => !(name in facadeNamespace));
    expect(runtimeMissing).toEqual([]);
  });
});
