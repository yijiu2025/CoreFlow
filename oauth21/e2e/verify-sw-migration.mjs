/**
 * 关卡：PWA 移除后**老用户的迁移真的生效**（行为口径，Playwright，跑生产产物）
 *
 * === 为什么必须单独验这一条 ===
 * 光删 `vite.config.js` 里的 `VitePWA` 是**清不掉**已经装过 SW 的浏览器的 ——
 * 它会一直用旧 SW 处理导航与静态资源，永远不回源。所以这次移除额外留了一个
 * `oauth21/public/sw.js`（自毁迁移脚本，顶替 `/sw.js` 这个 URL，靠浏览器原生的
 * SW 更新检查被取到）。**这条路径最容易漏，也最难靠肉眼确认**。
 *
 * === 实验设计（不依赖任何外网/旧产物）===
 *   阶段 1  往产物里临时放一个「假老 SW」`__legacy-sw.js`（模拟 workbox 生成的那个：
 *           写入一条缓存 + 劫持所有导航），用 `register()` 装上并等它接管。
 *           → 断言：缓存有痕迹、导航确实被劫持（**顺带把 P0 复现一遍**）。
 *   阶段 2  再用 `register('/sw.js')` 让**真自毁脚本**接管同一个 scope
 *           （同 scope 换 scriptURL 就是老用户的真实升级路径）。
 *           → 断言：所有缓存被清空、registration 被注销。
 *   阶段 3  重新导航。
 *           → 断言：拿到的是真实页面（不再是假老 SW 返回的劫持页）。
 *
 * 用法: node verify-sw-migration.mjs [baseUrl] [distDir]
 *   baseUrl 默认 http://127.0.0.1:5189（需先 `vite preview --outDir <distDir> --port 5189`）
 *   distDir 默认 <repo>/oauth21/dist-nopwa
 */
import { chromium } from 'playwright-core';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://127.0.0.1:5189';
const DIST = process.argv[3] || join(HERE, '..', 'dist-nopwa');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HIJACK_MARK = 'LEGACY-SW-HIJACKED-NAV-7f3a';
const QS = '?appName=posecraft&client_id=demo-client-001';
const LEGACY_FILE = join(DIST, '__legacy-sw.js');

if (!existsSync(join(DIST, 'sw.js'))) {
  console.error(`找不到 ${join(DIST, 'sw.js')} —— 这是自毁迁移脚本，本关卡的被测对象。`);
  console.error(`先构建：cd oauth21 && npx vite build --outDir ${DIST.split(/[\\/]/).pop()}`);
  process.exit(1);
}

/** 模拟"装过 workbox SW 的浏览器"：留一条缓存 + 劫持全部导航 */
const LEGACY_SW = `
const CACHE = 'legacy-workbox-precache-v1';
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.put('/__legacy-precached__', new Response('precached-by-legacy-sw')))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(new Response(
      '<!doctype html><html><head><title>HIJACKED</title></head><body>${HIJACK_MARK}</body></html>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    ));
  }
});
`;

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

writeFileSync(LEGACY_FILE, LEGACY_SW);
console.log(`已放"假老 SW"：${LEGACY_FILE}`);
console.log(`目标服务：${BASE}`);
console.log('');

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

/** 读 SW 状态；页面可能正被自毁脚本 navigate，所以容错重试 */
async function readState() {
  try {
    return await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      const names = await caches.keys();
      let entries = 0;
      for (const n of names) entries += (await (await caches.open(n)).keys()).length;
      return {
        regs: regs.length,
        caches: names.length,
        entries,
        controller: navigator.serviceWorker.controller?.scriptURL ?? null
      };
    });
  } catch {
    return null;
  }
}

// ─────────── 阶段 1：装上"假老 SW"，复现 P0 ───────────
console.log('══ 阶段 1：模拟装过 SW 的老浏览器 ══');
await page.goto(`${BASE}/m/login${QS}`, { waitUntil: 'load', timeout: 30000 });
await page.evaluate(() => navigator.serviceWorker.register('/__legacy-sw.js', { scope: '/' }));
await page
  .waitForFunction(() => navigator.serviceWorker.controller != null, { timeout: 30000 })
  .catch(() => {});
await page.waitForTimeout(1200);

const afterLegacy = await readState();
console.log(`  controller = ${afterLegacy?.controller ?? '(null)'}`);
console.log(`  缓存 ${afterLegacy?.caches ?? '?'} 个 · 条目 ${afterLegacy?.entries ?? '?'} 条`);
check(
  (afterLegacy?.entries ?? 0) >= 1,
  '假老 SW 已生效（留下缓存痕迹）',
  '缓存是空的 —— 假老 SW 可能没装上，后面两条断言就失去意义'
);
check(
  /__legacy-sw\.js$/.test(afterLegacy?.controller ?? ''),
  '导航已由假老 SW 接管',
  `controller 是 ${afterLegacy?.controller ?? '(null)'}`
);

// 复现 P0：导航被 SW 顶掉
await page.goto(`${BASE}/m/login${QS}`, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
const hijackedHtml = await page.content().catch(() => '');
check(
  hijackedHtml.includes(HIJACK_MARK),
  '复现 P0：旧 SW 把同源导航顶成了自己返回的内容',
  '没复现出来不影响下面的迁移断言，只是说明这个对照没建立（可能 SW 未接管）'
);
console.log('');

// ─────────── 阶段 2：让真自毁脚本接管同一个 scope ───────────
console.log('══ 阶段 2：让真 /sw.js（自毁迁移脚本）接管 ══');
await page
  .evaluate(() => navigator.serviceWorker.register('/sw.js', { scope: '/' }))
  .catch(() => null);

// 自毁脚本 activate 时会 client.navigate()，所以页面可能反复重载 —— 轮询到干净为止
const deadline = Date.now() + 25000;
let clean = null;
while (Date.now() < deadline) {
  const s = await readState();
  if (s && s.regs === 0 && s.caches === 0) {
    clean = s;
    break;
  }
  await page.waitForTimeout(700);
}
const final = clean ?? (await readState());
console.log(`  最终：registration ${final?.regs ?? '?'} 个 · 缓存 ${final?.caches ?? '?'} 个 · 条目 ${final?.entries ?? '?'} 条`);
check(final?.caches === 0, '所有 Cache Storage 已被清空', `仍有 ${final?.caches} 个 cache（${final?.entries} 条）`);
check(final?.regs === 0, 'Service Worker 已注销', `仍有 ${final?.regs} 个 registration`);
check(final?.controller == null, '页面已不受 SW 控制', `controller 仍是 ${final?.controller}`);
console.log('');

// ─────────── 阶段 3：导航必须回源 ───────────
console.log('══ 阶段 3：导航回源（不再被任何 SW 拦截）══');
const resp = await page.goto(`${BASE}/m/login${QS}`, { waitUntil: 'load', timeout: 20000 }).catch(() => null);
const html = await page.content().catch(() => '');
console.log(`  HTTP ${resp ? resp.status() : '(失败)'} · html ${html.length} 字节`);
check(!html.includes(HIJACK_MARK), '导航不再被劫持页接管');
// ⚠️ 不能断言精确串 `<div id="app">`：Vue 3 挂载后会往根元素上加 `data-v-app` 属性，
//    于是实际是 `<div id="app" data-v-app="">` —— 精确匹配会假红（本脚本第一版就是这样）。
check(
  /<div[^>]*\bid=["']app["']/.test(html),
  '拿到的是真实的前端页面（含 `#app` 挂载点）',
  `没拿到 #app —— 静态资源可能也被旧缓存污染了（html ${html.length} 字节）`
);
console.log('');

await browser.close();
try {
  unlinkSync(LEGACY_FILE);
  console.log(`已清理 ${LEGACY_FILE}`);
} catch {
  /* 忽略 */
}

console.log('');
console.log(`════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
if (fail > 0) {
  console.log('');
  console.log('含义：已经装过旧 SW 的浏览器不会被清干净 —— 它们会一直卡在旧缓存与导航劫持上，');
  console.log('      而且**清不掉**（删配置无效）。检查 oauth21/public/sw.js 的 activate 逻辑。');
  process.exit(1);
}
