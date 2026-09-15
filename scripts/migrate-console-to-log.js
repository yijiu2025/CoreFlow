/**
 * 一次性迁移脚本：console.* → framework/log
 *
 * 范围（仅后端）：根 index.js、src、migrations、scripts 下的 js 文件、根目录 mjs 文件
 * 跳过：src/framework/log 目录（日志框架本身）、测试文件、本脚本
 *
 * 规则：
 * - 非 CLI 代码：console.log/info → log.info，warn → log.warn，error → log.error，
 *   debug → log.debug（由 LOG_DEBUG 关键词门控），trace → log.trace
 * - CLI 类代码（cli/ 目录、scripts/、migrations/、根目录 *.mjs）：
 *   console.log/info → logStdout(...)（顶层导出的裸输出出口：无时间戳装饰、不受 LOG_LEVEL 门控），
 *   warn → log.warn，error → log.error，debug → log.debug，trace → log.trace
 * - 自动补 import：用到 logStdout 就导入它；用到 log.* 再补 createLogger('<tag>') 与 const log
 * - tag 由文件路径推导：src/app/firewall/cli/status.js → app.firewall.cli.status
 *
 * 幂等：重复运行不会重复插入 import/const。
 *
 * @author yijiu2025
 * @since 2026-09-10
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT = (...args) => process.stdout.write(args.join(' ') + '\n');

/* ----------------------------- 收集目标文件 ----------------------------- */

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

function collectTargets() {
  const targets = [];
  const isTest = p => /(^|[/\\])(__tests__|tests)([/\\])|\.test\.js$|\.spec\.js$/.test(p);
  const inLogFramework = p => p.includes(`${path.sep}framework${path.sep}log${path.sep}`);

  targets.push(path.join(ROOT, 'index.js'));
  for (const dir of ['src', 'migrations', 'scripts']) {
    for (const file of walk(path.join(ROOT, dir))) {
      if (!file.endsWith('.js')) continue;
      if (inLogFramework(file)) continue;
      if (isTest(file)) continue;
      if (file.endsWith('migrate-console-to-log.js')) continue;
      targets.push(file);
    }
  }
  for (const file of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (file.isFile() && file.name.endsWith('.mjs') && file.name !== 'migrate-console-to-log.mjs') {
      targets.push(path.join(ROOT, file.name));
    }
  }
  return targets;
}

/* ------------------------------ 核心替换 ------------------------------ */

/* 注意：logStdout 是**顶层导出**（不是 logger 实例方法），因此不带 binding 前缀，
   也无需 createLogger。历史上这里误写成 'log.stdout'，该 API 从不存在，导致全仓
   CLI/scripts 约 324 处调用在运行到输出语句时抛 TypeError。 */
const REPLACEMENTS_CLI = {
  log: 'logStdout',
  info: 'logStdout',
  warn: 'log.warn',
  error: 'log.error',
  debug: 'log.debug',
  trace: 'log.trace'
};
const REPLACEMENTS_APP = {
  log: 'log.info',
  info: 'log.info',
  warn: 'log.warn',
  error: 'log.error',
  debug: 'log.debug',
  trace: 'log.trace'
};

/** 该行是否为注释行（跳过替换，避免污染文档注释） */
function isCommentLine(trimmed) {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** 找到最后一个顶层 import 语句的结束行号（0-based），无则 -1 */
function findLastImportEnd(lines) {
  let last = -1;
  let depth = 0;
  let inImport = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (depth === 0 && /^import[\s{'"*]/.test(trimmed)) inImport = true;
    if (inImport) {
      for (const ch of line) {
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
      }
      const statementEnded = depth === 0 && /;\s*(\/\/.*)?$/.test(line);
      if (statementEnded) {
        last = i;
        inImport = false;
      }
      if (i - last > 40) break; // 防御：异常未闭合
    }
  }
  return last;
}

function computeTag(relPath) {
  let p = relPath.replace(/\\/g, '/').replace(/\.m?js$/, '');
  if (p === 'index') return 'server';
  if (p.startsWith('src/')) p = p.slice(4);
  return p.split('/').join('.');
}

function computeImportPath(file) {
  let rel = path.relative(path.dirname(file), path.join(ROOT, 'src', 'framework', 'log', 'index.js'));
  rel = rel.split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function freeBindingName(content) {
  const logTaken =
    /(^|\n)\s*(const|let|var)\s+log\s*[=;]/.test(content) ||
    // log 作为函数形参（会被局部遮蔽），换名规避
    /[((,]\s*log\s*[),]/.test(content);
  if (!logTaken) return 'log';
  const loggerTaken =
    /(^|\n)\s*(const|let|var)\s+logger\s*[=;]/.test(content) ||
    /[((,]\s*logger\s*[),]/.test(content) ||
    /\blogger\.(log|info|debug|trace|warn|error)\b/.test(content);
  if (!loggerTaken) return 'logger';
  let i = 2;
  while (new RegExp(`\\bappLog${i}\\b`).test(content)) i++;
  return `appLog${i}`;
}

function processFile(file) {
  const relPath = path.relative(ROOT, file);
  const original = fs.readFileSync(file, 'utf8');
  if (!/console\.(log|info|debug|trace|warn|error)\b/.test(original)) return null;

  const lines = original.split('\n');
  const cliLike =
    /(^|[/\\])(cli)([/\\])/.test(relPath) || /^(migrations|scripts)[/\\]/.test(relPath) || relPath.endsWith('.mjs');
  const map = cliLike ? REPLACEMENTS_CLI : REPLACEMENTS_APP;

  let replaced = 0;
  const out = lines.map(line => {
    const trimmed = line.trim();
    if (isCommentLine(trimmed) || !line.includes('console.')) return line;
    const next = line.replace(/\bconsole\.(log|info|debug|trace|warn|error)\b/g, (_, m) => map[m]);
    if (next !== line) replaced++;
    return next;
  });
  let content = out.join('\n');

  // 注入 import（+ 必要时的 const）（幂等：已引本模块则跳过）
  const hasImport = /from\s+['"][^'"]*framework\/log\/index\.js['"]/.test(content);
  if (!hasImport) {
    const binding = freeBindingName(content);
    const tag = computeTag(relPath);
    // 全文重绑定：若绑定名不是 log，需把 log.xxx 改成 binding.xxx。
    // 注意 logStdout 是顶层符号、不带前缀，不参与重绑定。
    if (binding !== 'log') {
      content = content.replace(/\blog\.(info|debug|trace|warn|error)\b/g, `${binding}.$1`);
    }
    // 按实际用到的符号决定导入内容：只用裸输出则不必引 createLogger/const
    const usesBinding = new RegExp(`\\b${binding}\\.(info|debug|trace|warn|error)\\b`).test(content);
    const usesStdout = /\blogStdout\(/.test(content);
    const names = [];
    if (usesBinding) names.push('createLogger');
    if (usesStdout) names.push('logStdout');
    if (!names.length) names.push('logStdout');
    const importLine = `import { ${names.join(', ')} } from '${computeImportPath(file)}';`;
    const insertAt = findLastImportEnd(content.split('\n')) + 1;
    const block = usesBinding ? [importLine, '', `const ${binding} = createLogger('${tag}');`] : [importLine];
    // 文件原本没有 import 时插入点在首行，补一个空行避免 import 紧贴代码
    if (insertAt === 0) block.push('');
    const lines2 = content.split('\n');
    lines2.splice(insertAt, 0, ...block);
    content = lines2.join('\n');
    replaced = replaced || 1;
  }

  if (replaced > 0) fs.writeFileSync(file, content, 'utf8');
  const leftover = (content.match(/console\./g) || []).length;
  return { relPath, cliLike, replaced, leftover };
}

/* -------------------------------- 主流程 -------------------------------- */

const results = [];
for (const file of collectTargets()) {
  try {
    const r = processFile(file);
    if (r) results.push(r);
  } catch (err) {
    OUT(`✗ 处理失败: ${path.relative(ROOT, file)} → ${err.message}`);
  }
}

let changed = 0;
for (const r of results) {
  if (r.replaced) changed++;
  const flag = r.replaced ? '✓' : '·';
  const warn = r.leftover ? `  ⚠ 残留 console 引用 ${r.leftover} 处，需人工处理` : '';
  OUT(`${flag} [${r.cliLike ? 'cli' : 'app'}] ${r.relPath}${warn}`);
}
OUT(`\n共扫描命中 ${results.length} 个文件，改写 ${changed} 个。`);
