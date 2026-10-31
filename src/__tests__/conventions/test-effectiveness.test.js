/**
 * 测试有效性守卫
 *
 * 固化约定：**测试文件必须真实加载被测代码**（毒丸判据：把被测模块改成
 * `throw new Error('__QUARANTINE__')`，本文件应当变红）。
 *
 * ## 为什么从「正则」改成「AST + 路径解析」
 *
 * 旧实现用三条文本正则判断"有没有加载项目代码"，且都不区分注释与字符串：
 *
 *   const hasRelativeImport = src => /from\s+['"]\.\.?\//.test(src);
 *   const hasDynamicImport  = src => /await\s+import\(|import\(\s*['"]/.test(src);
 *
 * 结果有三种零成本绕过（均已实测确认）：
 *   1. 在**注释**里写一句 `import ... from '../dao/dao.js'` ——
 *      `conventions/firewall-layering.test.js` 就是这样"通过"的；
 *   2. 在**断言夹具字符串**里出现 `from './colors.js'` ——
 *      `conventions/terminal-colors.test.js` 有 5 处这样的命中；
 *   3. `await import('crypto')`（Node 内建）或 `await import('@fastify/cookie')`（三方）——
 *      `dao.test.js` / `service.test.js` / `integration/signature.test.js` 靠这一句通过，
 *      而它们的正文全是自证常量或内联副本。
 *
 * 现在的判据只有一条：**存在一个 import 说明符，它解析后落在仓库内、且在
 * `src/__tests__/` 之外的真实文件上**。注释、字符串、内建模块、三方包都不满足。
 *
 * ## 白名单
 *
 * 只允许两类：① 读文件系统做静态断言的结构守卫；② 本文件自身。
 * 每条都必须写明理由，且本文件会反向校验：白名单条目必须真实存在、必须真的读 fs。
 *
 * @author yijiu2025
 * @since 2026-09-16
 * @since 2026-10-31 检测方式由文本正则改为 AST + 仓库内路径解析
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const TESTS = path.join(ROOT, 'src/__tests__');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__snapshots__']);

/**
 * 白名单：这些测试**设计上**就是零 import 的结构守卫（读文件系统做静态断言），
 * 不代表它们失效。新增条目必须写明理由 —— 不允许把「纯常量自测」塞进来。
 */
const STRUCTURAL_GUARD_WHITELIST = new Map([
  ['conventions/export-placement.test.js', 'AST 校验 export 位置/形式，读源码而非 import 被测模块'],
  ['conventions/node-redis-v5-commands.test.js', '扫描源码文本校验 node-redis v5 命令名'],
  ['conventions/app-isolation.test.js', '扫描源码 import 语句校验跨应用边界'],
  ['conventions/firewall-layering.test.js', 'AST 构建依赖图做 DFS 找环，断言对象是"文件间的边"'],
  ['conventions/no-scripts-import.test.js', 'AST 扫描 src/ 是否 import scripts/，断言对象是说明符'],
  ['conventions/terminal-colors.test.js', '读 colors.js 源码文本，校验输出用 IS_TTY 判断而非直读 stdout'],
  ['conventions/test-effectiveness.test.js', '本文件：扫描全部测试文件的 import 图，天然不 import 被测模块']
]);

/**
 * 存量遗留清单（**冻结**，只减不增）。
 *
 * 2026-10-30 已清零；2026-10-31 把检测方式改成 AST 后保持为空 ——
 * 也就是说"没有豁免通道"这句话现在是真的（旧正则版本下并非如此）。
 */
const KNOWN_INEFFECTIVE_TESTS = new Set([]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.test.js')) out.push(full);
  }
  return out;
}

const rel = f => path.relative(TESTS, f).replace(/\\/g, '/');

/** 收集 AST 里全部模块说明符（静态 import / re-export / 动态 import），带行号 */
function collectSpecifiers(ast) {
  const found = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.source
    ) {
      found.push({ spec: node.source.value, line: node.loc.start.line });
    }
    if (node.type === 'ImportExpression' && node.source?.type === 'Literal') {
      found.push({ spec: node.source.value, line: node.loc.start.line });
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      visit(node[key]);
    }
  };
  visit(ast);
  return found.filter(x => typeof x.spec === 'string');
}

/** 相对说明符解析成磁盘上的真实文件（支持省略 .js 与目录 index.js） */
function resolveExistingFile(fromFile, spec) {
  const abs = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [abs, `${abs}.js`, path.join(abs, 'index.js')]) {
    try {
      if (fs.statSync(cand).isFile()) return cand;
    } catch {
      /* 不存在就试下一个 */
    }
  }
  return null;
}

/**
 * 说明符是否真的加载了「仓库内的被测代码」
 *
 * 三条同时满足才算：
 *   1. 是相对路径（`node:crypto` / `@fastify/cookie` / 裸包名一律不算）；
 *   2. 解析后落在仓库根之内（防止 `../../../some-outside-file` 凑数）；
 *   3. 落在 `src/__tests__/` **之外**（防止只 import 另一个测试 helper 就通关）。
 */
function loadsProjectCode(fromFile, spec) {
  if (!spec.startsWith('.')) return false;

  const resolved = resolveExistingFile(fromFile, spec);
  if (!resolved) return false;

  const relToRoot = path.relative(ROOT, resolved);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) return false;

  const relToTests = path.relative(TESTS, resolved);
  const insideTests = !relToTests.startsWith('..') && !path.isAbsolute(relToTests);
  return !insideTests;
}

/** 是否 import 了工作区自有包（wb-*），这类同样算加载了被测代码 */
const loadsWorkspacePackage = spec => /^wb-[a-z-]+$/.test(spec);

/**
 * 判定一个测试文件是否加载了被测代码
 *
 * @param {string} file 测试文件绝对路径（自检时可传一个不存在的路径）
 * @param {string} [source] 源码，缺省时读文件
 * @returns {{ ok: boolean, specs: Array<{spec: string, line: number}> }}
 */
function inspectTestFile(file, source) {
  const src = source ?? fs.readFileSync(file, 'utf8');
  const ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', loc: true });
  const specs = collectSpecifiers(ast);
  const ok = specs.some(({ spec }) => loadsWorkspacePackage(spec) || loadsProjectCode(file, spec));
  return { ok, specs };
}

describe('测试有效性守卫', () => {
  const files = walk(TESTS);

  it('应当扫描到测试文件（防止路径写错导致守卫空转）', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('🔴 检测器有牙：只 import 内建/三方模块的测试必须被判为无效', () => {
    const fakeFile = path.join(TESTS, '__selfcheck__.test.js');
    const fake = [
      "import { describe, it, expect } from '@jest/globals';",
      "import crypto from 'node:crypto';",
      "const x = await import('crypto');",
      "import Fastify from 'fastify';"
    ].join('\n');
    expect(inspectTestFile(fakeFile, fake).ok).toBe(false);
  });

  it('🔴 检测器有牙：注释与字符串里出现相对路径不算加载项目代码', () => {
    const fakeFile = path.join(TESTS, '__selfcheck2__.test.js');
    const fake = [
      "import { describe, it, expect } from '@jest/globals';",
      "// 以前这里写过 import { a } from '../framework/auth/cookie.js'",
      'const fixture = "import { C } from \'./colors.js\'";',
      'expect(fixture.length).toBeGreaterThan(0);'
    ].join('\n');
    expect(inspectTestFile(fakeFile, fake).ok).toBe(false);
  });

  it('检测器不误伤：真实 import 仓库内模块（含动态 import）应判为有效', () => {
    const fakeFile = path.join(TESTS, '__selfcheck3__.test.js');
    expect(inspectTestFile(fakeFile, "import { isIpMatch } from '../utils/ip.js';\n").ok).toBe(true);
    expect(inspectTestFile(fakeFile, "const m = await import('../utils/ip.js');\n").ok).toBe(true);
  });

  it('检测器不误伤：只 import 测试目录内的 helper 不算加载被测代码', () => {
    const fakeFile = path.join(TESTS, '__selfcheck4__.test.js');
    expect(inspectTestFile(fakeFile, "import { connectTestRedis } from './helpers/redis-connection.js';\n").ok).toBe(
      false
    );
  });

  it('🔴 不得新增「未加载被测代码」的测试文件（存量已冻结，只减不增）', () => {
    const offenders = [];

    for (const f of files) {
      const key = rel(f);
      if (STRUCTURAL_GUARD_WHITELIST.has(key)) continue;
      if (KNOWN_INEFFECTIVE_TESTS.has(key)) continue;

      if (!inspectTestFile(f).ok) offenders.push(key);
    }

    if (offenders.length > 0) {
      const lines = offenders.map(k => `  - src/__tests__/${k}`).join('\n');
      throw new Error(
        `以下测试文件未加载任何被测代码，属于虚假覆盖（删除被测模块后仍会全绿）：\n${lines}\n\n` +
          `修法二选一：\n` +
          `  1) 改为 import 真实模块并用真实驱动断言（参考 integration/signature.test.js）；\n` +
          `  2) 若确为「读文件系统做静态断言」的结构守卫，加入 STRUCTURAL_GUARD_WHITELIST 并写明理由。\n` +
          `注意：KNOWN_INEFFECTIVE_TESTS 是存量冻结清单，**不接受新增条目**。`
      );
    }

    expect(offenders).toEqual([]);
  });

  it('存量清单条目的形态必须保持不变（改造完成后应删除该条目）', () => {
    const stillIneffective = [];

    for (const key of KNOWN_INEFFECTIVE_TESTS) {
      const full = path.join(TESTS, key);
      if (!fs.existsSync(full)) continue;
      if (inspectTestFile(full).ok) stillIneffective.push(key);
    }

    expect(stillIneffective).toEqual([]);
  });

  it('存量清单中的文件必须真实存在或已被删除（防止条目失效后无人清理）', () => {
    const missing = [];
    for (const key of KNOWN_INEFFECTIVE_TESTS) {
      if (!fs.existsSync(path.join(TESTS, key))) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('存量清单规模不得扩张（防绕过：把新违规偷塞进冻结清单）', () => {
    const FROZEN_SIZE = 0;
    expect(KNOWN_INEFFECTIVE_TESTS.size).toBeLessThanOrEqual(FROZEN_SIZE);
  });

  it('白名单中的条目必须真实存在（防止条目失效后无人清理）', () => {
    const all = new Set(files.map(rel));
    const stale = [...STRUCTURAL_GUARD_WHITELIST.keys()].filter(k => !all.has(k));
    expect(stale).toEqual([]);
  });

  it('白名单不得包含明显是「纯常量自测」的文件（含大量手写字面量断言）', () => {
    // 启发式：结构守卫读文件系统 → 必有 fs/path import；
    // 若无，则它既没 import 被测代码也不读文件，不可能是正当的结构守卫。
    const notGuards = [];

    for (const [key, reason] of STRUCTURAL_GUARD_WHITELIST) {
      const src = fs.readFileSync(path.join(TESTS, key), 'utf8');
      const readsFs = /from\s+['"]node:fs['"]|from\s+['"]fs['"]/.test(src);
      if (!readsFs) notGuards.push({ key, reason });
    }

    if (notGuards.length > 0) {
      const detail = notGuards.map(g => `  - ${g.key}（登记理由：${g.reason}）`).join('\n');
      throw new Error(
        `以下白名单条目既未 import 被测代码，也不读文件系统，不可能是结构守卫，请移除并修复该测试：\n${detail}`
      );
    }

    expect(notGuards).toEqual([]);
  });
});
