/**
 * 毒丸验证：证明 verify-theme-dirs.mjs 的断言真的会失败（恒绿的闸门等于没有闸门）
 *
 * 毒丸七枚：
 *   ① 在页面下建一个「版式层目录」`themes/default/mobile/login/compact/`
 *      → 必须触发「页面目录下不存在多余子目录」失败
 *   ② 在 theme/index.ts 里塞回 6 段配色 glob
 *      → 必须触发「不再有『6 段配色』glob」失败
 *   ③ 在 colorFromKey 里加第二个（6 段）模式（模拟 6 段分支复辟）
 *      → 必须触发「键正则只有一套」失败
 *   ④ 把某个版式的 `data-mauth-view` 改回已废弃的 `"base"`
 *      → 必须触发「版式声明 data-mauth-view="<包名>"」失败
 *   ⑤ 把默认配色常量改回 `black`（用户 2026-09-26 定：默认 = default 包 + white）
 *      → 必须触发「默认配色就是 white」失败
 *      ⚠️ 2026-09-26 抽包 Stage 1 后，该常量住在内核包 `packages/theme-core/src/constants.ts`，
 *         所以注入点要跟着实现走（本脚本用 `pickImpl()` 解析，注入落空会显式报"未命中"）
 *   ⑥ 把路由预取守卫里的声明档（`theme: readDeclaredView(...)`）删掉
 *      → 必须触发「预取守卫把 viewFor(page) 的声明档一起传下去」失败
 *   ⑦ 往内核包里塞一句 `window.location`
 *      → 必须触发「内核不依赖：window / document（DOM）」失败（「内核不知道宿主」是抽包的前提）
 *   ⑧ 往壳文件 `theme/tone.ts` 里塞一句实现（`const __logic = 1`）
 *      → 必须触发「壳 tone.ts 里只有转发（无逻辑）」失败（两份真相是抽包的头号风险）
 *
 * 跑完自动还原（务必确认还原干净，失败时打印还原状态）。
 */
import { readFileSync, writeFileSync, openSync, closeSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OA = join(HERE, '..');
const CHECKER = join(HERE, 'verify-theme-dirs.mjs');
const THEME_INDEX = join(OA, 'src', 'theme', 'index.ts');
/** 构建层（glob + colorFromKey + buildRegistry）在 registry.ts，不在 index.ts（P2-3 拆分后） */
const THEME_REGISTRY = join(OA, 'src', 'theme', 'registry.ts');
const THEME_TONE = join(OA, 'src', 'theme', 'tone.ts');
/** 内核包（2026-09-26 抽包 Stage 1 起，纯叶子层的实现住在这里） */
const CORE = join(HERE, '..', '..', 'packages', 'theme-core', 'src');
const POISON_DIR = join(OA, 'src', 'theme', 'themes', 'default', 'mobile', 'login', 'compact');
/** 毒丸④的目标：一份**带 data-mauth-view** 的版式（必须真的存在，否则毒丸会假绿） */
const VIEW_FILE = join(OA, 'src', 'theme', 'themes', 'default', 'mobile', 'login', 'index.vue');
/** 毒丸⑥的目标：路由预取守卫（声明档就是在这里传下去的） */
const ROUTES = join(OA, 'src', 'router', 'routes.ts');
const LOG = join(HERE, '.poison-checker.log');

/**
 * 解析一个符号的**实现文件**（抽包期间实现可能在 src，也可能已进包）
 *
 * 与关卡脚本的 `implText` 同一个思路：候选路径 × 两处根目录，取第一个存在的。
 * 找不到返回 null —— 调用方必须把它当"注入点落空"报出来，不能当成"毒丸已生效"。
 */
function pickImpl(relPaths) {
  for (const rel of relPaths) {
    for (const base of [join(OA, 'src'), CORE]) {
      const p = join(base, rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const CONSTANTS_FILE = pickImpl([join('theme', 'constants.ts'), 'constants.ts']);

/**
 * 改动前的原文（file → text）。用一张表而不是若干个 dirty 标记：
 * 毒丸还会继续加，每加一枚就多一个标记必然漏还原。
 */
const backups = new Map();
function poke(file, newText) {
  if (!file) return false;
  if (!backups.has(file)) backups.set(file, readFileSync(file, 'utf8'));
  writeFileSync(file, newText, 'utf8');
  // 回读确认注入真的落盘（写失败 / 路径错时不能算毒丸通过）
  return readFileSync(file, 'utf8') === newText;
}
function restoreAll() {
  for (const [file, text] of backups) writeFileSync(file, text, 'utf8');
  if (existsSync(POISON_DIR)) rmSync(POISON_DIR, { recursive: true, force: true });
}

/**
 * ⚠️ 本机同步 spawn 走**管道 IO** 会恒抛（EBUSY / status=null 且无输出），
 *    必须用 spawnSync + **文件型 stdio**，再把日志读回来。
 */
function runChecker() {
  const fd = openSync(LOG, 'w');
  let r;
  try {
    r = spawnSync(process.execPath, [CHECKER], { stdio: ['ignore', fd, fd] });
  } finally {
    closeSync(fd);
  }
  const out = readFileSync(LOG, 'utf8');
  return { code: r.status ?? 1, out };
}

const results = [];
const total = 8;
function record(label, ok, detail = '') {
  results.push([label, ok, detail]);
}

try {
  // ---- 基线
  const base = runChecker();
  record('基线（无改动）', base.code === 0, `exit=${base.code}`);

  // ---- 毒丸 ①：页面下建版式层目录
  mkdirSync(POISON_DIR, { recursive: true });
  const p1 = runChecker();
  const hit1 = /页面目录下不存在多余子目录/.test(p1.out);
  record(
    '毒丸①  页面下建 <版式>/ 目录 → 关卡变红',
    p1.code === 1 && hit1,
    `exit=${p1.code}, 命中断言=${hit1}`
  );
  rmSync(POISON_DIR, { recursive: true, force: true });

  // ---- 毒丸 ②：塞回 6 段配色 glob
  const idxOriginal = readFileSync(THEME_INDEX, 'utf8');
  poke(THEME_INDEX, `${idxOriginal}\n// 毒丸：'./themes/*/*/*/*/colors/*/index.ts'\n`);
  const p2 = runChecker();
  const hit2 = /不再有「6 段配色」glob/.test(p2.out);
  record(
    '毒丸②  塞回 6 段配色 glob → 关卡变红',
    p2.code === 1 && hit2,
    `exit=${p2.code}, 命中断言=${hit2}`
  );

  // ---- 毒丸 ③：colorFromKey 里加第二个模式（模拟 6 段分支复辟）
  //   colorFromKey 在 registry.ts（P2-3 拆分后），不是 index.ts
  const regOriginal = readFileSync(THEME_REGISTRY, 'utf8');
  poke(
    THEME_REGISTRY,
    regOriginal
      .replace(
        'return { pkg, device, page, colorId };',
        'return { pkg, device, page, view: m[5] ?? pkg, colorId };'
      )
      .replace(
        'const re = new RegExp(',
        'const re6 = new RegExp(`\\\\./themes/([^/]+)/([^/]+)/([^/]+)/([^/]+)/colors/([^/]+)/${file}$`);\n' +
          '  void re6;\n  const re = new RegExp('
      )
  );
  const p3 = runChecker();
  const hit3 = /colorFromKey 的键正则只有一套/.test(p3.out);
  record(
    '毒丸③  键正则加第二个（6 段）模式 → 关卡变红',
    p3.code === 1 && hit3,
    `exit=${p3.code}, 命中断言=${hit3}`
  );
  writeFileSync(THEME_REGISTRY, regOriginal, 'utf8');
  backups.delete(THEME_REGISTRY);

  // ---- 毒丸 ④：版式的 data-mauth-view 改回已废弃的 'base'
  const viewOriginal = readFileSync(VIEW_FILE, 'utf8');
  poke(VIEW_FILE, viewOriginal.replace('data-mauth-view="default"', 'data-mauth-view="base"'));
  const p4 = runChecker();
  const hit4 = /版式声明 data-mauth-view="default"/.test(p4.out);
  record(
    '毒丸④  版式身份改回 "base" → 关卡变红',
    p4.code === 1 && hit4,
    `exit=${p4.code}, 命中断言=${hit4}`
  );
  writeFileSync(VIEW_FILE, viewOriginal, 'utf8');
  backups.delete(VIEW_FILE);

  // ---- 毒丸 ⑤：默认配色常量改回 black（注入点跟实现走：可能在 src，也可能在包里）
  const POISON_5 = "export const DEFAULT_THEME_COLOR = 'black';";
  const original5 = CONSTANTS_FILE ? readFileSync(CONSTANTS_FILE, 'utf8') : '';
  const injected5 = original5.replace("export const DEFAULT_THEME_COLOR = 'white';", POISON_5);
  if (!CONSTANTS_FILE || injected5 === original5) {
    record(
      '毒丸⑤  默认配色常量改回 black → 关卡变红',
      false,
      '注入点未命中（DEFAULT_THEME_COLOR 的实现位置变了？）'
    );
  } else {
    poke(CONSTANTS_FILE, injected5);
    const p5 = runChecker();
    const hit5 = /默认配色就是 white/.test(p5.out);
    record(
      '毒丸⑤  默认配色常量改回 black → 关卡变红',
      p5.code === 1 && hit5,
      `exit=${p5.code}, 命中断言=${hit5}`
    );
    writeFileSync(CONSTANTS_FILE, original5, 'utf8');
    backups.delete(CONSTANTS_FILE);
  }

  // ---- 毒丸 ⑥：删掉预取守卫里的声明档（模拟"守卫与容器不同源"）
  // ⚠️ 用「换实现」而不是「删整行」：该文件是 CRLF，按 `\n` 锚定的整行替换会匹配不上。
  const routesOriginal = readFileSync(ROUTES, 'utf8');
  const routesPoisoned = routesOriginal.replace(
    'theme: readDeclaredView(page, PRELOAD_DEVICE)',
    'theme: undefined'
  );
  if (routesPoisoned === routesOriginal) {
    record('毒丸⑥  预取守卫漏传声明档 → 关卡变红', false, '注入点未命中（守卫源码变了？）');
  } else {
    poke(ROUTES, routesPoisoned);
    const p6 = runChecker();
    const hit6 = /预取守卫把 viewFor\(page\) 的声明档一起传下去/.test(p6.out);
    record(
      '毒丸⑥  预取守卫漏传声明档 → 关卡变红',
      p6.code === 1 && hit6,
      `exit=${p6.code}, 命中断言=${hit6}`
    );
    writeFileSync(ROUTES, routesOriginal, 'utf8');
    backups.delete(ROUTES);
  }

  // ---- 毒丸 ⑦：内核包塞一句 DOM 依赖（"内核不知道宿主"是抽包前提）
  const CORE_TONE = join(CORE, 'tone.ts');
  if (!existsSync(CORE_TONE)) {
    record('毒丸⑦  内核里塞 DOM 依赖 → 关卡变红', false, `缺 ${CORE_TONE}`);
  } else {
    const toneCoreOriginal = readFileSync(CORE_TONE, 'utf8');
    poke(CORE_TONE, `${toneCoreOriginal}\nexport const __poison = window.location.href;\n`);
    const p7 = runChecker();
    const hit7 = /内核不依赖：window \/ document（DOM）/.test(p7.out);
    record(
      '毒丸⑦  内核里塞 DOM 依赖 → 关卡变红',
      p7.code === 1 && hit7,
      `exit=${p7.code}, 命中断言=${hit7}`
    );
    writeFileSync(CORE_TONE, toneCoreOriginal, 'utf8');
    backups.delete(CORE_TONE);
  }

  // ---- 毒丸 ⑧：壳里塞实现（"同一时刻只有一个实现"）
  const toneShellOriginal = readFileSync(THEME_TONE, 'utf8');
  poke(THEME_TONE, `${toneShellOriginal}\nconst __logic = 1;\nvoid __logic;\n`);
  const p8 = runChecker();
  const hit8 = /壳 tone\.ts 里只有转发（无逻辑）/.test(p8.out);
  record(
    '毒丸⑧  壳里塞实现 → 关卡变红',
    p8.code === 1 && hit8,
    `exit=${p8.code}, 命中断言=${hit8}`
  );
  writeFileSync(THEME_TONE, toneShellOriginal, 'utf8');
  backups.delete(THEME_TONE);
} finally {
  restoreAll();
}

// ---- 还原校验
const after = runChecker();
record('还原后回到全绿', after.code === 0, `exit=${after.code}`);
for (const [file, text] of backups) {
  record(`字节级还原：${file}`, readFileSync(file, 'utf8') === text);
}
if (backups.size === 0) record('全部注入点都已还原（备份表为空）', true);
record('毒丸目录已清除', !existsSync(POISON_DIR));

let bad = 0;
console.log('\n=== 毒丸验证结果 ===');
for (const [label, ok, detail] of results) {
  if (!ok) bad += 1;
  console.log(`${ok ? '\u2713' : '\u2717'} ${label}${detail ? `  (${detail})` : ''}`);
}
console.log(`\n毒丸 ${total} 枚：${bad === 0 ? '验证通过（每枚都真的会让关卡变红）' : `验证失败：${bad} 项`}`);
process.exit(bad === 0 ? 0 : 1);
