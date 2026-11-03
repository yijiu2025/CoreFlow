// scripts/canvas/scan.mjs — 静态扫描后端 src/，生成函数调用图数据
// 用法: node scripts/canvas/scan.mjs   （或 npm run canvas:scan）
// 输出: docs/public/canvas/data.js （window.CANVAS_DATA = {...}）
// 页面: docs/public/canvas/index.html —— 文档站发布后即 https://yijiu2025.github.io/CoreFlow/canvas/
// 数据由 .github/workflows/canvas.yml 在每次推送到 main 时自动刷新并回提交
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');   // 仓库根（本文件在 scripts/canvas/ 下）
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'docs', 'public', 'canvas', 'data.js');

// ---------- 收集文件（排除测试） ----------
const EXCLUDE_DIRS = new Set(['__tests__']);
const EXCLUDE_FILE = /(\.test|\.spec)\.js$/;
function walkDir(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!EXCLUDE_DIRS.has(name)) walkDir(p, out);
    } else if (name.endsWith('.js') && !EXCLUDE_FILE.test(name)) out.push(p);
  }
  return out;
}
const files = walkDir(SRC);
const relSet = new Set(files.map((f) => relative(SRC, f).replaceAll('\\', '/')));

// ---------- AST 工具 ----------
function parse(code, file) {
  try {
    return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (e) {
    console.warn(`[skip] 解析失败 ${file}: ${e.message}`);
    return null;
  }
}
// 带注释收集的解析（文件头说明 / 函数说明）
function parse2(code, file, commentsOut) {
  try {
    return acorn.parse(code, {
      ecmaVersion: 'latest', sourceType: 'module', locations: true,
      onComment: (block, text, start, end, startLoc, endLoc) => {
        commentsOut.push({ block, text, start, end, line: startLoc.line, endLine: endLoc.line });
      },
    });
  } catch (e) {
    console.warn(`[skip] 解析失败 ${file}: ${e.message}`);
    return null;
  }
}
const DOC_MAX = 400; // 单条说明上限（字符）
function cleanDoc(text, block) {
  const lines = text.split('\n').map((l) => l.replace(/^\s*\/?\*+\/?\s?/, '').replace(/\*\/\s*$/, '').trim());
  const doc = lines.filter(Boolean).join(' ').trim();
  return doc.length > DOC_MAX ? doc.slice(0, DOC_MAX) + '…' : doc;
}
// 找某位置之前的最近文档注释（间隔 ≤3 行视为同一处说明）
function docFor(comments, beforePos, beforeLine) {
  let best = null;
  for (const c of comments) {
    if (c.end < beforePos && beforeLine - c.endLine <= 3 && beforeLine >= c.endLine) {
      if (!best || c.end > best.end) best = c;
    }
  }
  return best ? cleanDoc(best.text, best.block) : null;
}
function walk(node, visit, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, ancestors);
  ancestors.push(node);
  for (const key in node) {
    if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, ancestors);
    } else if (v && typeof v.type === 'string') walk(v, visit, ancestors);
  }
  ancestors.pop();
}

const BUILTINS = new Set(
  ('console,JSON,Math,Object,Array,String,Number,Boolean,Date,Promise,Set,Map,parseInt,parseFloat,' +
    'setTimeout,setInterval,clearTimeout,clearInterval,setImmediate,Buffer,process,require,fetch,' +
    'URL,URLSearchParams,TextEncoder,TextDecoder,crypto,performance,AbortController,AbortSignal,' +
    'Error,TypeError,RangeError,SyntaxError,Symbol,Reflect,Proxy,WeakMap,WeakSet,BigInt,isNaN,' +
    'encodeURIComponent,decodeURIComponent,structuredClone,queueMicrotask,Atomics,Intl,globalThis,' +
    'RegExp,Function,Event,EventTarget,CustomEvent,Response,Request,Headers,undefined')
    .split(',')
);

// import/export 的模块路径解析（相对路径归一到 src 内 rel）
function resolveModuleSrc(srcValue, rel) {
  const base = dirname(rel).replaceAll('\\', '/');
  const candidates = srcValue.startsWith('.')
    ? [posix.normalize(posix.join(base, srcValue))].flatMap((j) => [j, j + '.js', j + '/index.js'])
    : [srcValue, srcValue + '.js', srcValue + '/index.js'];
  return candidates.find((c) => relSet.has(c)) ?? null;
}

// ---------- 扫描阶段 ----------
const fileMap = new Map(); // rel -> 信息
const allFns = []; // {id, file, name, line, endLine, kind, exported}
const allVars = []; // 模块级变量 / 存储（Map/Set/对象…）
const allCalls = []; // {file, owner, name, obj, prop}
const fnRanges = new Map(); // rel -> [{id, start, end}]
const varRanges = new Map(); // rel -> [{id, start, end}]（模块级变量的初始化表达式，用于把初始化里的调用归给变量方框）
const envKeyCount = new Map(); // 环境变量 KEY -> 读取次数（含未归属到函数的顶层读取）
const edgeMap = new Map(); // f>t -> 边（提前到扫描阶段：env 归属即建边）
const RANK = { guess: 1, env: 2, var: 2, log: 3, ref: 3, import: 4, local: 5 };
function addEdge(f, t, kind, line) {
  if (!f || !t || f === t) return;
  const key = f + '>' + t;
  const l = (f.startsWith('file:') || kind === 'env') ? (line ?? null) : null; // 模块顶层调用 / env 读取记下行号
  const prev = edgeMap.get(key);
  if (prev) {
    if (RANK[kind] > RANK[prev.k]) prev.k = kind;
    if (prev.l == null && l != null) prev.l = l;
    return;
  }
  edgeMap.set(key, { f, t, k: kind, ...(l != null ? { l } : {}) });
}

for (const abs of files) {
  const rel = relative(SRC, abs).replaceAll('\\', '/');
  const seg = rel.split('/');
  // 模块 = 第一层目录；api 域细分到 api/<domain>；src 根目录下的散文件归「（根目录）」
  const dirs = seg.slice(0, -1);
  const group = dirs.length === 0 ? '（根目录）'
    : dirs[0] === 'api' && dirs.length > 1 ? 'api/' + dirs[1]
    : dirs[0] === 'framework' && dirs[1] === 'log' ? 'log' // 日志模块独立展示
    : dirs[0];
  const info = { id: rel, group, name: seg[seg.length - 1], path: 'src/' + rel, fns: [], vars: [], imports: [], reexports: [], localExports: [], defaultFnId: null, lineCount: 0, loggers: new Set(), superOf: new Map() };
  info.folder = dirname(rel).replaceAll('\\', '/');
  if (info.folder === '.') info.folder = '';
  fileMap.set(rel, info);

  const code = readFileSync(abs, 'utf8');
  info.lineCount = code.split('\n').length;
  const comments = [];
  const ast = parse2(code, rel, comments);
  if (!ast) continue;

  // 文件头说明：位于第一条语句之前的注释块（Program.start 恒为 0，不能用）
  info.doc = (() => {
    const firstStmt = ast.body[0]?.start ?? Infinity;
    const leading = comments.filter((c) => c.end <= firstStmt);
    if (!leading.length) return null;
    // 取文件顶部的注释段：从第一条开始，中间没被 >5 行空隙隔开的连续段
    const seg = [leading[0]];
    for (let i = 1; i < leading.length; i++) {
      if (leading[i].line - seg[seg.length - 1].endLine <= 5) seg.push(leading[i]);
      else break;
    }
    const doc = seg.map((c) => cleanDoc(c.text, c.block)).filter(Boolean).join('\n');
    return doc || null;
  })();

  const ranges = [];
  fnRanges.set(rel, ranges);
  const vRanges = [];
  varRanges.set(rel, vRanges);
  // 成员调用解析表：class 静态/实例方法、对象字面量方法
  info.classes = new Map(); // className/'(default)' -> {static:Map, inst:Map}
  info.objects = new Map(); // const 对象名 -> Map(prop -> fnId)
  info.exportedObjects = new Map(); // export const 对象名 -> Map(prop -> fnId)
  info.defaultClass = null; // export default class 的方法表
  info.defaultObject = null; // export default { ... } 的方法表

  const SRC_MAX = 6000; // 单函数源码上限（字符），超出截断
  const paramName = (p) => {
    if (!p) return null;
    if (p.type === 'Identifier') return p.name;
    if (p.type === 'AssignmentPattern') return paramName(p.left) + '=?';
    if (p.type === 'RestElement') return '...' + (paramName(p.argument) || '');
    if (p.type === 'ObjectPattern') return '{…}';
    if (p.type === 'ArrayPattern') return '[…]';
    return null;
  };
  const addFn = (name, node, kind, exported) => {
    const id = rel + '#' + name + '@' + node.loc.start.line;
    const params = (node.params ?? []).map(paramName).filter(Boolean);
    let src = code.slice(node.start, node.end);
    const truncated = src.length > SRC_MAX;
    if (truncated) src = src.slice(0, SRC_MAX) + '\n/* … 已截断，共 ' + (node.loc.end.line - node.loc.start.line + 1) + ' 行 */';
    const doc = docFor(comments, node.start, node.loc.start.line);
    allFns.push({ id, file: rel, name, line: node.loc.start.line, endLine: node.loc.end.line, kind, exported: !!exported, truncated, src, doc, params });
    info.fns.push(id);
    ranges.push({ id, start: node.start, end: node.end });
    return id;
  };

  walk(ast, (node, ancestors) => {
    const parent = ancestors[ancestors.length - 1] ?? null;
    if (node.type === 'ExportDefaultDeclaration' && node.declaration?.type === 'Identifier') info.defaultRefName = node.declaration.name;
    if (node.type === 'ImportDeclaration') {
      const target = resolveModuleSrc(node.source.value, rel);
      for (const sp of node.specifiers) {
        const imported =
          sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.type === 'ImportNamespaceSpecifier' ? '*' : sp.imported?.name ?? sp.local.name;
        info.imports.push({ local: sp.local.name, imported, target });
      }
      return;
    }
    // 文件末尾的统一导出块：export { foo, bar as baz }（定义在上面的形式）
    if (node.type === 'ExportNamedDeclaration' && !node.source) {
      for (const sp of node.specifiers ?? []) {
        if (sp.type === 'ExportSpecifier') {
          info.localExports.push({ exported: sp.exported?.name ?? sp.exported?.value, local: sp.local?.name ?? sp.local?.value });
        }
      }
    }
    // re-export（facade 门面）：export { x } from './y.js' / export * from './y.js'
    if (node.type === 'ExportNamedDeclaration' && node.source) {
      const target = resolveModuleSrc(node.source.value, rel);
      for (const sp of node.specifiers ?? []) {
        info.reexports.push({ imported: sp.local?.name ?? sp.local?.value, exported: sp.exported?.name ?? sp.exported?.value, target });
      }
      return;
    }
    if (node.type === 'ExportAllDeclaration') {
      info.reexports.push({ star: true, target: resolveModuleSrc(node.source.value, rel), exported: node.exported?.name ?? null });
      return;
    }
    // 模块级变量 / 存储（Map / Set / 对象 / 数组 / 实例）→ 变量方框
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      const atModule = ancestors.length <= 2 && !ancestors.some((a) => /Function/.test(a.type) || a.type === 'ArrowFunctionExpression');
      if (atModule) {
        const initNode = node.init;
        // 剥掉可选链外壳：process.env.X?.trim() → ChainExpression(CallExpression)
        let init = initNode;
        while (init && (init.type === 'ChainExpression' || init.type === 'TSAsExpression' || init.type === 'TSNonNullExpression')) init = init.expression;
        let vtype = null;
        if (init?.type === 'NewExpression') {
          const cn = init.callee?.name ?? '';
          vtype = /^(Map|WeakMap)$/.test(cn) ? 'map' : /^(Set|WeakSet)$/.test(cn) ? 'set' : 'instance';
        } else if (init?.type === 'ObjectExpression') vtype = 'object';
        else if (init?.type === 'ArrayExpression') vtype = 'array';
        else if (init?.type === 'CallExpression') vtype = init.callee?.name === 'createLogger' ? 'logger' : 'object';
        else if (init?.type === 'Literal' || init?.type === 'TemplateLiteral' || init?.type === 'BinaryExpression') vtype = 'primitive';
        // 取值常量：|| / && / 三元 / 一元 / 成员访问（env 读取大量长这形状）—— 它们同样需要一个方框，
        // 否则初始化里的 env/call 边只能挂到文件框上（曾把 PROXY_TRUST_CIDR、COOKIE_SECURE 等挂错位置）
        else if (init && /^(LogicalExpression|ConditionalExpression|UnaryExpression|MemberExpression|SequenceExpression|AwaitExpression)$/.test(init.type)) vtype = 'primitive';
        // 函数/箭头函数已是函数节点；纯别名（const x = someIdentifier）不入图，减少噪音
        if (vtype) {
          const name = node.id.name;
          const id = 'var:' + rel + '#' + name + '@' + node.loc.start.line;
          const exported = ancestors.some((a) => a.type === 'ExportNamedDeclaration');
          const storage = vtype !== 'primitive';
          const src = code.slice(node.start, Math.min(node.end, node.start + 240));
          allVars.push({ id, file: rel, name, line: node.loc.start.line, type: vtype, storage, exported, src });
          // 初始化表达式里的调用归到这个变量方框（例如 const X = resolveTimeoutMs(...) → X → resolveTimeoutMs）
          if (initNode) vRanges.push({ id, start: initNode.start, end: initNode.end });
          info.vars.push(id);
          if (!info.varsByName) info.varsByName = new Map();
          info.varsByName.set(name, id);
          if (vtype === 'logger') info.loggers.add(name); // const log = createLogger(...) → log.xxx() 归日志模块
        }
      }
      return;
    }
    // 函数定义
    let fnNode = null, kind = null, name = null;
    if (node.type === 'FunctionDeclaration') {
      fnNode = node; kind = node.async ? 'async function' : 'function'; name = node.id?.name ?? null;
    } else if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      fnNode = node;
      kind = node.type === 'ArrowFunctionExpression' ? 'arrow' : node.async ? 'async function' : 'function';
      if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') name = parent.id.name;
      else if (parent?.type === 'Property' || parent?.type === 'PropertyDefinition') {
        // registerSecureRoute(fastify, { name: 'banUser', handler: fn }) → 用兄弟 name 字段命名，区分多个 handler
        const obj = ancestors[ancestors.length - 2];
        const named =
          obj && (obj.type === 'ObjectExpression' || obj.type === 'ObjectPattern')
            ? (obj.properties ?? []).find(
                (p) => p?.type === 'Property' && !p.computed && p.key?.name === 'name' && p.value?.type === 'Literal'
              )
            : null;
        const key = (parent.key?.name || parent.key?.value || 'key') + '';
        // 配置回调：对象字面量作为调用实参（可多层嵌套），且没有 `name` 约定字段 → 不建节点
        // 例：Fastify({ logger: { serializers: { req(req){}, res(res){} } } })
        const insideCallArg = ancestors.some((a, i) => {
          const child = ancestors[i + 1];
          return (a.type === 'CallExpression' || a.type === 'NewExpression') && (a.arguments || []).includes(child);
        });
        if (insideCallArg && !named) return;
        name = named ? named.value.value : key;
      }
      else if (parent?.type === 'AssignmentExpression' && parent.left?.type === 'Identifier') name = parent.left.name;
      else if (parent?.type === 'AssignmentExpression' && parent.left?.type === 'MemberExpression') name = (parent.left.property?.name ?? '?') + '';
    } else if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      // class 作为一个整体节点（对象框），与函数并列；它的方法不单独出节点，
      // 方法里的调用会归属到 class 的范围内（这就是为什么不再出现 `constructor` 这种节点）
      const cname = node.id?.name
        ?? (parent?.type === 'ExportDefaultDeclaration' ? 'default' : null)
        ?? (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier' ? parent.id.name : null);
      if (!cname) return;
      const cid = addFn(cname, node, 'class', parent?.type === 'ExportNamedDeclaration' || parent?.type === 'ExportDefaultDeclaration');
      const prev = info.classes.get(cname);
      const rec = { id: cid, static: prev?.static ?? new Map(), inst: prev?.inst ?? new Map() };
      for (const m of [rec.static, rec.inst]) for (const [k, v] of m) if (!v) m.set(k, cid); // 回填方法名 → class 节点
      info.classes.set(cname, rec);
      if (node.superClass?.type === 'Identifier') info.superOf.set(cname, node.superClass.name);
      if (parent?.type === 'ExportDefaultDeclaration') { info.defaultClass = cid; info.defaultFnId = cid; }
      return;
    } else if (node.type === 'MethodDefinition' && node.value?.type === 'FunctionExpression') {
      // 只登记方法名（供 this.x() / X.x() 解析），不建节点
      const cls = [...ancestors].reverse().find((a) => a.type === 'ClassDeclaration' || a.type === 'ClassExpression');
      if (cls) {
        const key = cls.id?.name ?? (ancestors.some((a) => a.type === 'ExportDefaultDeclaration' && a.declaration === cls) ? 'default' : '(default)');
        let rec = info.classes.get(key);
        if (!rec) { rec = { id: null, static: new Map(), inst: new Map() }; info.classes.set(key, rec); }
        const mname = node.key?.name ?? '?';
        (node.static ? rec.static : rec.inst).set(mname, rec.id); // 值为 class 节点 id（可能稍后补上）
        if (rec.id && !(node.static ? rec.static : rec.inst).has(mname)) (node.static ? rec.static : rec.inst).set(mname, rec.id);
      }
      return;
    } else return;

    // 内联回调：作为调用参数 / 数组元素出现的匿名函数（如 arr.map(r => ...)）不单独成节点，
    // 其内部调用会自然归属到外层函数，避免图上出现一堆 `r => ...` 噪音节点
    // 匿名函数：一律不单独成节点（唯一例外是 export default 里的匿名函数，按 `default` 命名）
    // 覆盖：内联回调 fn(x=>..)、IIFE (()=>{})()、数组元素、return 的闭包、柯里化内层 a=>b=>..、
    //       三元/逻辑表达式里的箭头、class 方法的值（MethodDefinition 已建过节点）等
    if (!name) {
      if (parent?.type === 'ExportDefaultDeclaration') name = 'default';
      else return;
    }

    const exported = parent?.type === 'ExportNamedDeclaration' || parent?.type === 'ExportDefaultDeclaration';
    const id = addFn(name ?? `(匿名@${fnNode.loc.start.line})`, fnNode, kind, exported);
    if (exported && parent?.type === 'ExportDefaultDeclaration') info.defaultFnId = id;

    // ---- 登记对象字面量方法表（供 obj.x() 解析）；class 方法已在前面折叠，不进这里 ----
    if ((node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') && parent?.type === 'Property') {
      const objExpr = ancestors[ancestors.length - 2];
      const objParent = ancestors[ancestors.length - 3];
      if (objExpr?.type === 'ObjectExpression') {
        const prop = (parent.key?.name || parent.key?.value || '?') + '';
        if (objParent?.type === 'VariableDeclarator' && objParent.id?.type === 'Identifier') {
          const on = objParent.id.name;
          if (!info.objects.has(on)) info.objects.set(on, new Map());
          info.objects.get(on).set(prop, id);
          if (ancestors[ancestors.length - 4]?.type === 'ExportNamedDeclaration') {
            if (!info.exportedObjects.has(on)) info.exportedObjects.set(on, new Map());
            info.exportedObjects.get(on).set(prop, id);
          }
        } else if (objParent?.type === 'ExportDefaultDeclaration') {
          if (!info.defaultObject) info.defaultObject = new Map();
          info.defaultObject.set(prop, id);
        }
      }
    }
  });

  // export default <标识符>：把默认导出指到已登记的 class / 对象
  if (info.defaultRefName) {
    if (!info.defaultClass && info.classes.has(info.defaultRefName)) info.defaultClass = info.classes.get(info.defaultRefName)?.id ?? null;
    if (!info.defaultObject && info.objects.has(info.defaultRefName)) info.defaultObject = info.objects.get(info.defaultRefName);
  }

  // 调用 + 函数引用收集（先收集再统一归属，避免 walk 中嵌套状态）
  const pending = [];
  const pendingEnv = []; // process.env.KEY 读取点
  walk(ast, (node, ancestors) => {
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      const c = node.callee;
      if (c.type === 'Identifier') pending.push({ pos: node.start, line: node.loc.start.line, name: c.name, obj: null, prop: null, kind: 'call' });
      else if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier') {
        pending.push({ pos: node.start, line: node.loc.start.line, name: null, obj: c.object.name, prop: c.property?.name ?? null, kind: 'call' });
      } else if (c.type === 'Super') {
        let cls = '(default)';
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const a = ancestors[i];
          if (a.type === 'ClassDeclaration' || a.type === 'ClassExpression') { cls = a.id?.name ?? '(default)'; break; }
        }
        pending.push({ pos: node.start, line: node.loc.start.line, name: null, obj: 'super', prop: null, cls, kind: 'call' });
      } else if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'ThisExpression') {
        let cls = '(default)';
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const a = ancestors[i];
          if (a.type === 'ClassDeclaration' || a.type === 'ClassExpression') { cls = a.id?.name ?? '(default)'; break; }
        }
        pending.push({ pos: node.start, line: node.loc.start.line, name: null, obj: 'this', prop: c.property?.name ?? null, cls, kind: 'call' });
      }
      return;
    }
    // process.env.KEY 读取（含 process.env['KEY']）→ 环境变量模块
    if (node.type === 'MemberExpression') {
      const o = node.object;
      const isProcEnv = o?.type === 'MemberExpression' && !o.computed && o.object?.type === 'Identifier' && o.object.name === 'process' && o.property?.name === 'env';
      if (isProcEnv) {
        const pk = node.computed
          ? (node.property.type === 'Literal' && typeof node.property.value === 'string' ? node.property.value : null)
          : (node.property.type === 'Identifier' ? node.property.name : null);
        if (pk) pendingEnv.push({ pos: node.start, line: node.loc.start.line, key: pk });
      }
      return;
    }
    // 标识符引用（函数作为值传递：handler: someFn / preHandler: [guard] / return fn 等）
    if (node.type !== 'Identifier') return;
    const parent = ancestors[ancestors.length - 1];
    if (!parent) return;
    if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
    if (parent.type === 'Property' && parent.key === node && !parent.computed) return;
    if (
      (parent.type === 'VariableDeclarator' || parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ClassDeclaration') &&
      parent.id === node
    )
      return;
    if (
      (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression' || parent.type === 'ClassDeclaration') &&
      Array.isArray(parent.params) &&
      parent.params.includes(node)
    )
      return;
    if ((parent.type === 'BreakStatement' || parent.type === 'ContinueStatement' || parent.type === 'LabeledStatement') && parent.label === node) return;
    if (parent.type === 'ExportSpecifier' || parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportNamespaceSpecifier') return;
    if ((parent.type === 'CallExpression' || parent.type === 'NewExpression') && parent.callee === node) return; // 调用分支已处理
    if (BUILTINS.has(node.name)) return;
    pending.push({ pos: node.start, line: node.loc.start.line, name: node.name, obj: null, prop: null, kind: 'ref' });
  });

  // 归属顺序：最内层函数 → 模块级变量的初始化表达式 → 模块顶层（owner=null，挂文件框）
  for (const call of pending) {
    let best = null;
    for (const r of ranges) {
      if (call.pos >= r.start && call.pos <= r.end && (!best || r.end - r.start <= best.end - best.start)) best = r;
    }
    let owner = best?.id ?? null;
    if (!owner) {
      let vb = null;
      for (const r of vRanges) {
        if (call.pos >= r.start && call.pos <= r.end && (!vb || r.end - r.start <= vb.end - vb.start)) vb = r;
      }
      if (vb) owner = vb.id;
    }
    allCalls.push({ file: rel, owner, line: call.line, name: call.name, obj: call.obj, prop: call.prop, cls: call.cls ?? null, kind: call.kind });
  }
  // 环境变量读取：同样归属（函数 → 变量 init → 模块顶层），连到 var:env.<KEY> 虚拟方框
  for (const ev of pendingEnv) {
    let best = null;
    for (const r of ranges) {
      if (ev.pos >= r.start && ev.pos <= r.end && (!best || r.end - r.start <= best.end - best.start)) best = r;
    }
    let eowner = best?.id ?? null;
    if (!eowner) {
      let vb = null;
      for (const r of vRanges) {
        if (ev.pos >= r.start && ev.pos <= r.end && (!vb || r.end - r.start <= vb.end - vb.start)) vb = r;
      }
      if (vb) eowner = vb.id;
    }
    addEdge(eowner ?? 'file:' + rel, 'var:env.' + ev.key, 'env', ev.line);
    envKeyCount.set(ev.key, (envKeyCount.get(ev.key) ?? 0) + 1);
  }
}

// ---------- 导出索引 ----------
const fnById = new Map(allFns.map((f) => [f.id, f]));
const fileDefByName = new Map(); // rel -> Map(name -> fnId)（含非导出，用于同文件）
for (const f of fileMap.values()) {
  const m = new Map();
  for (const fid of f.fns) {
    const fn = fnById.get(fid);
    if (fn) m.set(fn.name, fid);
  }
  fileDefByName.set(f.id, m);
}
const exportedVarByName = new Map(); // rel -> Map(name -> varId)
for (const v of allVars) {
  if (!v.exported) continue;
  if (!exportedVarByName.has(v.file)) exportedVarByName.set(v.file, new Map());
  exportedVarByName.get(v.file).set(v.name, v.id);
}
// 文件末尾 `export { X }` 块导出的变量（如 preclose.js 的 DEFAULT_WS_SHUTDOWN_GRACE_MS）
for (const f of fileMap.values()) {
  for (const le of f.localExports) {
    const vid = f.varsByName?.get(le.local);
    if (!vid) continue;
    if (!exportedVarByName.has(f.id)) exportedVarByName.set(f.id, new Map());
    exportedVarByName.get(f.id).set(le.exported, vid);
  }
}
const exportedByName = new Map(); // rel -> Map(name -> fnId)
for (const f of fileMap.values()) {
  const m = new Map();
  for (const fid of f.fns) {
    const fn = fnById.get(fid);
    if (fn?.exported) m.set(fn.name, fid);
  }
  // 文件末尾 `export { foo, bar as baz }` 形式：映射到本地函数
  for (const le of f.localExports) {
    const fid = fileDefByName.get(f.id)?.get(le.local);
    if (fid) m.set(le.exported, fid);
  }
  exportedByName.set(f.id, m);
}

// ---------- 跨文件实体解析（穿透 facade re-export 链，带记忆化） ----------
const entityMemo = new Map();
function resolveEntity(rel, name, seen = new Set()) {
  if (!rel) return null;
  const key = rel + '|' + name;
  if (entityMemo.has(key)) return entityMemo.get(key);
  if (seen.has(rel)) return null;
  seen.add(rel);
  const f = fileMap.get(rel);
  if (!f) { entityMemo.set(key, null); return null; }
  let ent = null;
  if (name === 'default') {
    if (f.defaultFnId) ent = { fn: f.defaultFnId };
    else if (f.defaultClass) ent = { cls: f.defaultClass };
    else if (f.defaultObject) ent = { obj: f.defaultObject };
  } else {
    const fnId = exportedByName.get(rel)?.get(name);
    if (fnId) ent = { fn: fnId };
    else if (f.exportedObjects.has(name)) ent = { obj: f.exportedObjects.get(name) };
    else if (f.classes.has(name)) ent = { cls: f.classes.get(name).id };
    else if (f.objects.has(name)) ent = { obj: f.objects.get(name) };
    else if (exportedVarByName.get(rel)?.has(name)) ent = { var: exportedVarByName.get(rel).get(name) };
  }
  if (!ent) {
    for (const re of f.reexports) {
      if (re.star) {
        if (re.exported) { if (re.exported === name) ent = resolveEntity(re.target, 'default', seen); }
        else ent = resolveEntity(re.target, name, seen);
      } else if (re.exported === name) {
        ent = resolveEntity(re.target, re.imported, seen);
      }
      if (ent) break;
    }
  }
  entityMemo.set(key, ent);
  return ent;
}

// 函数名索引（跨文件同名推断）
const fnsByName = new Map();
for (const fn of allFns) {
  if (fn.name.startsWith('(')) continue;
  if (!fnsByName.has(fn.name)) fnsByName.set(fn.name, []);
  fnsByName.get(fn.name).push(fn.id);
}

// ---------- 调用解析 ----------

let unresolved = 0;
for (const call of allCalls) {
  const info = fileMap.get(call.file);
  // 模块顶层调用挂到文件框（file:rel），保证文件级出口完整
  const owner = call.owner ?? 'file:' + call.file;
  const isCall = call.kind === 'call';

  if (call.name) {
    if (BUILTINS.has(call.name)) continue;
    // 1) 同文件定义
    const local = fileDefByName.get(call.file)?.get(call.name);
    if (local) { addEdge(owner, local, isCall ? 'local' : 'ref', call.line); continue; }
    // 2) import 绑定（穿透 facade re-export）
    const binding = info.imports.find((i) => i.local === call.name);
    if (binding) {
      const k = isCall ? 'import' : 'ref';
      if (!binding.target) { if (isCall) unresolved++; continue; }
      const ent = resolveEntity(binding.target, binding.imported);
      if (ent?.fn) addEdge(owner, ent.fn, k, call.line);
      else if (ent?.cls) addEdge(owner, ent.cls, k, call.line);
      else if (ent?.var) addEdge(owner, ent.var, 'var', call.line);
      else addEdge(owner, 'file:' + binding.target, k, call.line);
      continue;
    }
    // 3) 模块级变量 / 存储引用（读取或写入）
    const vId = info.varsByName?.get(call.name);
    if (vId && !isCall) { addEdge(owner, vId, 'var', call.line); continue; }
    // 3.5) 本文件的 class（new X() / X() / class 作为值传递）
    const lcls = info.classes.get(call.name);
    if (lcls?.id) { addEdge(owner, lcls.id, 'local', call.line); continue; }
    // 4) 跨文件同名推断（仅调用；引用不推断——参数/局部变量误连率太高）
    if (isCall) {
      const cands = fnsByName.get(call.name);
      if (cands && cands.length === 1 && cands[0] !== owner) addEdge(owner, cands[0], 'guess', call.line);
      else if (!cands) unresolved++;
    }
  } else if (call.obj === 'super') {
    // 构造函数里的 super(...) → 父类节点
    const nm = info.superOf?.get(call.cls);
    const sid = nm ? (info.classes.get(nm)?.id ?? resolveEntity(info.id, nm)?.cls ?? null) : null;
    if (sid) addEdge(owner, sid, 'local', call.line);
  } else if (call.obj && call.prop) {
    // this.x() → 所在 class 的方法表（实例优先，静态兜底）
    if (call.obj === 'this') {
      const rec = info.classes.get(call.cls);
      const t = rec?.inst.get(call.prop) ?? rec?.static.get(call.prop);
      if (t) addEdge(owner, t, 'local', call.line);
      continue;
    }
    if (BUILTINS.has(call.obj)) continue;
    // 本地 class 静态方法 / 本地对象字面量方法
    const lc = info.classes.get(call.obj)?.static.get(call.prop);
    if (lc) { addEdge(owner, lc, 'local', call.line); continue; }
    const lo = info.objects.get(call.obj)?.get(call.prop);
    if (lo) { addEdge(owner, lo, 'local', call.line); continue; }
    // import 绑定（命名空间 / 默认 class / 默认对象 / 命名导出对象，穿透 facade）
    const binding = info.imports.find((i) => i.local === call.obj);
    if (binding?.target) {
      let targetFn = null;
      if (binding.imported === '*') { const e2 = resolveEntity(binding.target, call.prop); targetFn = e2?.fn ?? e2?.cls ?? null; }
      else {
        const ent = resolveEntity(binding.target, binding.imported);
        if (ent?.cls) targetFn = ent.cls;   // class 是整体节点：静态/实例方法都连它
        else if (ent?.obj) targetFn = ent.obj.get(call.prop) ?? null;
      }
      if (targetFn) addEdge(owner, targetFn, 'import', call.line);
      else addEdge(owner, 'file:' + binding.target, 'import', call.line);
    } else if (info.loggers?.has(call.obj)) {
      // 日志实例方法：log.warn/info/... → 日志模块（framework/log/index.js）。必须在 varsByName 之前：log 本身是变量节点
      addEdge(owner ?? 'file:' + call.file, 'file:framework/log/index.js', 'log', call.line);
    } else if (info.varsByName?.has(call.obj)) {
      // 存储/变量读写：Cache.get(...) / store.set(...)
      addEdge(owner, info.varsByName.get(call.obj), 'var', call.line);
    } else if (!fileDefByName.get(call.file)?.has(call.obj) && !info.objects.has(call.obj) && !info.classes.has(call.obj)) {
      unresolved++;
    }
  }
}

// ---------- 环境变量虚拟模块（process.env 读取分布） ----------
const envVars = [...envKeyCount.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([key, n]) => ({ id: 'var:env.' + key, file: 'virtual:env', name: key, line: null, type: 'env', storage: false, exported: false, src: null, readers: n }));
fileMap.set('virtual:env', {
  id: 'virtual:env', group: 'env', folder: '', name: 'process.env', path: '(虚拟) process.env',
  fns: [], vars: envVars.map((v) => v.id), imports: [], reexports: [], localExports: [],
  defaultFnId: null, lineCount: 0,
  doc: '虚拟模块：每个方框是一个环境变量键，右侧入边 = 读取它的函数 / 变量初始化',
});
for (const v of envVars) allVars.push(v);

// ---------- 分组 ----------
const groups = new Map();
for (const f of fileMap.values()) {
  if (!groups.has(f.group)) groups.set(f.group, []);
  groups.get(f.group).push(f.id);
}

// ---------- 文件夹层级（模块 → 文件夹 → 文件） ----------
const folderMap = new Map();
for (const f of fileMap.values()) {
  const key = f.folder || f.group; // 模块根目录下的文件归到同名文件夹
  if (!folderMap.has(key)) {
    folderMap.set(key, { id: key, name: f.folder ? basename(f.folder) : f.group.split('/').pop(), group: f.group, path: f.folder || '', files: [] });
  }
  folderMap.get(key).files.push(f.id);
}

// ---------- 输出 ----------
// 层序（前端从左到右分列、列内从上到下）：公共层(env/log/utils/shared) → framework → models → api 域 → app 入口最末（独占列且底对齐 = 最下面）
const GROUP_RANK = ['env', 'log', 'utils', 'shared', 'framework', 'models', 'api/auth', 'api/firewall', 'api/oauth21', 'api/user', 'api/posecraft', 'api/retroweb', 'api/admin', 'api/system', 'api/verify', 'api/notice', 'api', 'app', '（根目录）'];
const GROUP_NAME = { env: '环境变量', log: '日志' };
const data = {
  generatedAt: new Date().toISOString(),
  root: 'src/',
  stats: {
    files: fileMap.size,
    functions: allFns.length,
    variables: allVars.length,
    folders: folderMap.size,
    calls: edgeMap.size,
    envKeys: envVars.length,
    unresolved,
  },
  groups: [...groups.entries()].map(([id, fileIds]) => {
    const ri = GROUP_RANK.indexOf(id);
    return { id, name: GROUP_NAME[id] ?? id, files: fileIds, rank: ri >= 0 ? ri : GROUP_RANK.length };
  }),
  folders: [...folderMap.values()],
  files: [...fileMap.values()].map((f) => ({ id: f.id, group: f.group, folder: f.folder, name: f.name, path: f.path, lines: f.lineCount, fns: f.fns, vars: f.vars, doc: f.doc ?? null })),
  functions: allFns.map((f) => {
    const o = { id: f.id, file: f.file, name: f.name, line: f.line, endLine: f.endLine, kind: f.kind,
      exported: f.exported, truncated: f.truncated, src: f.src, doc: f.doc, params: f.params };
    if (f.kind === 'class') {
      const rec = fileMap.get(f.file)?.classes?.get(f.name);
      if (rec) o.methods = [...rec.inst.keys(), ...rec.static.keys()];
    }
    return o;
  }),
  variables: allVars,
  calls: [...edgeMap.values()],
};

const js =
  '// 由 scripts/canvas/scan.mjs 自动生成，请勿手改。重新生成: npm run canvas:scan\n' +
  'window.CANVAS_DATA = ' + JSON.stringify(data) + ';\n';
writeFileSync(OUT, js, 'utf8');

console.log(`✔ 已生成 docs/public/canvas/data.js`);
console.log(`  文件: ${data.stats.files}  函数: ${data.stats.functions}  调用边: ${data.stats.calls}  未解析调用点: ${data.stats.unresolved}`);
console.log(`  本地预览: npm run docs:dev → http://localhost:5173/CoreFlow/canvas/`);
