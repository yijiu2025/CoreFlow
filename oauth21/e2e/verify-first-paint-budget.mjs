/**
 * 首屏请求清单验收：证明「按需加载」没有被破坏
 *
 * 用户要求原话：「第一次访问链接会加载多余文件吗，开发要遵寻按需加载」。
 *
 * 这条不变量一旦破了**功能一切正常、只是首屏悄悄多了一堆请求** —— 其它关卡全都不会红，
 * 所以必须用真实网络清单来证。
 *
 * === 首屏到底应该加载什么（2026-09-26 实测口径，别再凭感觉）===
 * 不带 theme/view 参数时，**属于设计**的加载：
 *   ① 各主题包根 `index.ts` 与各配色 `index.ts` —— 注册表是 `eager: true` 的同步预载
 *      （体积几百字节，且首帧前就要能同步校验 `?theme=` 合法性），这是刻意设计；
 *   ② **内置包当前页的三个设备版式**（mobile / standard / mini）—— 因为分发器
 *      `view/web/<page>/index.vue` 的 `onMounted` **刻意预热三个形态容器**
 *      （v2.20.1「避免切换闪屏」），而每个容器又静态引入自己设备的版式。
 * 而**属于按需**的加载（本次要守的就是这两条）：
 *   ③ 任何 **非内置包** 的版式 `.vue`（要 `?view=<包名>` 才拉）；
 *   ④ 任何 **`theme.scss`**（要那套配色真的生效才拉）。
 *
 * 断言：
 *   A. 不带参数：③ ④ 都为空；版式 `.vue` 集合恰好 = 内置包当前页的三设备版式
 *   B. 正向对照：`?view=<其它包>` 时那个 chunk **确实出现**（证明本探针看得见差异，不是恒绿）
 *   C. `?theme=cyan` 时**恰好**多出 cyan 的 theme.scss（惰性样式未破坏）
 *   D. 设备维度参数三场景（用户给的三个链接）逐设备验收
 *   E. 两个已修 bug 的回归（差分断言：与不带参数时逐项一致）
 *
 * 用法: node verify-first-paint-budget.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:5177';
/** 业务参数（与主题无关）；`debug=theme` 才会挂 `__MAUTH_STORE__` 探针出口 */
const QS = '?appName=posecraft&client_id=demo-client-001&debug=theme';
/** 内置包（三个设备版式都是它），从注册表实现处取真源见 verify-theme-dirs.mjs */
const BUILTIN = 'default';

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

/** 主题包版式模块：/src/theme/themes/<包>/<设备>/<页面>/index.vue */
const isViewModule = p => /^\/src\/theme\/themes\/[^/]+\/[^/]+\/[^/]+\/index\.vue$/.test(p);
/** 配色的附加样式：/src/theme/themes/<包>/<设备>/<页面>/colors/<配色>/theme.scss */
const isColorStyle = p => /^\/src\/theme\/themes\/[^/]+\/[^/]+\/[^/]+\/colors\/[^/]+\/theme\.scss$/.test(p);
/** 「非内置包的版式 chunk」——本次验收真正要守的那条 */
const isForeignView = p => isViewModule(p) && !p.startsWith(`/src/theme/themes/${BUILTIN}/`);

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
});

/**
 * 打开一个 URL，记录它拉过的所有模块路径。
 * 每个场景都用**全新 context**（空缓存 + 空 localStorage），避免互相污染。
 */
async function visit(path, { width = 1440, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const paths = [];
  page.on('request', r => {
    try {
      paths.push(new URL(r.url()).pathname);
    } catch {
      /* data: / blob: 忽略 */
    }
  });
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  // ⚠️ 不能用 `.mauth-page` 当等待条件：那是**移动端**版式的根类名，
  //    standard / mini 用的是 `std*-*` / `m*-*` 体系。
  // ⚠️ 也不能只等 `__MAUTH_STORE__` 存在：它在 store setup 里就挂了，那一刻
  //    `activeDevice` 还没被 `setupThemeDeviceSync` 赋值（实测会读到 undefined）。
  //    必须等 store **落定**（设备 / 页面 / 生效配色都解析出来）。
  await page.waitForFunction(
    () => {
      const s = window.__MAUTH_STORE__;
      return Boolean(s && s.activeDevice && s.activePage && s.activeView && s.activeThemeId);
    },
    { timeout: 30000 }
  );
  // 再等惰性 chunk（可能的动态 import / theme.scss）落地
  await page.waitForTimeout(900);
  const snapshot = await page.evaluate(() => {
    const s = window.__MAUTH_STORE__;
    const cs = getComputedStyle(document.documentElement);
    return {
      device: s?.activeDevice ?? null,
      page: s?.activePage ?? null,
      view: s?.activeView ?? null,
      themeId: s?.themeId ?? null,
      deviceTheme: s?.deviceTheme ?? null,
      activeThemeId: s?.activeThemeId ?? null,
      activeTone: s?.activeTone ?? null,
      domTheme: document.documentElement.dataset.mauthTheme ?? null,
      domView: document.querySelector('.mauth-page')?.getAttribute('data-mauth-view') ?? null,
      // 生效主色：从**根元素**读 —— token 注入在 `html` 上，与设备无关，
      // 比读某个版式根节点稳（standard/mini 没有 `.mauth-page`）
      primary: cs.getPropertyValue('--mauth-primary').trim()
    };
  });
  await ctx.close();
  const views = paths.filter(isViewModule);
  return {
    paths,
    views,
    uniqViews: [...new Set(views)].sort(),
    foreignViews: [...new Set(paths.filter(isForeignView))].sort(),
    styles: [...new Set(paths.filter(isColorStyle))].sort(),
    snapshot
  };
}

const fmt = a => (a.length ? a.map(p => p.replace('/src/theme/themes/', '')).join(', ') : '(无)');

try {
  console.log('\n===== A. 首次访问（不带任何 theme/view 参数）=====');

  const s1 = await visit(`/login${QS}`);
  check(
    'A1 /login：加载的版式 .vue 恰好是内置包三设备版式（分发器刻意预热三形态，v2.20.1）',
    JSON.stringify(s1.uniqViews) ===
      JSON.stringify([
        `/src/theme/themes/${BUILTIN}/mini/login/index.vue`,
        `/src/theme/themes/${BUILTIN}/mobile/login/index.vue`,
        `/src/theme/themes/${BUILTIN}/standard/login/index.vue`
      ].sort()),
    `实际：${fmt(s1.uniqViews)}`
  );
  check('A2 /login：没有加载**任何非内置包**的版式 chunk', s1.foreignViews.length === 0, `实际：${fmt(s1.foreignViews)}`);
  check('A3 /login：没有加载任何 theme.scss（配色样式是惰性的）', s1.styles.length === 0, `实际：${fmt(s1.styles)}`);
  check('A4 /login：device=standard，生效配色解析成功（非空）', s1.snapshot.device === 'standard' && Boolean(s1.snapshot.activeThemeId), `device=${s1.snapshot.device} activeThemeId=${s1.snapshot.activeThemeId}`);

  const s2 = await visit(`/m/login${QS}`, { width: 390, height: 844 });
  check('A5 /m/login：device=mobile', s2.snapshot.device === 'mobile', `device=${s2.snapshot.device}`);
  check('A6 /m/login：没有加载非内置包的版式 chunk', s2.foreignViews.length === 0, `实际：${fmt(s2.foreignViews)}`);
  check('A7 /m/login：没有 theme.scss', s2.styles.length === 0, `实际：${fmt(s2.styles)}`);

  const s3 = await visit(`/register${QS}`);
  check(
    'A8 /register：版式 .vue 集合里没有 compact 包的 chunk',
    s3.foreignViews.length === 0,
    `实际：${fmt(s3.foreignViews)}`
  );
  check('A9 /register：没有 theme.scss', s3.styles.length === 0, `实际：${fmt(s3.styles)}`);

  const s4 = await visit(`/mini-login${QS}`, { width: 480, height: 860 });
  check('A10 /mini-login：device=mini', s4.snapshot.device === 'mini', `device=${s4.snapshot.device}`);
  check('A11 /mini-login：没有加载非内置包的版式 chunk', s4.foreignViews.length === 0, `实际：${fmt(s4.foreignViews)}`);
  check('A12 /mini-login：没有 theme.scss', s4.styles.length === 0, `实际：${fmt(s4.styles)}`);

  console.log('\n===== B. 正向对照：真要换包时，那个 chunk 必须出现（证明探针看得见差异）=====');
  const b1 = await visit(`/m/register${QS}&view=compact`, { width: 390, height: 844 });
  check(
    'B1 /m/register?view=compact：compact 包 chunk 被加载',
    b1.foreignViews.includes('/src/theme/themes/compact/mobile/register/index.vue'),
    `实际：${fmt(b1.foreignViews)}`
  );
  check(
    'B2 B1 也确实带了内置包版式（容器静态兜底那份）',
    b1.uniqViews.includes(`/src/theme/themes/${BUILTIN}/mobile/register/index.vue`),
    `实际：${fmt(b1.uniqViews)}`
  );
  check('B3 换包后样式仍是惰性的（黑白色都无 theme.scss）', b1.styles.length === 0, `实际：${fmt(b1.styles)}`);
  check(
    'B4 对照成立：不带 view 时 foreignViews 为空、带 view=compact 时非空（探针不是恒绿）',
    s3.foreignViews.length === 0 && b1.foreignViews.length > 0,
    `无参=${s3.foreignViews.length} 条 / view=compact=${b1.foreignViews.length} 条`
  );

  console.log('\n===== C. 需要背景图时才拉 theme.scss（惰性样式未被破坏）=====');
  const c1 = await visit(`/m/login${QS}&theme=cyan`, { width: 390, height: 844 });
  check(
    'C1 /m/login?theme=cyan：恰好加载 cyan 的 theme.scss',
    c1.styles.length === 1 &&
      c1.styles[0] === `/src/theme/themes/${BUILTIN}/mobile/login/colors/cyan/theme.scss`,
    `实际：${fmt(c1.styles)}`
  );
  check('C2 C1 的配色确实切到了 cyan', c1.snapshot.activeThemeId === 'cyan', `activeThemeId=${c1.snapshot.activeThemeId}`);
  check(
    'C3 对照成立：不带 theme 时 0 个 theme.scss、带 theme=cyan 时 1 个',
    s2.styles.length === 0 && c1.styles.length === 1,
    `无参=${s2.styles.length} / theme=cyan=${c1.styles.length}`
  );

  console.log('\n===== D. 设备维度参数三场景（用户给的三个链接）=====');

  // 场景 2：每端各自的配色 + 各自的版式（mini 同样可配）
  const d1 = await visit(`/login${QS}&theme.mobile=blue&theme.standard=black&view.mobile=default&view.standard=compact`);
  check(
    'D1 场景2·桌面：device=standard 且 theme.standard=black 生效（不误用 theme.mobile）',
    d1.snapshot.device === 'standard' && d1.snapshot.activeThemeId === 'black',
    `device=${d1.snapshot.device} activeThemeId=${d1.snapshot.activeThemeId}`
  );
  check(
    'D2 场景2·桌面：view.standard=compact 生效后自动下沉（compact 无 standard/login → default）',
    d1.snapshot.view === 'default',
    `activeView=${d1.snapshot.view} —— 下沉正确，不是 bug`
  );
  check(
    'D3 场景2：deviceTheme 逐设备各记各的（mobile/standard 都记下，mini 可随时加）',
    JSON.stringify(d1.snapshot.deviceTheme) === JSON.stringify({ mobile: 'blue', standard: 'black' }),
    JSON.stringify(d1.snapshot.deviceTheme)
  );

  const d2 = await visit(
    `/m/login${QS}&theme.mobile=blue&theme.standard=black&view.mobile=default&view.standard=compact`,
    { width: 390, height: 844 }
  );
  check(
    'D4 场景2·手机：同一个链接、theme.mobile=blue 生效（两端各自配色）',
    d2.snapshot.device === 'mobile' && d2.snapshot.activeThemeId === 'blue',
    `device=${d2.snapshot.device} activeThemeId=${d2.snapshot.activeThemeId}`
  );
  check('D5 场景2·手机：确实是蓝底（--mauth-primary = blue 的 #2f7fd6）', d2.snapshot.primary === '#2f7fd6', `--mauth-primary=${d2.snapshot.primary}`);

  // 场景 3：每端各自的配色，版式共用一个
  const d3 = await visit(`/login${QS}&theme.mobile=blue&theme.standard=black&view=default`);
  check(
    'D6 场景3·桌面：theme.standard=black + 共用 view=default',
    d3.snapshot.activeThemeId === 'black' && d3.snapshot.view === 'default',
    `activeThemeId=${d3.snapshot.activeThemeId} activeView=${d3.snapshot.view}`
  );
  check('D7 场景3·桌面：DOM 的 data-mauth-theme 与生效配色一致（DOM 不撒谎）', d3.snapshot.domTheme === 'black', `data-mauth-theme=${d3.snapshot.domTheme}`);

  const d4 = await visit(`/m/login${QS}&theme.mobile=blue&view=default`, { width: 390, height: 844 });
  check(
    'D8 场景3·手机：theme.mobile=blue + 共用 view=default 同样生效',
    d4.snapshot.activeThemeId === 'blue' && d4.snapshot.view === 'default',
    `activeThemeId=${d4.snapshot.activeThemeId} activeView=${d4.snapshot.view}`
  );

  // 场景 1：三端共用同一个配色 + 同一个版式，没有就自动下沉
  const d5 = await visit(`/m/login${QS}&theme=blue&view=compact`, { width: 390, height: 844 });
  check('D9 场景1·手机：theme=blue 生效', d5.snapshot.activeThemeId === 'blue', `activeThemeId=${d5.snapshot.activeThemeId}`);
  check(
    'D10 场景1·手机：view=compact 无 login 版式 → 自动下沉回 default，不报错',
    d5.snapshot.view === 'default' && d5.snapshot.domView === 'default',
    `activeView=${d5.snapshot.view} data-mauth-view=${d5.snapshot.domView}`
  );
  const d6 = await visit(`/login${QS}&theme=blue&view=compact`);
  check(
    'D11 场景1·桌面：standard 下无 blue → 按**同系别**下沉（white，而不是 black）',
    d6.snapshot.activeThemeId === 'white' && d6.snapshot.activeTone === 'light',
    `activeThemeId=${d6.snapshot.activeThemeId} tone=${d6.snapshot.activeTone}`
  );
  check(
    'D12 场景1·桌面：下沉时**不写** data-mauth-theme（避免 theme.scss 挂到没生效的配色上）',
    d6.snapshot.domTheme === null,
    `data-mauth-theme=${d6.snapshot.domTheme}`
  );

  // 配色侧的「设备键留空 = 未指定」—— 与版式侧 readDeviceParam 同形（2026-09-26 修）。
  // 坑：`URLSearchParams.get('theme.mobile')` 对 `?theme.mobile=` 返回**空串而不是 null**，
  // 旧写法 `scoped ?? anyScope` 仍是空串 ⇒ `resolveThemeId('')` 返回 null ⇒ 该设备一条锁都不记
  // —— 通用键 `?theme=blue` 被一起吞掉，与"留空 = 这台设备不特殊指定"正好相反。
  const d7 = await visit(`/m/login${QS}&theme=blue&theme.mobile=`, { width: 390, height: 844 });
  check(
    'D13 配色侧设备键留空 = 未指定 ⇒ 通用 theme=blue 仍生效（不吞回退链）',
    d7.snapshot.activeThemeId === 'blue' && d7.snapshot.primary === '#2f7fd6',
    `activeThemeId=${d7.snapshot.activeThemeId} primary=${d7.snapshot.primary}`
  );
  const d8 = await visit(`/m/login${QS}&theme=blue&theme.mobile=cyan`, { width: 390, height: 844 });
  check(
    'D14 配色侧设备键优先于通用键（theme.mobile=cyan 赢 theme=blue）',
    d8.snapshot.activeThemeId === 'cyan',
    `activeThemeId=${d8.snapshot.activeThemeId}`
  );

  console.log('\n===== E. 两个已修 bug 的回归（差分断言：与不带参数时逐项一致）=====');
  // bug1：pick*ViewId 的 URL 分支曾返回 `?? baseId`（'base'），而记录的 view 恒等于包名
  //       → 整条链落空 → tokens 静默丢失。差分：非法 view 值不应改变任何主题结果。
  const e1 = await visit(`/login${QS}&view=typo`);
  check(
    'E1 bug1：?view=typo（非法）与不带 view 时主题结果逐项一致，且 token 非空',
    e1.snapshot.activeThemeId === s1.snapshot.activeThemeId &&
      e1.snapshot.primary === s1.snapshot.primary &&
      Boolean(e1.snapshot.primary),
    `typo: ${e1.snapshot.activeThemeId}/${e1.snapshot.primary} vs 无参: ${s1.snapshot.activeThemeId}/${s1.snapshot.primary}`
  );
  check('E2 bug1：非法 view 落回当前包的版式（不白屏、不留空 view）', Boolean(e1.snapshot.view), `activeView=${e1.snapshot.view}`);

  // bug2：listColorsOf 曾有 `record.view !== BASE_VIEW_ID` 反向兼容分支 → 显式带 view 时列不出配色
  const e3 = await visit(`/m/login${QS}&theme=blue`, { width: 390, height: 844 });
  const e4 = await visit(`/m/login${QS}&theme=blue&view=default`, { width: 390, height: 844 });
  check(
    'E3 bug2：显式带 view=default 时主题色仍生效（与不带 view 逐项一致）',
    e4.snapshot.activeThemeId === e3.snapshot.activeThemeId &&
      e4.snapshot.primary === e3.snapshot.primary &&
      e4.snapshot.primary === '#2f7fd6',
    `带 view: ${e4.snapshot.activeThemeId}/${e4.snapshot.primary} vs 不带: ${e3.snapshot.activeThemeId}/${e3.snapshot.primary}`
  );
} finally {
  await browser.close();
}

const total = pass + fails.length;
console.log(`\n===== ${fails.length === 0 ? '全绿' : '有失败'}：${pass}/${total} 通过 =====`);
if (fails.length) {
  console.log('失败项：');
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
