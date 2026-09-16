/**
 * 依赖方向契约测试：`src/app/firewall` 的分层与无环约束
 *
 * 为什么要有这两条契约：
 *
 * 1. **无环**。循环依赖在 ESM 下不会报错，只会让某些模块拿到「半初始化」的绑定，
 *    表现为难以复现的 `undefined` 或某个注册表凭空为空。本应用历史上已经出现过
 *    `engine/index.js ↔ engine/pipeline.js` 的真实环。更隐蔽的是
 *    `util/shared.js → dao/dao.js → util/redis.js` 这种**跨 3 个文件**的环，
 *    肉眼 review 根本看不出来。
 *
 * 2. **分层单向**。`interface/` 必须是依赖图最底层（零 import），`util/` 不得依赖
 *    上层的 `dao/` `engine/` `services/`。这两条是所有「拆环」动作能长期成立的前提 ——
 *    否则下一个人为了让 util 拿到配置，又会顺手写回 `import ... from '../dao/dao.js'`。
 *
 * 检测手段是 DFS 三色法（比肉眼可靠得多）。本测试文件自带**反例验证**：
 * 用一个内存构造的小图确认检测器真的能报出环 —— 否则「无环」这个结论可能只是
 * 检测器写坏了（本仓已有过「内联副本固化了与真身相反的结论」的先例）。
 *
 * @author yijiu2025
 * @since 2026-09-16
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';
import * as espree from 'espree';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const FIREWALL = path.join(ROOT, 'src/app/firewall');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

/** 收集文件内所有相对 import/export 的说明符（含动态 import） */
function collectRelativeSpecifiers(file) {
  const src = fs.readFileSync(file, 'utf8');
  const ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', loc: true });
  const found = [];

  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);

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
  return found.filter(x => typeof x.spec === 'string' && x.spec.startsWith('.'));
}

/** 把相对说明符解析成磁盘上的真实文件 */
function resolveSpecifier(fromFile, spec) {
  const abs = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [abs, `${abs}.js`, path.join(abs, 'index.js')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

/** 构建依赖图：文件 → Set(目标文件) */
function buildGraph(files) {
  const graph = new Map();
  for (const file of files) {
    const deps = new Set();
    for (const { spec } of collectRelativeSpecifiers(file)) {
      const to = resolveSpecifier(file, spec);
      if (to && files.includes(to)) deps.add(to);
    }
    graph.set(file, deps);
  }
  return graph;
}

/**
 * DFS 三色法找环
 *
 * @param {Map<string, Set<string>>} graph
 * @param {string[]} keys 图的节点（用 key 数组而非 graph.keys()，便于反例测试传入内存图）
 * @returns {string[][]} 每个环的节点路径（首尾同一节点）
 */
function findCycles(graph, keys) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map(keys.map(k => [k, WHITE]));
  const stack = [];
  const cycles = [];

  const dfs = u => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of graph.get(u) || []) {
      if (!graph.has(v)) continue;
      const c = color.get(v);
      if (c === GRAY) {
        const idx = stack.indexOf(v);
        cycles.push(stack.slice(idx).concat(v));
      } else if (c === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };

  for (const k of keys) if (color.get(k) === WHITE) dfs(k);

  // 去重：同一环从不同起点会被发现多次
  const seen = new Set();
  const unique = [];
  for (const cyc of cycles) {
    const key = [...cyc].sort().join('|');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(cyc);
    }
  }
  return unique;
}

const FILES = walk(FIREWALL);
const GRAPH = buildGraph(FILES);

describe('依赖方向契约：src/app/firewall 无循环依赖', () => {
  it('扫描范围有效（防路径写错导致空扫描假通过）', () => {
    expect(FILES.length).toBeGreaterThan(20);
    const paths = FILES.map(rel);
    expect(paths).toContain('src/app/firewall/index.js');
    expect(paths).toContain('src/app/firewall/dao/dao.js');
    expect(paths).toContain('src/app/firewall/dao/block-manager.js');
    expect(paths).toContain('src/app/firewall/interface/config-access.js');
    expect(paths).toContain('src/app/firewall/engine/pipeline.js');
  });

  it('依赖边非空（防解析口径写错导致所有文件都是零出边）', () => {
    const totalEdges = [...GRAPH.values()].reduce((n, s) => n + s.size, 0);
    expect(totalEdges).toBeGreaterThan(50);
  });

  it('检测器本身有效：能报出内存构造的环（否则下面的"无环"可能是假通过）', () => {
    const a = 'A';
    const b = 'B';
    const c = 'C';
    const fake = new Map([
      [a, new Set([b])],
      [b, new Set([c])],
      [c, new Set([a])]
    ]);
    const cycles = findCycles(fake, [a, b, c]);
    expect(cycles.length).toBe(1);
    expect(cycles[0][0]).toBe(cycles[0][cycles[0].length - 1]);
  });

  it('检测器本身有效：无环图必须报告 0 个环（防误报）', () => {
    const fake = new Map([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
      ['C', new Set()]
    ]);
    expect(findCycles(fake, ['A', 'B', 'C']).length).toBe(0);
  });

  it('没有任何循环依赖', () => {
    const cycles = findCycles(GRAPH, FILES);
    const rendered = cycles.map(c => c.map(rel).join('\n    → ')).join('\n\n');
    expect(rendered).toBe('');
  });
});

describe('依赖方向契约：分层必须单向', () => {
  /**
   * 分层约定（越靠下越底层）：
   *   interface/  → 零依赖，只提供可注入接口
   *   config/ util/ → 只能依赖 interface/ 与系统层
   *   dao/        → 数据访问
   *   engine/     → 检测与响应
   *   services/ cli/ data/ → 应用编排
   *   index.js    → 应用入口，可以依赖任何人
   */
  it('interface/ 必须零内部依赖（它是拆环的依赖倒置点，一有依赖就重新成环）', () => {
    const offenders = [];
    for (const file of FILES) {
      if (!rel(file).includes('/firewall/interface/')) continue;
      const deps = GRAPH.get(file) || new Set();
      for (const to of deps) offenders.push(`${rel(file)} → ${rel(to)}`);
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('util/ 不得依赖上层的 dao/ engine/ services/ data/', () => {
    const offenders = [];
    for (const file of FILES) {
      const fromRel = rel(file);
      if (!/\/firewall\/util\//.test(fromRel)) continue;
      for (const to of GRAPH.get(file) || new Set()) {
        if (/\/(dao|engine|services|data)\//.test(rel(to))) {
          offenders.push(`${fromRel} → ${rel(to)}`);
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('config/ 不得依赖 dao/ engine/ services/', () => {
    const offenders = [];
    for (const file of FILES) {
      const fromRel = rel(file);
      if (!/\/firewall\/config\//.test(fromRel)) continue;
      for (const to of GRAPH.get(file) || new Set()) {
        if (/\/(dao|engine|services)\//.test(rel(to))) {
          offenders.push(`${fromRel} → ${rel(to)}`);
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('engine/ 不得依赖 services/（引擎是被编排方，不能反向调用编排层）', () => {
    const offenders = [];
    for (const file of FILES) {
      const fromRel = rel(file);
      if (!/\/firewall\/engine\//.test(fromRel)) continue;
      for (const to of GRAPH.get(file) || new Set()) {
        if (/\/firewall\/services\//.test(rel(to))) offenders.push(`${fromRel} → ${rel(to)}`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });
});

describe('存储实现不得回流到 engine/', () => {
  it('engine/dao 目录已撤销（封禁实现属于 dao 层）', () => {
    expect(fs.existsSync(path.join(FIREWALL, 'engine/dao'))).toBe(false);
  });

  it('dao/block-manager.js 就是真身，不再是 re-export 门面', () => {
    const shim = fs.readFileSync(path.join(FIREWALL, 'dao/block-manager.js'), 'utf8');
    // 若再次退化成纯转发，说明有人把实现搬回了别的目录 —— 那是本文件要防的回归
    const body = shim
      .replace(/\/\*\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .trim();
    expect(body).not.toMatch(/^export\s*\{[\s\S]*?\}\s*from\s*'[^']+';\s*$/);
    // 真身必须真的实现 setBlockForSubject（三维度封禁的核心入口）
    expect(shim).toMatch(/async\s+function\s+setBlockForSubject/);
  });

  it('engine/index.js 不再转发 dao 与 util 的符号（防止引擎假装成存储层入口）', () => {
    const barrel = fs.readFileSync(path.join(FIREWALL, 'engine/index.js'), 'utf8');
    const body = barrel.replace(/\/\*\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/from '\.\.\/dao\//);
    expect(body).not.toMatch(/from '\.\.\/util\//);
  });
});
