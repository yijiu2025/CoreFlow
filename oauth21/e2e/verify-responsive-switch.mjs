/**
 * 宽窄切换（响应式换形态）时的主题一致性验收 —— 跑**生产构建**（预览服务器）
 *
 * 用户问：「第一次加载是窄屏、加载手机端，拉宽后开始加载电脑端，这个阶段主题切换、
 * 预加载会不会有问题」。本关卡就把这条路径逐帧钉住。
 *
 * 断言分四类：
 *   T. **主题跟着形态走**：拉宽后生效配色 = 该设备作用域下的结果（能命中就命中，
 *      命中不了按**同系别**下沉），`data-mauth-theme` 与 token 必须一致（不许撕裂）。
 *   D. **DOM 真的换了形态**：`.mauth-page`（手机端）/ `.standard-login-root`（桌面）互斥出现。
 *   S. **附加样式不残留**：`<style id="mauth-theme-css">` 在目标配色没有 theme.scss 时必须被摘掉。
 *   N. **零新流量**：拉宽 / 缩窄的增量请求数必须是 0（chunk 已在缓存里）。
 *
 * 用法: node verify-responsive-switch.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:5189';
const QS = '?appName=posecraft&client_id=demo-client-001';
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };

/** 手机端 blue 的主色（default/mobile/login/colors/blue） */
const BLUE = '#2f7fd6';
/** 白系标配 white 的主色（default/mobile|standard/login/colors/white） */
const WHITE = '#1e293b';

let pass = 0;
const fails = [];
const check = (name, ok, extra = '') => {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${name}${extra ? `  ${extra}` : ''}`);
  } else {
    fails.push(name);
    console.log(`  ❌ ${name}${extra ? `  ${extra}` : ''}`);
  }
};

/**
 * 只统计**静态资源**请求，排除 `XHR` / `Fetch` / `Other`。
 *
 * ⚠️ 这条过滤是必须的：登录页有二维码轮询（`/oauth2.1/qr/generate`），它随时可能落进
 * "拉宽"的统计窗口里 —— 本关就因此**假红过一次**（B4 报 +31）。本断言要守的是
 * "形态切换不产生新的**资源**流量"，而业务轮询与形态无关。
 *
 * ⚠️ 同时用 `requestWillBeSent`（带 `type`）计数，而不是只数 `loadingFinished` 的次数 ——
 * 后者拿不到类型，没法过滤。
 */
async function attach(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const STATIC = new Set(['Document', 'Stylesheet', 'Script', 'Font', 'Image', 'Media', 'Manifest']);
  const typeOf = new Map();
  let bytes = 0;
  let count = 0;
  let biz = 0;
  cdp.on('Network.requestWillBeSent', e => {
    const type = e.type || 'Other';
    typeOf.set(e.requestId, type);
    if (STATIC.has(type)) count += 1;
    else biz += 1;
  });
  cdp.on('Network.loadingFinished', e => {
    if (STATIC.has(typeOf.get(e.requestId) ?? 'Other')) bytes += e.encodedDataLength || 0;
  });
  return () => ({ count, bytes, biz });
}

/** 当前页面的主题 + 形态快照（全部取自 DOM / 计算样式，生产构建也能读） */
const snapshot = page =>
  page.evaluate(() => {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const style = document.getElementById('mauth-theme-css');
    const q = s => document.querySelector(s) !== null;
    return {
      themeAttr: root.dataset.mauthTheme ?? null,
      primary: (cs.getPropertyValue('--mauth-primary') || '').trim(),
      radius: (cs.getPropertyValue('--mauth-radius') || '').trim(),
      dark: root.classList.contains('dark'),
      styleLen: style ? (style.textContent || '').length : 0,
      mobileLayout: q('.mauth-page'),
      standardLayout: q('.standard-login-root') || q('.stdreg-root'),
      miniLayout: q('.mini-login-root') || q('.mini-reg-root'),
      compactLayout: q('.mreg')
    };
  });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
});

/** 跑一个「窄屏 → 拉宽 → 缩窄」的三段场景 */
async function responsive(browser, title, path, opts = {}) {
  console.log(`\n=== ${title} ===  ${path}`);
  const ctx = await browser.newContext({ viewport: NARROW, colorScheme: 'light' });
  const page = await ctx.newPage();
  const read = await attach(page);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  /**
   * 取基准前必须等首屏网络**真正稳定**，不能用固定 sleep：
   * 迟到的资源请求会被算进"拉宽新增"，让 B4 随机假红（本关踩过一次，同一产物连跑三次
   * 前两次 +31 / 后两次 +0）。判据用"计数连续两次采样不变"。
   */
  let prev = -1;
  for (let i = 0; i < 15 && prev !== read().count; i += 1) {
    prev = read().count;
    await page.waitForTimeout(700);
  }

  const before = await snapshot(page);
  const t0 = read();
  const n0 = t0.count;
  console.log(`  窄屏稳定：静态资源 ${n0} 个 · 业务请求 ${t0.biz} 个`);
  await page.setViewportSize(WIDE);
  await page.waitForTimeout(2000);
  const wide = await snapshot(page);
  const n1 = read().count;
  await page.setViewportSize(NARROW);
  await page.waitForTimeout(1800);
  const back = await snapshot(page);
  const t2 = read();
  const n2 = t2.count;

  await ctx.close();
  return {
    before,
    wide,
    back,
    widenReq: n1 - n0,
    shrinkReq: n2 - n1,
    widenBiz: t2.biz - t0.biz,
    ...opts
  };
}

// ── A. `?theme.mobile=blue`：手机端有 blue，电脑端没有 → 拉宽应同系别下沉到 white
{
  const r = await responsive(browser, 'A. /login?theme.mobile=blue', `/login${QS}&theme.mobile=blue`);
  check('A1 窄屏渲染手机端版式', r.before.mobileLayout, `mauth-page=${r.before.mobileLayout}`);
  check('A2 窄屏生效 blue（主色 #2f7fd6）', r.before.primary === BLUE, `--mauth-primary=${r.before.primary}`);
  check('A3 窄屏 data-mauth-theme=blue', r.before.themeAttr === 'blue', `attr=${r.before.themeAttr}`);
  check('A4 窄屏挂了 blue 的附加样式（背景图）', r.before.styleLen > 0, `style 长度=${r.before.styleLen}`);
  check('A5 拉宽后渲染桌面版式', r.wide.standardLayout, `standard=${r.wide.standardLayout}`);
  check('A6 拉宽后同系别下沉到 white（主色 #1e293b）', r.wide.primary === WHITE, `--mauth-primary=${r.wide.primary}`);
  check(
    'A7 拉宽后摘掉 data-mauth-theme（没命中登记配色就不许写）',
    r.wide.themeAttr === null,
    `attr=${r.wide.themeAttr}`
  );
  check('A8 拉宽后摘掉手机端的 theme.scss（白系标准端没有附加样式）', r.wide.styleLen === 0, `style 长度=${r.wide.styleLen}`);
  check('A9 拉宽零新请求', r.widenReq === 0, `+${r.widenReq} 个静态资源（同期业务请求 +${r.widenBiz}，不计入）`);
  check('A10 缩窄回到 blue + 手机端版式', r.back.primary === BLUE && r.back.mobileLayout, `${r.back.primary}/${r.back.mobileLayout}`);
  check('A11 缩窄零新请求（走内存缓存）', r.shrinkReq === 0, `+${r.shrinkReq} 个请求`);
  check('A12 缩窄后附加样式恢复', r.back.styleLen > 0, `style 长度=${r.back.styleLen}`);
}

// ── B. 无主题参数：两端都命中 white，切形态应逐项一致（这是"不该有任何变化"的对照）
{
  const r = await responsive(browser, 'B. /login（无参数，对照）', `/login${QS}`);
  check('B1 窄屏主色 = white', r.before.primary === WHITE, `--mauth-primary=${r.before.primary}`);
  check('B2 拉宽后主色不变（两端都有 white，非回落）', r.wide.primary === WHITE, `--mauth-primary=${r.wide.primary}`);
  check('B3 拉宽后 data-mauth-theme 仍为 white', r.wide.themeAttr === 'white', `attr=${r.wide.themeAttr}`);
  check('B4 拉宽零新请求', r.widenReq === 0, `+${r.widenReq} 个静态资源（同期业务请求 +${r.widenBiz}，不计入）`);
  check('B5 拉宽后渲染桌面版式', r.wide.standardLayout, `standard=${r.wide.standardLayout}`);
}

// ── C. 非内置包版式：手机端 compact，拉宽后该包没有 standard 端 → 回落到当前包
{
  const r = await responsive(
    browser,
    'C. /m/register?view=compact',
    `/m/register${QS}&view=compact`
  );
  check('C1 窄屏用 compact 版式', r.before.compactLayout, `.mreg=${r.before.compactLayout}`);
  check('C2 拉宽后换成桌面版式（compact 无 standard 端）', r.wide.standardLayout, `standard=${r.wide.standardLayout}`);
  check('C3 拉宽后不再有 compact 版式根', !r.wide.compactLayout, `.mreg=${r.wide.compactLayout}`);
  check('C4 拉宽零新请求（compact chunk 已在缓存，且桌面不需要它）', r.widenReq === 0, `+${r.widenReq} 个静态资源（同期业务请求 +${r.widenBiz}，不计入）`);
  check('C5 缩窄回到 compact 版式', r.back.compactLayout, `.mreg=${r.back.compactLayout}`);
  check('C6 缩窄零新请求', r.shrinkReq === 0, `+${r.shrinkReq} 个请求`);
}

await browser.close();

console.log(`\n================ 结果 ================`);
console.log(`通过 ${pass} 项${fails.length ? `，失败 ${fails.length} 项：` : '，全部通过'}`);
for (const f of fails) console.log(`   ❌ ${f}`);
process.exit(fails.length ? 1 : 0);
