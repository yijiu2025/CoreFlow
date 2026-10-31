/**
 * 文档相对链接关卡
 *
 * 扫描仓库内的 Markdown，检查 `[文本](相对路径)` 与 `![alt](相对路径)` 指向的文件
 * 是否真实存在。外链（http/https/mailto）与纯锚点跳过。
 *
 * 为什么单独成关：审查报告（U20）实测有 70+ 处失效相对链接，属于「复制即踩坑」
 * 的一类——链接指向已删除/移动的文件时，读者拿到的是 404，而不是旧内容。
 * 这类问题不会让任何测试变红，只能靠静态扫描兜住。
 *
 * 🔴 判据必须与「干净检出」一致：文档里指向 `oauth21/`（独立仓）、`phonecopy/`（嵌套仓）
 * 这类**不被本仓跟踪**的目录是有意为之（给开发者指路到真实源码），它们在 CI 的 checkout
 * 里并不存在。用 `existsSync` 判定就会得到「本地绿、CI 红」。所以未命中时先查 git 索引：
 *   - 目标在 `docs/` 内 → 必验（文档站自己的页面，缺了就是死链）；
 *   - 目标在 `docs/` 外且未被跟踪 → 视为外部指针，跳过并计数（不静默：会打印条数）。
 *
 * 用法：
 *   node scripts/verify/doc-links.mjs          # 检查（有失效链接 ⇒ 退出码 1）
 *   node scripts/verify/doc-links.mjs --list   # 仅打印全部链接映射，不做断言
 *
 * 退出码：0 通过 / 1 存在失效链接
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');

/** 扫描根目录（相对仓库根）。刻意不含 node_modules / packages 内第三方文档。 */
const SCAN_ROOTS = [
  'docs',
  'reports',
  '.github',
  'README.md',
  'README.zh-CN.md',
  'CONTRIBUTING.md',
  'SECURITY.md'
];

/** 递归收集 Markdown 文件 */
function collect(target, out = []) {
  const abs = path.join(ROOT, target);
  if (!existsSync(abs)) return out;
  const st = statSync(abs);
  if (st.isFile()) {
    if (abs.endsWith('.md')) out.push(abs);
    return out;
  }
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    collect(path.join(target, name), out);
  }
  return out;
}

/**
 * 抽取一行里的链接目标
 *
 * 只处理行内链接语法，跳过围栏代码块由调用方负责。
 * 允许链接里带标题（`(a.md "标题")`）与尖括号包裹（`(<a.md>)`）。
 *
 * @param {string} line 单行文本
 * @returns {string[]} 链接目标列表
 */
function extractTargets(line) {
  const out = [];
  const re = /!?\[[^\]]*\]\(([^()\s]+(?:\([^()]*\)[^()\s]*)?)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    let target = m[1].trim();
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    out.push(target);
  }
  return out;
}

/** 判断是否外部链接 / 纯锚点 / 模板占位 */
function isSkipped(target) {
  return (
    /^(?:https?:|mailto:|tel:|data:|\/\/)/i.test(target)
    || target.startsWith('#')
    || target.includes('{{')
    || target.includes('${')
  );
}

/** 去掉 query / hash 后再解析 */
function stripSuffix(target) {
  return target.split('#')[0].split('?')[0];
}

/**
 * 仓库已跟踪文件清单（懒加载，只取一次）
 *
 * 为什么需要它：文档里有大量**指向仓库外或未跟踪目录**的路径，比如
 * `../../oauth21/src/utils/request.ts`（oauth21 是独立仓，本仓不跟踪）、
 * `../../phonecopy/...`（嵌套仓、被 gitignore）。这些链接在开发机上能命中，
 * 在干净检出（CI）里必然失效 —— 用 `existsSync` 判定就得到「本地绿、CI 红」的假绿。
 * 判据必须与「这份文件会不会出现在检出里」一致，也就是 git 索引，而不是工作区。
 *
 * @returns {Set<string>|null} 相对仓库根的路径集合；git 不可用时返回 null（退化为只看工作区）
 */
let trackedCache;
function trackedFiles() {
  if (trackedCache !== undefined) return trackedCache;
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024
    });
    trackedCache = new Set(out.split('\0').filter(Boolean));
  } catch {
    trackedCache = null;
  }
  return trackedCache;
}

/** 收集全部 Markdown */
const files = [...new Set(SCAN_ROOTS.flatMap(r => collect(r)))].sort();
const listOnly = process.argv.includes('--list');

const broken = [];
let checked = 0;
/** 指向仓库外/未跟踪目录的链接数（不判定，仅报告，避免"看起来全都验过了"） */
let external = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let fenceMark = '';

  lines.forEach((line, i) => {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMark = fence[1][0];
      } else if (fence[1][0] === fenceMark) {
        inFence = false;
        fenceMark = '';
      }
      return;
    }
    if (inFence) return;

    for (const raw of extractTargets(line)) {
      if (isSkipped(raw)) continue;
      const target = stripSuffix(raw).replace(/^<|>$/g, '');
      if (!target) continue;
      checked++;

      // 站内绝对路径是 **vitepress 路由**（`/core/auth` ⇒ docs/core/auth.md），
      // 不是仓库根路径；相对路径按当前文件所在目录解析。
      const candidates = target.startsWith('/')
        ? [path.join(ROOT, 'docs', target)]
        : [path.resolve(path.dirname(file), target)];

      const ok = candidates.some(p => existsSync(p) || existsSync(`${p}.md`) || existsSync(path.join(p, 'README.md')));
      if (ok) {
        if (listOnly) console.log(`${rel}:${i + 1} -> ${raw}`);
        continue;
      }

      // 未命中：先判断它是不是"本来就不在检出里"的外部指针。
      // 判据只看**目标是否落在 docs/ 内**：docs 内的一律必验（文档站自己的页面），
      // docs 外的（前端源码、独立仓、嵌套仓）只有在 git 跟踪时才验 —— 否则本地有、CI 无。
      const resolvedRel = path.relative(ROOT, candidates[0]).split(path.sep).join('/');
      const insideDocs = !resolvedRel.startsWith('..') && resolvedRel.startsWith('docs/');
      const tracked = trackedFiles();
      const outsideAndUntracked = !insideDocs && resolvedRel !== '' && !resolvedRel.startsWith('..') && tracked
        ? !tracked.has(resolvedRel)
        : false;

      if (outsideAndUntracked) {
        external++;
        if (listOnly) console.log(`${rel}:${i + 1} -> ${raw}  (跳过：未跟踪) ${resolvedRel}`);
        continue;
      }

      broken.push({ file: rel, line: i + 1, target: raw });
      if (listOnly) console.log(`${rel}:${i + 1} -> ${raw}  ❌`);
    }
  });
}

console.log(`\n扫描 ${files.length} 份 Markdown，检查 ${checked} 条相对链接`);
if (external) console.log(`（其中 ${external} 条指向仓库外/未跟踪目录，按设计跳过：它们不存在于干净检出里）`);

if (broken.length) {
  console.log(`\n❌ 失效链接 ${broken.length} 处：`);
  for (const b of broken) console.log(`  ${b.file}:${b.line}  ->  ${b.target}`);
  process.exit(1);
}

console.log('✅ 全部相对链接有效');
