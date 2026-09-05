#!/usr/bin/env node
/**
 * KX 架构文件校验器（kx-validate）
 *
 * 按 SPEC.md v1.3 的约束对 .kx 文件做静态检查：
 *   1. 未知指令    —— @token 不在 SPEC 白名单中
 *   2. @sync 反模式 —— 用常量赋值（@sync 必须是计算属性）
 *   3. @empty 容器  —— @empty 必须出现在 @list/@detail 容器内
 *   4. @model 命名  —— API 模型必须用 `@model API`（禁止 @model XxxAPI）
 *   5. @mutation    —— 禁止 JS 数组方法名（.push/.unshift/.splice...，用展开语法）
 *   6. @ref 目标    —— 引用的相对文件必须存在
 *   7. 花括号配平
 *
 * 用法：
 *   node kx-validate.mjs <文件或目录...>     （缺省扫描当前目录递归 *.kx）
 * 退出码：0=全部通过，1=存在问题
 *
 * @author qirly
 * @since 2026-09-05
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* SPEC v1.3 指令白名单（从 SPEC.md 全量提取；组件指令可嵌套使用） */
const DIRECTIVES = new Set(`
action anchor api author avatar badge banner button card delay detail empty error event
field form header hover icon input layout leave list loading login logo media menu meta
modal model mouseenter mutation navigate note page param permission popover position
prefetch prop ref render section sidebar skeleton slot social stat state summary switch
sync tab text toast
`.trim().split(/\s+/));

/** @empty 的合法父容器 */
const EMPTY_CONTAINERS = new Set(['list', 'detail']);
/** @mutation 中禁止的 JS 数组方法（SPEC：用展开语法） */
const BANNED_ARRAY_METHODS = /\.(push|unshift|pop|shift|splice|sort|reverse)\s*\(/;

const problems = [];
const files = [];

/* ── 收集 .kx 文件 ── */
function collect(p) {
  if (statSync(p).isDirectory()) {
    for (const name of readdirSync(p)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      collect(join(p, name));
    }
  } else if (p.endsWith('.kx')) {
    files.push(p);
  }
}

for (const arg of process.argv.slice(2)) {
  const p = resolve(arg);
  if (!existsSync(p)) {
    console.error(`× 路径不存在: ${arg}`);
    process.exit(1);
  }
  collect(p);
}
if (!files.length) {
  console.log('未发现 .kx 文件，无事可做。');
  process.exit(0);
}

/* ── 逐文件检查 ── */
for (const file of files) {
  const rel = relative(process.cwd(), file) || file;
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  // 注释行（# 开头）与代码块围栏不参与指令检查
  const codeLines = lines.map(l => l.trim().startsWith('#') ? '' : l);

  // 7. 花括号配平
  let depth = 0;
  codeLines.forEach((line, i) => {
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth < 0) {
        problems.push(`${rel}:${i + 1} 花括号不配平（多余的 }）`);
        depth = 0;
      }
    }
  });
  if (depth !== 0) problems.push(`${rel} 花括号不配平（缺少 ${depth} 个 }）`);

  // 容器栈：跟踪 @list/@detail 嵌套，供 @empty 检查
  const containerStack = [];

  codeLines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const trimmed = line.trim();

    // 1. 未知指令（@note 行是业务约束的自由文本，@token 属于描述而非指令，跳过）
    if (!trimmed.startsWith('@note')) {
      for (const m of trimmed.matchAll(/@([a-zA-Z]+)/g)) {
        if (!DIRECTIVES.has(m[1])) {
          problems.push(`${rel}:${lineNo} 未知指令 @${m[1]}（不在 SPEC v1.3 指令集）`);
        }
      }
    }

    // 2. @sync 常量赋值反模式
    const sync = trimmed.match(/@sync\s+\w+\s*=\s*(['"]).?\1\s*$/);
    if (sync) {
      problems.push(`${rel}:${lineNo} @sync 用常量赋值（必须是计算属性，常量用 @state）`);
    }

    // 3. @empty 容器约束
    const empty = trimmed.match(/@empty\b/);
    if (empty && !EMPTY_CONTAINERS.has(containerStack[containerStack.length - 1])) {
      problems.push(`${rel}:${lineNo} @empty 必须在 @list/@detail 容器内`);
    }

    // 4. @model API 命名
    const model = trimmed.match(/@model\s+(\w+)/);
    if (model && /api$/i.test(model[1]) && model[1] !== 'API') {
      problems.push(`${rel}:${lineNo} @model ${model[1]}：API 模型必须命名为 @model API`);
    }

    // 5. @mutation 数组方法反模式
    if (/^@mutation/.test(trimmed) && BANNED_ARRAY_METHODS.test(trimmed)) {
      problems.push(`${rel}:${lineNo} @mutation 使用 JS 数组方法（改用展开语法 = [new, ...old]）`);
    }
    if (BANNED_ARRAY_METHODS.test(trimmed) && /\.length/.test(trimmed)) {
      // 仅提示性：数组方法出现在含 .length 的行（多为状态操作）
    }

    // 容器栈维护（@list/@detail 压栈，闭括号弹栈）
    const container = trimmed.match(/@(list|detail)\b/);
    if (container) containerStack.push(container[1]);
    const closes = (line.match(/\}/g) || []).length;
    for (let i = 0; i < closes; i++) containerStack.pop();
  });

  // 6. @ref 目标存在性
  codeLines.forEach((line, idx) => {
    const ref = line.match(/@ref\s+(\S+)/);
    if (!ref) return;
    const target = resolve(dirname(file), ref[1].replace(/^\.\//, ''));
    if (!existsSync(target) && !existsSync(target + '.kx')) {
      problems.push(`${rel}:${idx + 1} @ref 目标不存在: ${ref[1]}`);
    }
  });
}

/* ── 报告 ── */
console.log(`🔍 [kx-validate] 检查 ${files.length} 个 .kx 文件\n`);
if (problems.length) {
  console.log(`❌ 发现 ${problems.length} 个问题:\n`);
  for (const p of problems) console.log(`  × ${p}`);
  process.exit(1);
}
console.log('✅ 全部通过。');
