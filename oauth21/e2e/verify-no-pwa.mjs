/**
 * 关卡：oauth21 **没有** PWA（静态口径，无浏览器，直接读产物）
 *
 * === 它守的是什么 ===
 * 2026-09-27 移除了 oauth21 的 `vite-plugin-pwa`。移除原因与迁移路径见
 * `docs/frontend/PWA_GUIDE.md` 第六节；这个脚本只负责一件事：**别让它静默回来**。
 *
 * 为什么这条不变式需要关卡、而不是靠人自觉 —— 三条叠起来正好构成"谁都发现不了"：
 *   ① 它**不是**"少一个功能"，而是会**破坏后端功能**：无 denylist 的 `NavigationRoute`
 *      把一切同源导航（含 `/oauth2.1/device` 设备码授权页）顶成预缓存的 index.html；
 *   ② 它**只影响生产**：`devOptions` 没开，dev server 下根本没有 SW，本地怎么点都正常；
 *   ③ 它的症状**极其反直觉**：屏蔽 SW 全绿、不屏蔽也全绿 —— 因为 CDP `Network.enable`
 *      挂在 page target 上，而 SW 的预缓存下载走**独立的 ServiceWorker target**，
 *      页面级探针一个字节都看不见（实测两轮数字一字不差）。
 *
 * === 判定口径 ===
 *   A. `index.html` 里不得有 manifest 链接、不得有 SW 注册注入；
 *   B. 产物里不得有 `manifest.webmanifest` / `workbox-*.js` / PWA 运行时特征串；
 *   C. `sw.js` **只能是自毁迁移版** —— 含注销三件套（`skipWaiting` / `caches.delete` / `unregister`），
 *      且不含任何 workbox 预缓存特征（`precacheAndRoute` / `NavigationRoute` / 清单字面量）；
 *   D. 惰性主题 chunk 仍留在产物里、且回到默认 `assets/` 目录。
 *      `lazy-theme/` 前缀是配合 `globIgnores` 的临时改造，已随 SW 一起回滚；
 *      这条防止"以为回滚了路径、结果把版式切分一起删了"（回滚路径 ≠ 少打包）。
 *
 * 退出码：0 通过 / 1 有违反。
 *
 * 用法：node oauth21/e2e/verify-no-pwa.mjs [--dir dist-nopwa]
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OA = join(HERE, '..');
const argv = process.argv.slice(2);
const dirArg = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : 'dist';
const DIST = join(OA, dirArg);

let pass = 0;
let fail = 0;
const check = (ok, name, detail) => {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `\n       ${detail}` : ''}`);
  }
};

if (!existsSync(DIST)) {
  console.error(`找不到产物目录 ${DIST} —— 先构建：cd oauth21 && npx vite build --outDir ${dirArg}`);
  process.exit(1);
}

/** 产物内全部文件（相对 DIST 的正斜杠路径） */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(DIST, full).replace(/\\/g, '/'));
  }
  return out;
}
const files = walk(DIST);

console.log(`产物目录：${DIST}`);
console.log(`文件总数：${files.length}`);
console.log('');

// ─────────── A. index.html 不得有 PWA 注入 ───────────
console.log('══ A. index.html 的 PWA 注入 ══');
const indexPath = join(DIST, 'index.html');
const html = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
check(html.length > 0, 'index.html 存在且非空');
check(
  !/<link[^>]+rel\s*=\s*["']manifest["']/i.test(html),
  'index.html 无 manifest 链接',
  '发现 <link rel="manifest"> —— 说明某个 PWA 插件又把 manifest 注回来了'
);
check(
  !/registerSW|navigator\.serviceWorker|serviceWorker\.register/i.test(html),
  'index.html 无 Service Worker 注册注入',
  '发现 SW 注册代码 —— 页面会主动安装 SW'
);
console.log('');

// ─────────── B. 产物里不得有 PWA 文件与运行时 ───────────
console.log('══ B. 产物里的 PWA 文件 / 运行时 ══');
const manifestFiles = files.filter(f => /(^|\/)manifest\.webmanifest$/.test(f));
const workboxFiles = files.filter(f => /(^|\/)workbox-.*\.js$/.test(f));
const lazyThemeFiles = files.filter(f => /(^|\/)lazy-theme\//.test(f));
check(
  manifestFiles.length === 0,
  '产物里无 manifest.webmanifest',
  manifestFiles.length ? `发现：${manifestFiles.join(', ')}` : ''
);
check(
  workboxFiles.length === 0,
  '产物里无 workbox-*.js',
  workboxFiles.length ? `发现：${workboxFiles.join(', ')}` : ''
);
check(
  lazyThemeFiles.length === 0,
  '产物里无 lazy-theme/ 目录（路径前缀改造已回滚）',
  lazyThemeFiles.length ? `发现 ${lazyThemeFiles.length} 个文件，例如：${lazyThemeFiles.slice(0, 3).join(', ')}` : ''
);

// PWA 运行时特征串：JS chunk 里不应出现 workbox 的运行时符号
const RUNTIME_MARKS = /precacheAndRoute|createHandlerBoundToUrl|__WB_MANIFEST|workbox-/;
const jsFiles = files.filter(f => f.endsWith('.js'));
const runtimeHits = [];
for (const f of jsFiles) {
  if (RUNTIME_MARKS.test(readFileSync(join(DIST, f), 'utf8'))) runtimeHits.push(f);
}
check(
  runtimeHits.length === 0,
  `产物 JS 里无 workbox 运行时符号（检查了 ${jsFiles.length} 个 chunk）`,
  runtimeHits.length ? `命中：${runtimeHits.slice(0, 5).join(', ')}` : ''
);
console.log('');

// ─────────── C. sw.js 只能是自毁迁移版 ───────────
console.log('══ C. sw.js 必须是自毁迁移版 ══');
const swPath = join(DIST, 'sw.js');
if (!existsSync(swPath)) {
  // 迁移期过后这里会走到；那时应把期望值改成"sw.js 不存在"，而不是删掉整段
  check(
    false,
    'sw.js 存在（迁移期必需）',
    '找不到 sw.js。若旧 SW 装机量已归零、迁移期已结束，请把本段的期望改成「sw.js 不存在」再删掉 public/sw.js'
  );
} else {
  const raw = readFileSync(swPath, 'utf8');
  /**
   * 断言一律基于**剥离注释后**的代码，两个方向都更正确：
   *   · 正向（含 `skipWaiting` / `unregister`）—— 注释里写了不算实现；
   *   · 反向（不含 `NavigationRoute`）—— 本文件的注释**会**提到它（解释"为什么被移除"），
   *     不剥注释就会自己把自己判红（第一版正是踩了这个）。
   */
  const sw = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
  const kb = (Buffer.byteLength(raw) / 1024).toFixed(2);
  console.log(`  sw.js 体积：${kb} kB（含注释；**判据不看体积** —— workbox 生成版是几十 kB 且带清单）`);

  // 注销三件套
  check(/skipWaiting/.test(sw), 'sw.js 含 skipWaiting（不等旧页面关闭）');
  check(/caches\s*\.\s*delete|cacheNames|keys\(\)/.test(sw), 'sw.js 会清空 Cache Storage');
  check(/registration\s*\.\s*unregister/.test(sw), 'sw.js 会注销自己');

  // 绝不能是 workbox 生成版
  check(
    !/precacheAndRoute/.test(sw),
    'sw.js 不含 precacheAndRoute',
    'workbox 生成的预缓存 SW 会重占 /sw.js —— 首访又会多下整棵 dist'
  );
  check(
    !/NavigationRoute|createHandlerBoundToUrl/.test(sw),
    'sw.js 不含 NavigationRoute / createHandlerBoundToUrl',
    '这条就是劫持同源导航（含设备码授权页 /oauth2.1/device）的元凶，绝不能回来'
  );
  const precacheLiteral = /\{\s*url\s*:\s*["'][^"']+["']\s*,\s*revision\s*:/.test(sw);
  check(
    !precacheLiteral,
    'sw.js 不含预缓存清单字面量（{url,revision} 数组）',
    '清单在 = 首访会被强制下完清单里每一项'
  );
  check(!/__WB_MANIFEST/.test(sw), 'sw.js 不含 __WB_MANIFEST 占位符');
}
console.log('');

// ─────────── D. 惰性主题 chunk 仍在（回滚路径不该少打包）───────────
console.log('══ D. 惰性主题 chunk 仍被切分出来 ══');
const viewChunks = [];
for (const f of jsFiles) {
  const src = readFileSync(join(DIST, f), 'utf8');
  // ⚠️ 产物里是 `"data-mauth-view":` + 反引号包的值（`` `default` `` / `` `compact` ``），
  //    字符类里**必须带反引号** —— 否则一个包名都提不出来，会误报"只剩一个包"。
  if (/data-mauth-view/.test(src))
    viewChunks.push({
      f,
      pkg: (src.match(/data-mauth-view["'\s:=`]+([a-z0-9-]+)/) || [])[1]
    });
}
const pkgs = [...new Set(viewChunks.map(v => v.pkg).filter(Boolean))].sort();
console.log(`  含 data-mauth-view 的 chunk：${viewChunks.length} 个 · 涉及主题包：${pkgs.join(', ') || '（无）'}`);
check(viewChunks.length > 0, '惰性主题 / 版式 chunk 仍被切分为独立 chunk', '一个都没找到 —— 版式可能被内联进主 chunk 或整体漏打包了');
check(
  viewChunks.every(v => v.f.startsWith('assets/')),
  '这些 chunk 都在默认 assets/ 目录（路径前缀已回滚）',
  viewChunks.filter(v => !v.f.startsWith('assets/')).map(v => v.f).slice(0, 5).join(', ')
);
check(
  pkgs.length >= 2,
  `产物里仍含多个主题包的版式（实测 ${pkgs.length} 个包：${pkgs.join(', ')}）`,
  '只剩一个包 = 按需切分被破坏'
);
console.log('');

console.log(`════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
if (fail > 0) {
  console.log('');
  console.log('含义：PWA 要么被加了回来、要么移除得不彻底。');
  console.log('     回看 docs/frontend/PWA_GUIDE.md 第六节：登录页属于规范里明确写的「不适用」场景，');
  console.log('     且无 denylist 的 NavigationRoute 会顶掉后端设备码授权页。');
  process.exit(1);
}
