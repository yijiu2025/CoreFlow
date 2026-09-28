/**
 * 面板验收 v3：新结构（**只控制当前页**的版式与配色）
 *
 * 与 v2 的差别（v2 是旧的「按 页面/版式 分组 + 跨页跳转」结构，已退役）：
 *   • 面板**不再列其它页面**：`login/base` 这种带页前缀的选择器已不存在，
 *     `data-color-pick` 的取值就是**纯颜色 id**（black / white / cyan …）
 *   • 面板**不再跨页跳转**：切版式只改 `?view=`，path 不动
 *
 * 断言分七段：
 *   A. 面板能开出来
 *   B. 只显示**当前页**的版式（无跨页分组），且版式清单**真的渲染出来**
 *   C. 颜色清单跟着**当前版式**走（login/default 5 色；register/default 4 色）
 *   D. 点色卡：黑 → dark，白 → light，彩色 → 只换色不动明暗
 *   E. 切版式只改 query、path 不动；且切完颜色清单随之变化
 *   F. 小视口下默认折叠
 *   G. 页面推断：`/mini-login` 也要认得出是 `login`（`mini-` 前缀剥离）
 *
 * === 2026-09-27 修：本关卡曾是"长红的关卡" ===
 * 它当时断言 `data-view-id` 里有 `base`，而 2026-09-26 起**一个主题包 = 一种版式**
 * ⇒ 面板列的是**包名**（`default` / `compact`），`base` 已不存在。
 * 于是它长期为红，把 `pages.ts` 的静默失效（`isViewRegistry` 恒假 → 版式区永不渲染）
 * **淹没在同一片红里**，真红被掩护了整整一轮。
 * ⇒ 口径已对齐到包名；`B1/B2` 现在断言的是**渲染出来的清单**（不是某个具体名字），
 *   `base` 只作为"绝不该出现"的负向断言保留。
 *
 * 用法：node verify-panel-v3.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const QS = 'appName=posecraft&client_id=demo-client-001';

let pass = 0;
const fails = [];
const check = (n, ok, extra = '') => {
  if (ok) {
    pass++;
    console.log(`  ✅ ${n}${extra ? '  ' + extra : ''}`);
  } else {
    fails.push(n);
    console.log(`  ❌ ${n}${extra ? '  ' + extra : ''}`);
  }
};

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
});

/** 读面板上的颜色清单（当前版式） */
const colorsNow = page =>
  page.$$eval('[data-color-pick]', els => els.map(e => e.getAttribute('data-color-pick')));

/** 读面板上的版式清单（当前页） */
const viewsNow = page =>
  page.$$eval('[data-view-id]', els => els.map(e => e.getAttribute('data-view-id')));

/**
 * 点一个不存在的选择器会**抛超时**把整个脚本带走（后面的段落全跑不到）。
 * 面板上的元素是"被测对象"，缺了就是断言失败，不该是脚本崩溃 —— 这里包一层。
 */
const clickIfAny = async (page, selector) => {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return false;
  await el.click();
  return true;
};

/* ===== 窄视口（≥768 会跳电脑版，web 端只有黑白两色）===== */
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/m/login?${QS}&debug=theme`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const panel = page.locator('[data-mauth-debug="theme"]');
check('A1 面板已渲染', (await panel.count()) === 1);

/* 面板背景必须不透明（半透明会与页面文字叠字） */
const bg = await panel.evaluate(el => getComputedStyle(el).backgroundColor);
check('A2 面板背景不透明', !/rgba\([^)]*,\s*0?\.\d+\)/.test(bg), `bg=${bg}`);

/* ===== B. 只显示当前页 ===== */
const views = await viewsNow(page);
check('B1 列出当前页的版式', views.length > 0, views.join(', '));
check('B2 列出的是主题包名（当前页默认包 default 在列）', views.includes('default'), views.join(', '));
check('B2b 不再出现已废弃的 base（一个主题包 = 一种版式）', !views.includes('base'), views.join(', '));
check('B3 不含其它页面的分组（无 data-color-group）', (await page.locator('[data-color-group]').count()) === 0);
check('B4 面板上没有跳其它页的链接', (await page.locator('[data-mauth-debug="theme"] a[href]').count()) === 0);
/*
 * 🔴 B5 是**防"静默失效"**的那一条：`pages.ts` 的判据一旦落后于接口（曾经的
 *    `candidate.list`），`pageFromPath` 恒 undefined → 版式区**整块不渲染**，
 *    而页面本身一切正常、零报错。这里断言"版式区那块 DOM 真的在"，
 *    而不是"某个按钮的名字对不对" —— 名字会随口径变，区块的有无不会。
 */
check(
  'B5 版式区真的渲染了（不是只有颜色区）',
  (await panel.locator('text=版式').count()) > 0,
  '版式区缺失 = pages.ts 的页面推断失效（静默，页面仍正常）'
);

/* ===== C. 颜色清单跟着版式走 ===== */
const loginColors = await colorsNow(page);
check('C1 login/default 有 5 色', loginColors.length === 5, loginColors.join(', '));
check(
  'C1b 含 black/white/cyan/blue/rainbow',
  ['black', 'white', 'cyan', 'blue', 'rainbow'].every(c => loginColors.includes(c)),
  loginColors.join(', ')
);
check('C1c 色卡 id 是纯颜色 id（不含斜杠）', loginColors.every(c => !c.includes('/')), loginColors.join(', '));

/* ===== D. 点色卡：换色并同步明暗（明暗 ≡ 色系） =====
 * 🔴 2026-09-25 再改：明暗 ≡ 色系（用户「明暗切换就是切换白色和黑色这个色系，
 *    不是另一套规则」）。点「黑」→ 明暗同步为暗；点「白」→ 同步为明。
 */
await page.click('[data-color-pick="black"]');
await page.waitForTimeout(1000);
let st = await page.evaluate(() => ({
  theme: document.documentElement.dataset.mauthTheme,
  canvas: document.documentElement.style.getPropertyValue('--mauth-canvas'),
  dark: document.documentElement.classList.contains('dark')
}));
check('D1 点「黑」→ theme=black', st.theme === 'black', `theme=${st.theme}`);
check('D2 点「黑」→ 自带纯黑底 #000000', st.canvas === '#000000', `canvas=${st.canvas}`);
check('D2b 点「黑」→ 明暗同步为暗', st.dark === true, `dark=${st.dark}`);

await page.click('[data-color-pick="white"]');
await page.waitForTimeout(1000);
st = await page.evaluate(() => ({
  theme: document.documentElement.dataset.mauthTheme,
  canvas: document.documentElement.style.getPropertyValue('--mauth-canvas'),
  dark: document.documentElement.classList.contains('dark')
}));
check('D3 点「白」→ theme=white', st.theme === 'white', `theme=${st.theme}`);
check('D4 点「白」→ 自带白底 #ffffff', st.canvas === '#ffffff', `canvas=${st.canvas}`);
check('D4b 点「白」→ 明暗同步为明', st.dark === false, `dark=${st.dark}`);

await page.click('[data-color-pick="cyan"]');
await page.waitForTimeout(1000);
st = await page.evaluate(() => ({
  theme: document.documentElement.dataset.mauthTheme,
  primary: document.documentElement.style.getPropertyValue('--mauth-primary') || '(空)',
  dark: document.documentElement.classList.contains('dark')
}));
check('D5 点「青」→ theme=cyan', st.theme === 'cyan', `theme=${st.theme}`);
check('D6 点「青」→ 注入青主色', st.primary === '#0e7490', `primary=${st.primary}`);
check('D7 点「青」→ 明暗保持 light', st.dark === false, `dark=${st.dark}`);

/* ===== E. 切版式：只改 query、path 不动 =====
 * ⚠️ 这一段必须跑在 **register** 上，不能跑 login —— login 目前只有 default 一个包
 *    （没有第二个覆盖 login 的包），面板上只有一个按钮，没有可切的第二项。
 *    register 有 `compact` 包。
 */
const ctxReg = await browser.newContext({ viewport: { width: 420, height: 900 } });
const pReg = await ctxReg.newPage();
await pReg.goto(`${BASE}/m/register?${QS}&debug=theme`, { waitUntil: 'domcontentloaded' });
await pReg.waitForTimeout(5000);

const regViews = await viewsNow(pReg);
const regColorsBase = await colorsNow(pReg);
check('E0 register 列出 default + compact', regViews.length === 2, regViews.join(', '));

const beforePath = new URL(pReg.url()).pathname;
const clicked = await clickIfAny(pReg, '[data-view-id="compact"]');
check('E0b 面板上有 compact 按钮可点', clicked, '缺了会让下面的断言全部失去意义');
await pReg.waitForTimeout(1800);
if (clicked) {
  const after = await pReg.evaluate(() => ({
    path: location.pathname,
    view: new URLSearchParams(location.search).get('view'),
    clientId: new URLSearchParams(location.search).get('client_id')
  }));
  check('E1 切版式 → path 不变（不跨页）', after.path === beforePath, `${beforePath} → ${after.path}`);
  check('E2 切版式 → view 写入 query', after.view === 'compact', `view=${after.view}`);
  check('E3 授权上下文 client_id 仍在', after.clientId === 'demo-client-001', `client_id=${after.clientId}`);

  const regColorsCompact = await colorsNow(pReg);
  check(
    'E4 compact 与 default 配色清单一致（2026-09-25 补齐 compact 的 blue/cyan）',
    regColorsCompact.length === 4 && regColorsBase.length === 4,
    `default=[${regColorsBase}] → compact=[${regColorsCompact}]`
  );

  /*
   * 切回默认包 —— 分两步，因为"点按钮"的语义是**选中它**，不是"清空"：
   *   ① 从 compact 点回 default：default ≠ 当前生效项 → 显式写 `view=default`
   *   ② 已经是 default 了再点一次：这一项就是当前生效项 → 把参数**删掉**（URL 干净）
   * 旧关卡只断言 ① 的结果是"没有 view 参数"，把 ① 和 ② 混成一条了 —— 那是错的期望值。
   */
  const readState = () =>
    pReg.evaluate(() => ({
      view: new URLSearchParams(location.search).get('view'),
      // `?debug=theme` 下 store 会挂这个口子（见 stores/theme.ts 末尾），读的是真实生效值
      activeView: window.__MAUTH_STORE__?.activeView
    }));

  const backClicked = await clickIfAny(pReg, '[data-view-id="default"]');
  check('E5a 面板上有 default 按钮可点（切回当前包）', backClicked);
  await pReg.waitForTimeout(1500);
  const s1 = await readState();
  check(
    'E5 切回默认包 → 生效版式回到 default',
    s1.activeView === 'default',
    `view=${s1.view} activeView=${s1.activeView}`
  );

  const againClicked = await clickIfAny(pReg, '[data-view-id="default"]');
  await pReg.waitForTimeout(1200);
  const s2 = await readState();
  check(
    'E6 再点当前生效项 → view 参数被删（URL 干净）',
    againClicked && s2.view === null,
    `view=${s2.view}`
  );
}
await ctxReg.close();

await ctx.close();

/* ===== C2 register/default 颜色数（另一页，用独立上下文验证"每页不同"）===== */
const ctx3 = await browser.newContext({ viewport: { width: 420, height: 900 } });
const p3 = await ctx3.newPage();
await p3.goto(`${BASE}/m/register?${QS}&debug=theme`, { waitUntil: 'domcontentloaded' });
await p3.waitForTimeout(5000);
const regColors = await colorsNow(p3);
check('C2 register/default 有 4 色（无 rainbow）', regColors.length === 4, regColors.join(', '));
check('C2b register 不含 rainbow', !regColors.includes('rainbow'), regColors.join(', '));
await ctx3.close();

/* ===== F. 小视口：默认折叠 ===== */
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 480 } });
const p2 = await ctx2.newPage();
await p2.goto(`${BASE}/m/login?${QS}&debug=theme`, { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(4500);
const box = await p2.locator('[data-mauth-debug="theme"]').boundingBox();
check('F1 小视口默认折叠（高 < 80px）', box && box.height < 80, `h=${box && Math.round(box.height)}`);
await ctx2.close();

/* ===== G. 页面推断：`/mini-login` 要认得出是 login ===== */
const ctx4 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p4 = await ctx4.newPage();
await p4.goto(`${BASE}/mini-login?${QS}&debug=theme`, { waitUntil: 'domcontentloaded' });
await p4.waitForTimeout(5000);
const miniViews = await viewsNow(p4);
const miniColors = await colorsNow(p4);
check(
  'G1 `/mini-login` 也推断出页面为 login（mini- 前缀被剥掉）',
  miniViews.length > 0 && miniColors.length > 0,
  `版式=[${miniViews}] 颜色=[${miniColors}]`
);
check('G2 mini 设备下也有 default 包', miniViews.includes('default'), miniViews.join(', '));
await ctx4.close();

await browser.close();
console.log(`\n===== 通过 ${pass} / 失败 ${fails.length} =====`);
if (fails.length) {
  for (const f of fails) console.log('  -', f);
  process.exitCode = 1;
}
