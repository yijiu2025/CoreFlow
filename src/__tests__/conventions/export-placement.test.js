/**
 * 导出位置契约测试
 *
 * 固化项目约定：**所有 export 一律收拢到文件末尾**。
 *   1. 位置：任何 export 语句都不得出现在非 export 语句之前（导出集中在文件尾部）
 *   2. 形式：不得使用定义处行内导出
 *      - `export function foo() {}` / `export const x = 1` / `export class C {}`
 *      - `export default <表达式>`（须先命名或把函数具名化，再 `export default name;`）
 *
 * 为什么两条都要：位置判定对"整个文件只有一个 export 语句"会失效（它天然在末尾），
 * 必须用形式判定兜住 —— 否则 `export function foo() {}` 单语句文件会漏网。
 *
 * 与 eslint.config.js 的 `no-restricted-syntax`（files: src\/**\/*.js）互为兜底：
 * ESLint 拦住新写的代码，本测试提供跨文件的全局一致性视图与清晰报错。
 *
 * @author yijiu2025
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SRC = path.join(ROOT, 'src');
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

function parse(file) {
  return espree.parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
    loc: true
  });
}

const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

/** 规则 1：export 语句出现在非 export 语句之前 → 违规 */
function findStrayExports(ast, file) {
  const lastNonExport = ast.body.reduce((acc, n, i) => (n.type.startsWith('Export') ? acc : i), -1);
  return ast.body
    .map((n, i) => ({ n, i }))
    .filter(({ n, i }) => n.type.startsWith('Export') && i <= lastNonExport)
    .map(({ n }) => `${rel(file)}:${n.loc.start.line}`);
}

/** 规则 2：定义处行内导出 → 违规 */
function findInlineExports(ast, file) {
  const hits = [];
  for (const node of ast.body) {
    const at = `${rel(file)}:${node.loc.start.line}`;
    if (node.type === 'ExportNamedDeclaration' && node.declaration)
      hits.push(`${at} (export ${node.declaration.type})`);
    if (node.type === 'ExportDefaultDeclaration' && node.declaration.type !== 'Identifier') {
      hits.push(`${at} (export default ${node.declaration.type})`);
    }
  }
  return hits;
}

describe('导出位置契约：所有 export 收拢到文件末尾', () => {
  const files = walk(SRC);

  test('扫描范围有效（防止路径写错导致空扫描假通过）', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some(f => rel(f) === 'src/framework/auth/session-store.js')).toBe(true);
    expect(files.some(f => rel(f) === 'src/app.js')).toBe(true);
  });

  test('不存在"export 出现在文件中间"的文件', () => {
    const offenders = [];
    for (const file of files) offenders.push(...findStrayExports(parse(file), file));
    expect(offenders.join('\n')).toBe('');
  });

  test('不存在定义处行内导出（export function / const / class / 内联 default）', () => {
    const offenders = [];
    for (const file of files) offenders.push(...findInlineExports(parse(file), file));
    expect(offenders.join('\n')).toBe('');
  });

  test('有导出的文件，其最后一条语句必须是 export', () => {
    const offenders = [];
    for (const file of files) {
      const ast = parse(file);
      const exports = ast.body.filter(n => n.type.startsWith('Export'));
      if (exports.length === 0) continue;
      const last = ast.body[ast.body.length - 1];
      if (!last.type.startsWith('Export')) {
        offenders.push(`${rel(file)}: 末条语句是 ${last.type}（第 ${last.loc.start.line} 行），导出未落在文件最后`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });
});
