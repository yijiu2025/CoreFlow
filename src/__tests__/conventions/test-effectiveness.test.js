/**
 * 测试有效性守卫
 *
 * 固化约定：**测试文件必须真实加载被测代码**。
 *
 * 背景：本仓曾存在一批「看着在测、其实不加载被测代码」的测试文件 ——
 * 典型形态是手写一个响应常量再断言它有某字段，完全不 import 生产代码。
 * 毒丸实验（把被测文件覆写成 `throw new Error('__QUARANTINE__')`）证实：
 * 这类测试即使被测文件彻底损坏也照常全绿，属于**虚假覆盖**。
 *
 * 本守卫扫描 `src/__tests__/` 下所有 `*.test.js`，凡「零相对 import 且无动态 import()」
 * 者一律报错，除非登记在白名单中（白名单仅允许**结构守卫**类测试 ——
 * 它们设计上就是读文件系统做静态断言，不需要也不应该 import 生产代码）。
 *
 * 与 README/AGENTS 的约定互补：新写测试时若忘记 import，CI 会直接拦住。
 *
 * @author yijiu2025
 * @since 2026-09-16
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const TESTS = path.join(ROOT, 'src/__tests__');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__snapshots__']);

/**
 * 白名单：这些测试**设计上**就是零 import 的结构守卫（读文件系统做静态断言），
 * 不代表它们失效。新增条目必须写明理由 —— 不允许把「纯常量自测」塞进来。
 */
const STRUCTURAL_GUARD_WHITELIST = new Map([
  ['conventions/export-placement.test.js', '读源文件 AST 校验 export 位置/形式，天然不 import 被测模块'],
  ['conventions/node-redis-v5-commands.test.js', '扫描源码文本校验 node-redis v5 命令名，天然不 import 被测模块'],
  ['conventions/app-isolation.test.js', '扫描源码 import 语句校验跨应用边界，天然不 import 被测模块']
]);

/**
 * 存量遗留清单（**冻结**，只减不增）。
 *
 * 这些文件已被确认为「纯常量自测」类虚假覆盖（毒丸实验证实：被测模块损坏后仍全绿）。
 * 处置策略为「冻结存量 + 禁止新增」：
 *   - 存量保持现状，不阻塞 CI（逐个改造需逐个读生产代码，工作量独立评估）；
 *   - **不允许**向本清单新增条目 —— 新写的测试必须真实加载被测代码；
 *   - 每改造完一个文件，从本清单删除对应行（本测试会校验清单条目的真实性）。
 *
 * 2026-09-20 曾短暂清零（直接删除 14 个文件），应用户要求已恢复文件，
 * 清单同步回填 —— 改造完成后逐个摘除。
 */
const KNOWN_INEFFECTIVE_TESTS = new Set([
  'api-integration.test.js',
  'database-models.test.js',
  'edge-cases.test.js',
  'email-notification.test.js',
  'error-handling.test.js',
  'integration/app.test.js',
  'integration-flow.test.js',
  'jwt.test.js',
  'oauth-flow.test.js',
  'performance.test.js',
  'permission-loader.test.js',
  'permission-system.test.js',
  'rate-limiter.test.js',
  'security.test.js'
]);

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

/** 是否 import 了项目内模块（相对路径，如 '../framework/...' 或 './x.js'） */
function hasRelativeImport(src) {
  return /from\s+['"]\.\.?\//.test(src);
}

/** 是否有动态 import（await import('...')） */
function hasDynamicImport(src) {
  return /await\s+import\(|import\(\s*['"]/.test(src);
}

/** 是否 import 了项目包名（工作区内包，如 wb-logkit；排除 @jest/globals 等测试框架与 scoped 三方包） */
function hasWorkspaceImport(src) {
  // 只认工作区自有包名（wb-*），不认 @jest / @fastify 这类第三方
  return /from\s+['"]wb-[a-z-]+['"]/.test(src);
}

describe('测试有效性守卫', () => {
  const files = walk(TESTS);

  it('应当扫描到测试文件（防止路径写错导致守卫空转）', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('不得新增「未加载被测代码」的测试文件（存量已冻结，只减不增）', () => {
    const newOffenders = [];

    for (const f of files) {
      const key = rel(f);
      if (STRUCTURAL_GUARD_WHITELIST.has(key)) continue;
      if (KNOWN_INEFFECTIVE_TESTS.has(key)) continue; // 存量遗留，暂不阻塞

      const src = fs.readFileSync(f, 'utf8');
      // 仅 import @jest/globals、node: 内置、第三方包 → 视为未加载被测代码
      if (!hasRelativeImport(src) && !hasDynamicImport(src) && !hasWorkspaceImport(src)) {
        newOffenders.push(key);
      }
    }

    if (newOffenders.length > 0) {
      const lines = newOffenders.map(k => `  - src/__tests__/${k}`).join('\n');
      throw new Error(
        `以下测试文件未加载任何被测代码，属于虚假覆盖（删除被测模块后仍会全绿）：\n${lines}\n\n` +
          `修法二选一：\n` +
          `  1) 改为 import 真实模块并用真实驱动断言（推荐，参考 api-routes.test.js）；\n` +
          `  2) 若确为「读文件系统做静态断言」的结构守卫，加入 STRUCTURAL_GUARD_WHITELIST 并写明理由。\n` +
          `注意：KNOWN_INEFFECTIVE_TESTS 是存量冻结清单，**不接受新增条目**。`
      );
    }

    expect(newOffenders).toEqual([]);
  });

  it('存量清单条目的形态必须保持不变（改造完成后应删除该条目）', () => {
    // 若某文件已改造为「加载被测代码」，它不该继续留在冻结清单里 ——
    // 否则清单会逐渐名不副实，失去「待改造清单」的作用。
    const stillIneffective = [];

    for (const key of KNOWN_INEFFECTIVE_TESTS) {
      const full = path.join(TESTS, key);
      if (!fs.existsSync(full)) continue; // 已删除的文件，由下一条用例报告

      const src = fs.readFileSync(full, 'utf8');
      if (hasRelativeImport(src) || hasDynamicImport(src) || hasWorkspaceImport(src)) {
        stillIneffective.push(key);
      }
    }

    if (stillIneffective.length > 0) {
      const lines = stillIneffective.map(k => `  - src/__tests__/${k}`).join('\n');
      throw new Error(
        `以下文件已能加载被测代码（已改造完成），请从 KNOWN_INEFFECTIVE_TESTS 中删除对应条目：\n${lines}`
      );
    }

    expect(stillIneffective).toEqual([]);
  });

  it('存量清单中的文件必须真实存在或已被删除（防止条目失效后无人清理）', () => {
    const missing = [];
    for (const key of KNOWN_INEFFECTIVE_TESTS) {
      if (!fs.existsSync(path.join(TESTS, key))) missing.push(key);
    }

    if (missing.length > 0) {
      const lines = missing.map(k => `  - src/__tests__/${k}`).join('\n');
      throw new Error(`以下文件已不存在，请从 KNOWN_INEFFECTIVE_TESTS 中删除对应条目：\n${lines}`);
    }

    expect(missing).toEqual([]);
  });

  it('存量清单规模不得扩张（防绕过：把新违规偷塞进冻结清单）', () => {
    // 该断言把「清单长度」钉在当前值上。新增违规想混过检查，
    // 必须同时改这里 —— 那是一次可见的、需要理由的修改，而非静默绕过。
    // 2026-09-20 恢复 14 个存量伪测试文件，清单同步回填，冻结值回到 14。
    const FROZEN_SIZE = 14;
    expect(KNOWN_INEFFECTIVE_TESTS.size).toBeLessThanOrEqual(FROZEN_SIZE);
  });

  it('白名单中的条目必须真实存在（防止条目失效后无人清理）', () => {
    const all = new Set(files.map(rel));
    for (const key of STRUCTURAL_GUARD_WHITELIST.keys()) {
      expect(all.has(key)).toBe(true);
    }
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
