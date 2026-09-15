/**
 * 依赖方向契约测试：`src/` 不得依赖 `scripts/`
 *
 * 为什么要有这条契约：
 * `scripts/` 是**可选宿主**（CLI 入口、内置命令、发布脚本），不一定随部署一起安装。
 * 一旦 `src/` 里的代码 import 了 `scripts/`，就会形成 `src → scripts → src` 的依赖环，
 * 且打包/部署时路径直接解析失败。历史上 `src/app/<app>/cli/*.js` 就是这样
 * 反向 import `scripts/lib/{table,input,db}.js` 的。
 *
 * 允许的方向只有 `scripts/ → src/`（宿主依赖被宿主托管的代码）。
 *
 * @author yijiu2025
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';
import * as espree from 'espree';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SRC = path.join(ROOT, 'src');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
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

/** 递归遍历 AST，收集所有静态与动态 import 的说明符 */
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
      found.push({ value: node.source.value, line: node.loc.start.line });
    }

    if (node.type === 'ImportExpression' && node.source?.type === 'Literal') {
      found.push({ value: node.source.value, line: node.loc.start.line });
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      visit(node[key]);
    }
  };

  visit(ast);
  return found;
}

/** 相对说明符解析后是否落在 scripts/ 内 */
function landsInScripts(file, spec) {
  if (typeof spec !== 'string' || !spec.startsWith('.')) return false;
  const abs = path.resolve(path.dirname(file), spec);
  const r = path.relative(SCRIPTS_DIR, abs);
  return r !== '' && !r.startsWith('..') && !path.isAbsolute(r);
}

const FILES = walk(SRC);

describe('依赖方向契约：src/ 不得 import scripts/', () => {
  it('扫描范围有效（防路径写错导致空扫描假通过）', () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES.map(rel)).toContain('src/framework/cli/index.js');
    expect(FILES.map(rel)).toContain('src/app/firewall/cli/blocks.js');
  });

  it('扫描器确实能识别出 import（防解析口径写错导致假通过）', () => {
    const probe = FILES.find(f => rel(f) === 'src/framework/cli/index.js');
    const specs = collectSpecifiers(
      espree.parse(fs.readFileSync(probe, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', loc: true })
    );
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.map(s => s.value)).toContain('./table.js');
  });

  it('没有任何 src 文件 import scripts/ 下的模块', () => {
    const offenders = [];

    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      const ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', loc: true });

      for (const { value, line } of collectSpecifiers(ast)) {
        const textual = /(^|\/)scripts\//.test(String(value));
        if (textual || landsInScripts(file, value)) {
          offenders.push(`${rel(file)}:${line} → ${value}`);
        }
      }
    }

    expect(offenders.join('\n')).toBe('');
  });

  it('CLI 工具库已迁到 src/framework，scripts/lib 不再持有副本', () => {
    for (const p of [
      'src/framework/cli/table.js',
      'src/framework/cli/input.js',
      'src/framework/cli/index.js',
      'src/framework/db/models.js'
    ]) {
      expect(fs.existsSync(path.join(ROOT, p))).toBe(true);
    }

    for (const p of ['scripts/lib/table.js', 'scripts/lib/input.js', 'scripts/lib/db.js']) {
      expect(fs.existsSync(path.join(ROOT, p))).toBe(false);
    }
  });
});

describe('模型加载契约：工厂函数必须被调用', () => {
  const MODELS_PATH = path.join(ROOT, 'src/framework/db/models.js');

  it('loadAllModels 必须真正调用模型工厂（历史缺陷：只 import 不调用 → 注册 0 个模型）', () => {
    const src = fs.readFileSync(MODELS_PATH, 'utf8');
    // 模型文件默认导出的是工厂函数 (sequelize, DataTypes) => Model，
    // 仅 `await import(path)` 不会注册任何模型 —— 这正是旧 scripts/lib/db.js 的失效形态。
    expect(src).toMatch(/modelDefine\s*\(\s*sequelize\s*,\s*DataTypes\s*\)/);
  });

  it('不得再出现手工维护的模型清单（应按目录扫描，避免漏加载）', () => {
    const src = fs.readFileSync(MODELS_PATH, 'utf8');

    // 声明/赋值式清单（注释里提到历史名字不算，故只匹配赋值形态）
    expect(src).not.toMatch(/MODEL_IMPORT_ORDER\s*=\s*\[/);
    // 更本质的判据：任何硬编码的「某个具体模型文件路径」都意味着清单又要手工维护
    expect(src).not.toMatch(/['"][^'"]*models\/\w+\/\w+\.js['"]/);
    // 扫描入口必须来自目录遍历
    expect(src).toMatch(/readdirSync\s*\(/);
  });

  it('应用 loader 与 CLI 共用同一个扫描器（避免两份实现漂移）', () => {
    const loader = fs.readFileSync(path.join(ROOT, 'src/framework/loader/registry/06-models.js'), 'utf8');
    expect(loader).toMatch(/from '\.\.\/\.\.\/db\/models\.js'/);
    expect(loader).toMatch(/scanModels\s*\(/);
  });
});
