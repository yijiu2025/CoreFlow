#!/usr/bin/env node
/**
 * 跨内核渲染基线检查（静态断言）—— 规则全文见 `docs/frontend/browser-baseline.md`
 *
 * 为什么需要它：「同一个页面在不同浏览器不一样」这类问题，根源通常是**我们没写某个值**
 * （规范把它留给了用户代理）。静态断言能在提交前就把这类「漏写」拦下来，
 * 而不是等真机上冒出一条色带再回头查。
 *
 * 检查分两级：
 *   · 硬性项（FAIL）—— 任何前端都必须实现，缺一即退出码 1；
 *   · 提醒项（WARN）—— 只有该前端引入了对应机制时才校验，未引入只提示、不阻断。
 *
 * 用法：
 *   node scripts/check-browser-baseline.mjs            # 默认检查 oauth21
 *   node scripts/check-browser-baseline.mjs posecraft  # 检查指定前端目录
 *   npm run check:baseline
 *
 * 退出码：0 通过 / 1 有硬性项未实现 / 3 目标目录不可用
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.argv[2] || 'oauth21';
const APP_DIR = path.resolve(ROOT, TARGET);

/** 扫描时跳过的目录（构建产物、依赖、临时探针） */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.tmp-probe', 'public']);

const failures = [];
const warnings = [];
const passes = [];

/** 记录一条硬性断言结果 */
function assert(ok, id, title, detail) {
  (ok ? passes : failures).push({ id, title, detail });
}

/** 记录一条提醒项结果（不阻断） */
function warn(ok, id, title, detail) {
  if (!ok) warnings.push({ id, title, detail });
}

/** 递归收集目标目录下的文件（相对路径） */
function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** 读文件，失败返回空串（缺文件与读不了都按「没有这个内容」处理） */
function read(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

if (!existsSync(APP_DIR)) {
  console.error(`⛔ 目标目录不存在：${APP_DIR}`);
  process.exit(3);
}

const files = walk(APP_DIR);
const styleFiles = files.filter(f => /\.(scss|css)$/.test(f));
const styleText = styleFiles.map(read).join('\n');
const html = read(path.join(APP_DIR, 'index.html'));

console.log(`跨内核渲染基线检查 → ${TARGET}\n${'-'.repeat(56)}`);

/* ------------------------------------------------------------------
 * H1　viewport meta：单行 + 必需键 + 无实验键
 * 丢 meta 的两次真机事故：跨行书写（小米）、带 interactive-widget（夸克）
 * ------------------------------------------------------------------ */
const metaMatch = /<meta[^>]*name=["']viewport["'][^>]*>/i.exec(html);
const metaTag = metaMatch ? metaMatch[0] : '';
assert(Boolean(metaTag), 'H1', '存在 viewport meta', 'index.html 里没找到 <meta name="viewport">');
if (metaTag) {
  assert(
    !metaTag.includes('\n'),
    'H1',
    'viewport meta 写在同一行',
    'meta 标签跨行了 —— 实测小米浏览器会因此整条丢弃，退化成 980px 桌面布局'
  );
  assert(
    metaTag.includes('width=device-width') && metaTag.includes('initial-scale=1'),
    'H1',
    'viewport meta 含 width=device-width 与 initial-scale=1',
    `当前内容：${metaTag}`
  );
  assert(
    metaTag.includes('viewport-fit=cover'),
    'H1',
    'viewport meta 含 viewport-fit=cover',
    '少了它 env(safe-area-inset-*) 拿不到真实值，刘海/安全区适配失效'
  );
  const experimental = /interactive-widget/.test(metaTag);
  assert(
    !experimental,
    'H1',
    'viewport meta 不含实验键',
    '实测夸克浏览器会因 interactive-widget 整条丢弃 meta；键盘避让请交给 useKeyboardAvoid'
  );
}

/* ------------------------------------------------------------------
 * H2　color-scheme：不带 only 与带 only 各一条
 * ------------------------------------------------------------------ */
const schemeLines = styleText.match(/color-scheme\s*:[^;]+;/g) || [];
assert(schemeLines.length > 0, 'H2', '声明了 color-scheme', '初始值 normal 会让画布配色交给 UA 决定');
if (schemeLines.length > 0) {
  const plain = schemeLines.some(l => /:\s*(light|dark)\s*;/.test(l));
  const only = schemeLines.some(l => /:\s*only\s+(light|dark)\s*;/.test(l));
  const dark = schemeLines.some(l => /:\s*(only\s+)?dark\s*;/.test(l));
  assert(
    plain && only,
    'H2',
    'color-scheme 双条（兜底 + only）',
    `需要「不带 only」与「带 only」各一条：带 only 的禁 Auto Dark，不支持 only 的引擎会丢掉整条声明，故需前者兜住。当前 ${schemeLines.length} 条`
  );
  assert(dark, 'H2', '深色档也声明了 color-scheme', '只声明浅色档会让深色模式的画布配色回到 UA 手里');
}

/* ------------------------------------------------------------------
 * H3　画布底色：根元素显式 background-color 取自画布 token
 * ------------------------------------------------------------------ */
const canvasUse = /background(-color)?\s*:\s*var\(\s*--[\w-]*canvas\b/.test(styleText);
assert(
  canvasUse,
  'H3',
  '根元素画布底色取自画布 token',
  '需要形如 `background-color: var(--<前缀>-canvas, <兜底色>)` 的声明 —— 根元素背景会向上传播成整个画布，未定义时规范说「渲染是未定义的」'
);
const canvasDefined = /--[\w-]*canvas\s*:/.test(styleText);
warn(
  canvasDefined,
  'H3',
  '画布 token 有明确的赋值处',
  '只在 html 上引用、没有赋值处的话，画布色恒为兜底值；若页面最上沿会变透明，应由主题自己声明（见 B6）'
);

/* ------------------------------------------------------------------
 * H4　-webkit-text-size-adjust
 * ------------------------------------------------------------------ */
assert(
  /-webkit-text-size-adjust\s*:\s*100%/.test(styleText),
  'H4',
  '-webkit-text-size-adjust: 100%',
  '部分国产浏览器/WebView 会自行放大正文（「字比电脑上大一圈」）'
);

/* ------------------------------------------------------------------
 * H5　布局视口兜底的配套（仅当引入了兜底实现时校验）
 * ------------------------------------------------------------------ */
const vpfixTs = files.find(f => /viewport-fix\.(ts|js)$/.test(f));

/**
 * 真实入口文件：从 `index.html` 的 `<script src>` 反查。
 * 不靠「猜 main.ts」——名为 `index.ts` 的同名文件太多，猜错会指向无关模块。
 */
const entryFile = (() => {
  const tags = html.match(/<script[^>]*\bsrc=["'][^"']+["'][^>]*>/gi) || [];
  const src = tags
    .map(t => /src=["']([^"']+)["']/i.exec(t))
    .filter(Boolean)
    .map(m => m[1])
    .find(s => /\.[jt]s$/i.test(s));
  if (!src) return null;
  const guess = path.resolve(APP_DIR, src.replace(/^\//, ''));
  return existsSync(guess) ? guess : null;
})();

if (vpfixTs) {
  const entryText = entryFile ? read(entryFile) : '';
  const callAt = entryText.search(/\bsetupViewportFix\s*\(/);
  const mountAt = entryText.search(/\bcreateApp\s*\(/);
  assert(
    callAt !== -1,
    'H5',
    '入口调用了视口兜底',
    `${entryFile ? path.relative(ROOT, entryFile) : '入口文件'} 里没找到 setupViewportFix() 调用`
  );
  assert(
    callAt === -1 || mountAt === -1 || callAt < mountAt,
    'H5',
    '视口兜底在 createApp 之前调用',
    '挂载后才修正会「先画出错版式再跳变」；挂载前执行时全屏页尚未创建，首帧即正确'
  );
  assert(
    /zoom\s*:\s*var\(\s*--[\w-]*/.test(styleText) && /calc\(\s*[\d.]+dvh\s*\/\s*var\(/.test(styleText),
    'H5',
    '兜底的样式配套（zoom + calc(dvh / k)）',
    'zoom 不会除 viewport 单位 → 100dvh 会被多乘一次，必须配套 `height: calc(100dvh / var(--k))`'
  );
  warn(
    /\[data-[\w-]*(vpfix|viewport)[\w-]*\]/.test(styleText),
    'H5',
    '兜底样式限定在标记属性作用域内',
    '不限作用域会在正常手机（scale = 1）与桌面上也生效，属于无谓风险'
  );
} else {
  warnings.push({
    id: 'H5',
    title: '未引入布局视口兜底（可接受）',
    detail: '内核丢弃 viewport meta 时无法自救；是否引入见规则文档 B7'
  });
}

/* ------------------------------------------------------------------
 * 提醒项：全屏页贴顶（B5）—— 只在检测到全屏页高度写法时提示
 * ------------------------------------------------------------------ */
const hasFullHeightPage = /height\s*:\s*100dvh/.test(styleText);
if (hasFullHeightPage) {
  warn(
    /align-self\s*:\s*flex-start/.test(styleText),
    'B5',
    '全屏页贴容器顶部（align-self: flex-start）',
    '有 100dvh 全屏页但没贴顶：地址栏出现时 100vh > 100dvh，父级居中会在上下留缝，缝里露出祖先底色'
  );
}

/* ------------------------------------------------------------------ 输出 */

for (const p of passes) console.log(`  ✅ ${p.id} ${p.title}`);
if (failures.length) {
  console.log('');
  for (const f of failures) console.log(`  ❌ ${f.id} ${f.title}\n       ↳ ${f.detail}`);
}
if (warnings.length) {
  console.log('');
  for (const w of warnings) console.log(`  ⚠️  ${w.id} ${w.title}\n       ↳ ${w.detail}`);
}

console.log(`${'-'.repeat(56)}`);
console.log(
  `硬性项 ${passes.length} 通过 / ${failures.length} 未通过` +
    (warnings.length ? `；提醒 ${warnings.length} 条` : '') +
    `（规则：docs/frontend/browser-baseline.md）`
);

process.exit(failures.length ? 1 : 0);
