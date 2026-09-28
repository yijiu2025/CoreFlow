/**
 * 毒丸：证明 `verify-no-pwa.mjs` **真的会红**（不是恒绿摆设）
 *
 * === 为什么必须有 ===
 * 静态关卡靠"读文件 + 断言文本"过活，最容易写成恒绿的摆设 —— 尤其这一条：
 * 它守的是"某个东西**不存在**"，而"断言不存在"写错了（比如正则写歪、路径找错）
 * 恰恰也是**永远通过**。所以必须主动把 PWA 的每一类痕迹植回去，看它红不红。
 *
 * === 植入的毒（覆盖 A/B/C 三段）===
 *   P1  `index.html` 注入 `<link rel="manifest">`            → A 段
 *   P2  新建 `manifest.webmanifest`                          → B 段
 *   P3  新建 `lazy-theme/…`（路径前缀改造回潮）               → B 段
 *   P4  `sw.js` 换成 workbox 风格（precacheAndRoute +
 *       NavigationRoute + 清单字面量，且**没有**自毁三件套）    → C 段（正向 3 条 + 反向 4 条）
 *
 * 期望：关卡报告 ≥ 10 条失败并以退出码 1 结束；还原后必须重新全绿。
 * 还原是**字节级**的（先备份再写回），失败也由 try/finally 兜住。
 *
 * 用法：node oauth21/e2e/poison-verify-no-pwa.mjs [--dir dist-nopwa]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// 关卡所在目录 = oauth21/e2e/，oauth21 就是上一级
const OA = join(HERE, '..');
const argv = process.argv.slice(2);
const dirArg = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : 'dist-nopwa';
const DIST = join(OA, dirArg);
const CHECKER = join(HERE, 'verify-no-pwa.mjs');

if (!existsSync(join(DIST, 'sw.js'))) {
  console.error(`找不到 ${join(DIST, 'sw.js')} —— 先构建：cd oauth21 && npx vite build --outDir ${dirArg}`);
  process.exit(1);
}

/** 与本机 npm 同款的脚本执行方式：**文件型 stdio**（管道 stdio 在本机会恒抛 EBUSY） */
function runChecker(logPath) {
  const out = spawnSync(process.execPath, [CHECKER, '--dir', dirArg], {
    cwd: OA,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  });
  const text = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  writeFileSync(logPath, text);
  return { code: out.status, text };
}

const indexPath = join(DIST, 'index.html');
const swPath = join(DIST, 'sw.js');
const manifestPath = join(DIST, 'manifest.webmanifest');
const lazyDir = join(DIST, 'lazy-theme');

// 备份（还原靠它们，必须字节级）
const backup = {
  index: readFileSync(indexPath),
  sw: readFileSync(swPath)
};
let plantedManifest = false;
let plantedLazy = false;

const WORKBOX_ISH_SW = `precacheAndRoute([{url:"index.html",revision:"deadbeef"},{url:"assets/index-abc.js",revision:null}]);
s.registerRoute(new s.NavigationRoute(s.createHandlerBoundToUrl("index.html")));
`;

try {
  console.log(`产物：${DIST}`);
  console.log('植入 4 类 PWA 痕迹…');

  // P1 index.html 注入 manifest link
  const html = backup.index.toString('utf8');
  writeFileSync(
    indexPath,
    html.replace('</head>', '  <link rel="manifest" href="/manifest.webmanifest" />\n  </head>')
  );
  console.log('  P1 index.html ← <link rel="manifest">');

  // P2 manifest.webmanifest
  writeFileSync(manifestPath, JSON.stringify({ name: 'Enterprise Login', start_url: '/' }));
  plantedManifest = true;
  console.log('  P2 新建 manifest.webmanifest');

  // P3 lazy-theme/ 回潮
  mkdirSync(lazyDir, { recursive: true });
  writeFileSync(join(lazyDir, 'theme-poison.js'), 'export const poisoned = 1;\n');
  plantedLazy = true;
  console.log('  P3 新建 lazy-theme/theme-poison.js');

  // P4 sw.js 换成 workbox 风格
  writeFileSync(swPath, WORKBOX_ISH_SW);
  console.log('  P4 sw.js ← workbox 风格（含清单 + NavigationRoute，无自毁三件套）');
  console.log('');

  const BEFORE = runChecker(join(HERE, '_poison-no-pwa-before.log'));
  const failsBefore = (BEFORE.text.match(/❌/g) || []).length;
  console.log(`── 中毒后跑关卡：退出码 ${BEFORE.code} · 失败 ${failsBefore} 条`);
  for (const line of BEFORE.text.split(/\r?\n/).filter(l => l.trim().startsWith('❌'))) {
    console.log(`   ${line.trim()}`);
  }
  console.log('');

  let ok = true;
  const expect = (cond, name) => {
    console.log(`  ${cond ? '✅' : '❌'} ${name}`);
    if (!cond) ok = false;
  };
  /**
   * ⚠️ 只认**失败行**（`❌` 开头）—— 日志里每一句断言都会打印（通过的也打），
   *    拿全文去 `test()` 会得出"全部被点亮"的假象（本脚本第一版就是这个毛病）。
   */
  const failLines = BEFORE.text.split(/\r?\n/).filter(l => l.trim().startsWith('❌'));
  expect(BEFORE.code === 1, '关卡的退出码是 1（会红）');
  expect(failsBefore >= 10, `失败条数 ≥ 10（实测 ${failsBefore}）`);
  const WATCH = [
    ['A · manifest 链接', /index\.html 无 manifest 链接/],
    ['B · manifest.webmanifest', /产物里无 manifest\.webmanifest/],
    ['B · lazy-theme 回潮', /产物里无 lazy-theme\//],
    ['B · workbox 运行时符号', /产物 JS 里无 workbox 运行时符号/],
    ['C · 含 skipWaiting', /sw\.js 含 skipWaiting/],
    ['C · 会清 Cache Storage', /会清空 Cache Storage/],
    ['C · 会注销自己', /会注销自己/],
    ['C · 不含 precacheAndRoute', /不含 precacheAndRoute/],
    ['C · 不含 NavigationRoute', /不含 NavigationRoute/],
    ['C · 不含清单字面量', /不含预缓存清单字面量/]
  ];
  for (const [key, pat] of WATCH) {
    expect(
      failLines.some(l => pat.test(l)),
      `${key} 这条被点亮`
    );
  }
  console.log('');

  if (!ok) {
    console.log('⚠️ 有毒丸没被点亮 —— 对应断言是**恒绿**的，等于没守。');
  }
} finally {
  // 还原（字节级）
  writeFileSync(indexPath, backup.index);
  writeFileSync(swPath, backup.sw);
  if (plantedManifest) {
    try {
      unlinkSync(manifestPath);
    } catch {
      /* 忽略 */
    }
  }
  if (plantedLazy) {
    try {
      unlinkSync(join(lazyDir, 'theme-poison.js'));
      rmdirSync(lazyDir);
    } catch {
      /* 忽略 */
    }
  }
  console.log('已还原产物（index.html / sw.js 字节级写回，毒文件已删）');
}

// 复验：还原后必须重新全绿
const AFTER = runChecker(join(HERE, '_poison-no-pwa-after.log'));
const failsAfter = (AFTER.text.match(/❌/g) || []).length;
console.log('');
console.log(`── 还原后跑关卡：退出码 ${AFTER.code} · 失败 ${failsAfter} 条`);
if (AFTER.code !== 0 || failsAfter !== 0) {
  console.log('');
  console.log('❌ 还原后没有回到全绿 —— 产物没还原干净，或关卡有状态依赖。日志：e2e/_poison-no-pwa-after.log');
  process.exit(1);
}
console.log('');
console.log('════════ 毒丸通过：10 类断言全部会被点亮，且还原后全绿 ════════');
