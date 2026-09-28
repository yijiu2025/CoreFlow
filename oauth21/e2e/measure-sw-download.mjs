/**
 * ⚠️ **历史测量脚本**：oauth21 已于 2026-09-27 移除 PWA，新产物下本探针会量到 **0 字节**
 *    （没有 SW 就没什么可预缓存的）。它当初量出的数字是决策依据，保留供 posecraft 等
 *    仍启用 PWA 的工程复用。日常回归请用 `verify-no-pwa.mjs`。
 *
 * 量「Service Worker 预缓存」在**首访**时到底下载了多少字节
 *
 * === 为什么必须单独写一个 ===
 * `measure-load-budget.mjs` 的 CDP `Network.enable` 挂在 **page target** 上，
 * 而 SW 的 install（`precacheAndSet` → `addAll`）跑在**独立的 ServiceWorker target**，
 * 它的网络请求**不进 page 的 Network 域**。于是那个探针的 A 轮（--block-sw）与
 * B 轮（不屏蔽）数字会**一字不差**，还给出「清单里首访不会请求的有 0 项」这种
 * 误导性结论 —— 不是 SW 无成本，是**口径看不见**。
 *
 * 本探针用两个独立口径交叉验证：
 *   ① CDP `Target.setAutoAttach` 自动附加 SW target 并 `Network.enable`
 *      → 直接统计 SW 发起的请求字节（最接近"真实过线流量"）
 *   ② 页面内 `caches` 遍历 + `navigator.storage.estimate()`
 *      → SW install 完成后缓存里实际存了多少（含响应体，不含响应头）
 *
 * 用法: node measure-sw-download.mjs [baseUrl] [--wait 秒数]
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const baseArg = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:5189';
const waitArg = args.indexOf('--wait');
const WAIT_S = waitArg >= 0 ? Number(args[waitArg + 1]) : 12;

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const QS = '?appName=posecraft&client_id=demo-client-001';
const kb = n => `${(n / 1024).toFixed(1)} KB`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

/** ① page target 的网络（页面自身按需加载） */
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
/** ② SW target 的网络（预缓存下载）—— 靠自动附加才看得到 */
const swEvents = [];
await cdp.send('Target.setAutoAttach', {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true
});
cdp.on('Target.attachedToTarget', async ev => {
  if (ev.targetInfo.type !== 'service_worker') return;
  swEvents.push({ attached: ev.targetInfo.url });
  try {
    const swSession = await cdp.send('Target.attachToTarget', {
      targetId: ev.targetInfo.targetId,
      flatten: true
    });
    void swSession; // 下面用 sessionId 直接发命令
  } catch {
    // 已经通过 flatten 附加，忽略
  }
  try {
    await cdp.send('Network.enable', {}, ev.sessionId);
  } catch {
    // SW target 不支持 Network 域时忽略，靠口径②兜底
  }
});

const pageById = new Map();
const swById = new Map();
const onResp = store => e => store.set(e.requestId, { url: e.response.url, bytes: 0 });
const onDone = store => e => {
  const r = store.get(e.requestId);
  if (r) r.bytes = e.encodedDataLength;
};
cdp.on('Network.responseReceived', onResp(pageById));
cdp.on('Network.loadingFinished', onDone(pageById));
cdp.on('Network.responseReceived', e => {
  if (e.sessionId) onResp(swById)(e);
});
cdp.on('Network.loadingFinished', e => {
  if (e.sessionId) onDone(swById)(e);
});

console.log(`=== 加载 ${baseArg}/m/login${QS}（窄屏 390×844，全新浏览器上下文）===`);
const t0 = Date.now();
await page.goto(`${baseArg}/m/login${QS}`, { waitUntil: 'load', timeout: 30000 });
const loadMs = Date.now() - t0;
console.log(`页面 load 完成：${loadMs} ms`);

// 等 SW install 完成 + 预缓存下完
await page.waitForTimeout(WAIT_S * 1000);

/** 口径②：缓存里实际存了什么 */
const cacheInfo = await page.evaluate(async () => {
  const names = await caches.keys();
  let bytes = 0;
  let count = 0;
  const byCache = [];
  for (const n of names) {
    const c = await caches.open(n);
    const keys = await c.keys();
    let cb = 0;
    for (const req of keys) {
      const res = await c.match(req);
      if (!res) continue;
      try {
        cb += (await res.clone().arrayBuffer()).byteLength;
      } catch {
        /* 忽略 */
      }
      count++;
    }
    bytes += cb;
    byCache.push({ name: n, entries: keys.length, bytes: cb });
  }
  let estimate = null;
  try {
    estimate = await navigator.storage.estimate();
  } catch {
    /* 忽略 */
  }
  return {
    cacheNames: names,
    count,
    bytes,
    byCache,
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null
  };
});

const sum = m => [...m.values()].reduce((a, r) => a + (r.bytes || 0), 0);
const pageBytes = sum(pageById);
const swBytes = sum(swById);

console.log('');
console.log('── ① 页面自身（page target，CDP 口径）──');
console.log(`   ${pageById.size} 个请求 · 过线 ${kb(pageBytes)}`);
console.log('── ② SW 预缓存（ServiceWorker target，CDP 口径）──');
console.log(`   ${swById.size} 个请求 · 过线 ${kb(swBytes)}`);
if (swBytes === 0) {
  console.log('   ⚠️ 未捕获到 SW 请求 —— 以口径③（cache 遍历）为准');
}
console.log('── ③ 缓存实际占用（页面内 caches API）──');
console.log(`   缓存实例: ${cacheInfo.cacheNames.join(', ') || '(无)'}`);
console.log(`   条目 ${cacheInfo.count} 个 · 响应体合计 ${kb(cacheInfo.bytes)}`);
for (const c of cacheInfo.byCache) {
  console.log(`     · ${c.name}: ${c.entries} 条 / ${kb(c.bytes)}`);
}
if (cacheInfo.usage != null) {
  console.log(`   storage.estimate: usage ${kb(cacheInfo.usage)} / quota ${kb(cacheInfo.quota)}`);
}

console.log('');
console.log('════════ 结论 ════════');
const total = pageBytes + swBytes;
console.log(`首访真实总流量（页面 + SW）≈ ${kb(total)}`);
console.log(`  其中页面按需 ${kb(pageBytes)} · SW 预缓存 ${kb(swBytes)}`);
if (swBytes > 0) {
  console.log(`  SW 占比 ${((swBytes / total) * 100).toFixed(1)}%`);
}
console.log('');
console.log('对比「不装 SW」时的首访：≈ 页面按需那一份（' + kb(pageBytes) + '）');

await browser.close();
