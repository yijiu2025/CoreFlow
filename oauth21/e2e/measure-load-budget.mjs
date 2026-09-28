/**
 * 首屏 / 「拉宽」阶段真实流量实测（**生产构建**，不是 dev server）
 *
 * 为什么必须用生产构建：dev 下每个模块是一次独立请求（几百个请求、无 tree-shaking），
 * 量出来的数字没有参考价值。用户问的是"加载一次大概多少 KB 流量"——那问的是构建产物。
 *
 * === 两轮 ===
 *   A 轮 `--block-sw`（**屏蔽 Service Worker**）：隔离出"页面自己的按需加载"预算。
 *     这是判断「按需加载有没有被破坏」的唯一干净口径 —— PWA 的 SW 预缓存会在
 *     后台把**整站产物**都拉一遍，混在一起就什么都看不出来了。
 *   B 轮（**不屏蔽**）：真实用户首访的总流量 = 页面按需 + SW 预缓存差集。
 *
 * === 场景 ===
 *   ① 窄屏首屏（390×844）/login（无主题参数）
 *   ② 同一页面**拉宽**到 1280×900 的增量 —— 用户最关心的那一步
 *   ③ 再缩回 390 的增量（应为 0，chunk 已缓存）
 *   ④ 宽屏首屏（1280×900）单独跑 —— 与 ① 对比，验证"三形态预热"的真实代价
 *   ⑤ 窄屏 /m/register?view=compact —— 非内置包版式的惰性 chunk
 *   ⑥ 窄屏 /m/login?theme=cyan —— 配色附加样式 theme.scss 的惰性 chunk
 *
 * === 统计口径 ===
 * `Network.loadingFinished.encodedDataLength` = **实际过线字节（含响应头）**，即"流量"。
 * 同时用 zlib 对 dist 同名文件算 gzip，作为"若上了 gzip"的参考（vite preview 默认不压缩，
 * 所以 encodedDataLength ≈ 原始体积）。
 *
 * 用法: node measure-load-budget.mjs [baseUrl] [distDir] [--block-sw]
 */
import { chromium } from 'playwright-core';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const BLOCK_SW = args.includes('--block-sw');
const [baseArg, distArg] = args.filter(a => !a.startsWith('--'));
const BASE = baseArg || 'http://127.0.0.1:5189';
// 默认产物目录：oauth21 下的 dist-measure-1（跨机器可移植）
const DIST = resolve(distArg || join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-measure-1'));
const QS = '?appName=posecraft&client_id=demo-client-001';

const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };

const kb = n => `${(n / 1024).toFixed(1)} KB`;
const short = u => u.replace(BASE, '');

/** SW 预缓存清单（从 dist/sw.js 解析） */
function precacheUrls() {
  try {
    const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
    return new Set([...sw.matchAll(/\{url:"([^"]+)",revision:(?:"[^"]*"|null)\}/g)].map(x => x[1]));
  } catch {
    return new Set();
  }
}

function localPath(url) {
  try {
    const u = new URL(url);
    if (u.origin !== new URL(BASE).origin) return null;
    return join(DIST, decodeURIComponent(u.pathname));
  } catch {
    return null;
  }
}

function gzipOf(url) {
  const p = localPath(url);
  if (!p) return null;
  try {
    return gzipSync(readFileSync(p)).length;
  } catch {
    return null;
  }
}

/** dist 里同名文件的**原始**体积（未压缩），取不到返回 null */
function rawOf(url) {
  const p = localPath(url);
  if (!p) return null;
  try {
    return readFileSync(p).length;
  } catch {
    return null;
  }
}

async function attach(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const byId = new Map();
  const events = [];
  cdp.on('Network.responseReceived', e => {
    byId.set(e.requestId, {
      url: e.response.url,
      type: e.type,
      status: e.response.status,
      mime: e.response.mimeType,
      cached: Boolean(e.response.fromDiskCache || e.response.fromPrefetchCache),
      bytes: 0
    });
  });
  cdp.on('Network.loadingFinished', e => {
    const r = byId.get(e.requestId);
    if (!r) return;
    r.bytes = e.encodedDataLength;
    events.push(r);
  });
  cdp.on('Network.loadingFailed', e => {
    const r = byId.get(e.requestId);
    if (r) {
      r.failed = e.errorText;
      events.push(r);
    }
  });
  return events;
}

const rows = [];
const summarize = list => {
  const total = list.reduce((a, r) => a + (r.bytes || 0), 0);
  const gz = list.reduce((a, r) => a + (gzipOf(r.url) ?? 0), 0);
  const raw = list.reduce((a, r) => a + (rawOf(r.url) ?? 0), 0);
  const byExt = {};
  for (const r of list) {
    const ext = (/\.([a-z0-9]+)(?:\?|$)/i.exec(new URL(r.url).pathname) || [null, 'other'])[1];
    byExt[ext] = (byExt[ext] || 0) + (r.bytes || 0);
  }
  return { total, gz, raw, count: list.length, byExt };
};

function report(label, list) {
  const s = summarize(list);
  rows.push({ label, ...s });
  console.log(`\n── ${label} ──`);
  console.log(
    `   请求 ${s.count} 个 · 过线 ${kb(s.total)}（未压缩 ${kb(s.raw)} · gzip ${kb(s.gz)}）`
  );
  const parts = Object.entries(s.byExt)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${kb(v)}`);
  if (parts.length) console.log(`   分类: ${parts.join('  ')}`);
  return s;
}

async function scenario(browser, name, { viewport, path, waitMs = 3500, then = null }) {
  const ctx = await browser.newContext({
    viewport,
    colorScheme: 'light',
    ...(BLOCK_SW ? { serviceWorkers: 'block' } : {})
  });
  const page = await ctx.newPage();
  const events = await attach(page);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(waitMs);
  const snap1 = events.slice(0, events.length).map(r => ({ ...r }));
  console.log(`\n=== ${name} ===  ${path}  @${viewport.width}×${viewport.height}`);
  const first = report('首屏', snap1);

  const deltas = [];
  for (const step of then || []) {
    const mark = events.length;
    await step.run(page);
    await page.waitForTimeout(step.waitMs ?? 1500);
    const delta = events.slice(mark).map(r => ({ ...r }));
    const s = report(step.label, delta);
    deltas.push({ label: step.label, list: delta, total: s.total });
  }

  const counts = new Map();
  for (const r of events) counts.set(r.url, (counts.get(r.url) || 0) + 1);
  const dupes = [...counts].filter(([, n]) => n > 1);
  if (dupes.length) {
    console.log('   ⚠️ 重复请求:');
    for (const [u, n] of dupes) console.log(`      ×${n}  ${short(u)}`);
  } else {
    console.log('   ✅ 无重复请求');
  }
  await ctx.close();
  return { name, first: snap1, firstTotal: first.total, deltas };
}

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
});

const all = [];
try {
  all.push(
    await scenario(browser, '① 窄屏首屏 /login', {
      viewport: NARROW,
      path: `/login${QS}`,
      then: [
        { label: '② 拉宽到 1280 的增量', run: p => p.setViewportSize(WIDE), waitMs: 2500 },
        { label: '③ 缩回 390 的增量', run: p => p.setViewportSize(NARROW), waitMs: 1500 }
      ]
    })
  );
  all.push(await scenario(browser, '④ 宽屏首屏 /login', { viewport: WIDE, path: `/login${QS}` }));
  all.push(
    await scenario(browser, '⑤ 窄屏 /m/register?view=compact', {
      viewport: NARROW,
      path: `/m/register${QS}&view=compact`,
      then: [
        { label: '⑤b 拉宽到 1280 的增量', run: p => p.setViewportSize(WIDE), waitMs: 2500 }
      ]
    })
  );
  all.push(
    await scenario(browser, '⑥ 窄屏 /m/login?theme=cyan', {
      viewport: NARROW,
      path: `/m/login${QS}&theme=cyan`
    })
  );
  all.push(
    await scenario(browser, '⑦ 窄屏 /m/register（无参数基线）', {
      viewport: NARROW,
      path: `/m/register${QS}`
    })
  );
} finally {
  await browser.close();
}

console.log(`\n\n================ 汇总（${BLOCK_SW ? 'SW 已屏蔽' : 'SW 启用'}）================`);
for (const r of rows) {
  console.log(
    `${r.label.padEnd(26)} 请求 ${String(r.count).padStart(3)}  过线 ${kb(r.total).padStart(9)}  gzip≈ ${r.gz ? kb(r.gz).padStart(9) : '        —'}`
  );
}

const pre = precacheUrls();
if (!BLOCK_SW && pre.size) {
  const own = new Set(all[0].first.map(r => short(r.url)));
  const swOnly = all[0].first.filter(r => pre.has(short(r.url)) && !own.has(short(r.url)));
  console.log(
    `\nSW 预缓存清单 ${pre.size} 项；其中首访时"页面本来不会请求"的有 ${swOnly.length} 项`
  );
}

writeFileSync(
  join(process.cwd(), BLOCK_SW ? '_budget-page.json' : '_budget-sw.json'),
  JSON.stringify({ blockSW: BLOCK_SW, rows, scenarios: all }, null, 1)
);
console.log(`明细已写入 ${BLOCK_SW ? '_budget-page.json' : '_budget-sw.json'}`);
