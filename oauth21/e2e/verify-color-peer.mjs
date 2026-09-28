/**
 * 验收：五色**完全并列**，底色由配色自己决定，与明暗偏好无关
 *
 * 用户诉求（2026-09-25）：
 *   「黑白色和蓝青色应当同等，他们只是一个选项而已…
 *     蓝色没有白蓝和黑蓝之分，底色由蓝色自己选择设置」
 *
 * 核心断言：
 *   A. 三场景一致：直接蓝 ≡ 先黑后蓝 ≡ 先白后蓝（底色逐项相同）
 *   B. 底色自决 + 明暗联动跨系别：同一套配色底色不因明暗档变（黑就是黑）；
 *      切明暗时跨系别跳转（白系+夜间→黑系，再切回→恢复原白系）
 *   C. 蓝（白系）切夜间跳黑、切回恢复蓝（明暗 → 配色联动）
 *   D. 点颜色 = 同步明暗：点「黑」明暗变暗、点「白」明暗变明（明暗 ≡ 色系）
 *
 * 用法：node verify-color-peer.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:5197';
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

/** 底色指纹：画布色 + 页面底色 + 关键 token */
const fingerprint = page =>
  page.evaluate(() => {
    const root = document.documentElement;
    const v = n => root.style.getPropertyValue(n) || '';
    const pageEl = document.querySelector('.mauth-page');
    return {
      theme: root.dataset.mauthTheme || '',
      isDark: root.classList.contains('dark'),
      canvas: getComputedStyle(root).getPropertyValue('--mauth-canvas').trim(),
      htmlBg: getComputedStyle(root).backgroundColor,
      pageBg: pageEl ? getComputedStyle(pageEl).backgroundColor : '',
      bg: v('--mauth-bg'),
      text: v('--mauth-text'),
      primary: v('--mauth-primary')
    };
  });

const open = async (extraQs = '') => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/m/login?${QS}&debug=theme${extraQs}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  return { ctx, page };
};

const pick = async (page, id) => {
  await page.click(`[data-color-pick="${id}"]`);
  await page.waitForTimeout(1200);
};

/* ================= A. 三场景一致 ================= */
console.log('\n=== A. 直接蓝 ≡ 先黑后蓝 ≡ 先白后蓝 ===');

const a1 = await open();
await pick(a1.page, 'blue');
const directBlue = await fingerprint(a1.page);
await a1.ctx.close();

const a2 = await open();
await pick(a2.page, 'black');
await pick(a2.page, 'blue');
const blackThenBlue = await fingerprint(a2.page);
await a2.ctx.close();

const a3 = await open();
await pick(a3.page, 'white');
await pick(a3.page, 'blue');
const whiteThenBlue = await fingerprint(a3.page);
await a3.ctx.close();

const eq = (x, y) =>
  x.canvas === y.canvas && x.htmlBg === y.htmlBg && x.bg === y.bg && x.text === y.text;
check('A1 直接蓝 === 先黑后蓝', eq(directBlue, blackThenBlue), `${directBlue.canvas} / ${blackThenBlue.canvas}`);
check('A2 直接蓝 === 先白后蓝', eq(directBlue, whiteThenBlue), `${directBlue.canvas} / ${whiteThenBlue.canvas}`);
check('A3 蓝的底色是蓝自己的（非黑非白）', directBlue.canvas === '#d8e9f8', directBlue.canvas);
console.log('      三场景画布色:', directBlue.canvas, '/', blackThenBlue.canvas, '/', whiteThenBlue.canvas);

/* ================= B. 底色自决 + 明暗联动跨系别 ================= */
console.log('\n=== B. 同一套配色底色不因明暗档变；切明暗跨系别跳转 ===');

// B1/B2: 黑就是黑 —— 黑系 + dark 是同系别，切 dark 不换
const b1 = await open();
await pick(b1.page, 'black');
const blackLightMode = await fingerprint(b1.page);       // 明暗仍是 system(浅)
await b1.page.click('[data-mode="dark"]');
await b1.page.waitForTimeout(1200);
const blackDarkMode = await fingerprint(b1.page);        // 明暗切到 dark
await b1.ctx.close();
check('B1 「黑」在 light 档下底色 = #000000', blackLightMode.canvas === '#000000', blackLightMode.canvas);
check('B2 「黑」在 dark 档下底色同样 = #000000（黑系+dark 不换）', blackDarkMode.canvas === '#000000', blackDarkMode.canvas);

// B3-B5: 白系 + 夜间 → 黑系；再切回 light → 恢复原白系槽
const b2 = await open();
await pick(b2.page, 'white');
const whiteLight = await fingerprint(b2.page);           // 白 + light
await b2.page.click('[data-mode="dark"]');
await b2.page.waitForTimeout(1200);
const whiteToDark = await fingerprint(b2.page);          // 白系 + dark → 黑
await b2.page.click('[data-mode="light"]');
await b2.page.waitForTimeout(1200);
const whiteBack = await fingerprint(b2.page);            // 切回 light → 恢复白
await b2.ctx.close();
check('B3 「白」在 light 档下底色 = #ffffff', whiteLight.canvas === '#ffffff', whiteLight.canvas);
check('B4 白系 + 切夜间 → 跳黑系（#000000）', whiteToDark.canvas === '#000000', whiteToDark.canvas);
check('B4 后 theme=black', whiteToDark.theme === 'black', whiteToDark.theme);
check('B5 再切回 light → 恢复白系（#ffffff）', whiteBack.canvas === '#ffffff', whiteBack.canvas);
check('B5 后 theme=white', whiteBack.theme === 'white', whiteBack.theme);

/* ================= C. 蓝（白系）切夜间跳黑、切回恢复蓝 ================= */
console.log('\n=== C. 「蓝」在浅色下是蓝自己；切夜间跳黑，切回恢复蓝 ===');

const c1 = await open();
await pick(c1.page, 'blue');
const blueLight = await fingerprint(c1.page);            // 蓝 + light
await c1.page.click('[data-mode="dark"]');
await c1.page.waitForTimeout(1200);
const blueToDark = await fingerprint(c1.page);           // 蓝(白系) + dark → 黑
await c1.page.click('[data-mode="light"]');
await c1.page.waitForTimeout(1200);
const blueBack = await fingerprint(c1.page);             // 切回 light → 恢复蓝
await c1.ctx.close();

check('C1 蓝在浅色偏好下底色 = #d8e9f8（蓝自己）', blueLight.canvas === '#d8e9f8', blueLight.canvas);
check('C2 蓝(白系) + 切夜间 → 跳黑系（#000000）', blueToDark.canvas === '#000000', blueToDark.canvas);
check('C2 后 theme=black', blueToDark.theme === 'black', blueToDark.theme);
check('C3 再切回 light → 恢复蓝（#d8e9f8）', blueBack.canvas === '#d8e9f8', blueBack.canvas);
check('C3 后 theme=blue', blueBack.theme === 'blue', blueBack.theme);

/* ================= D. 点颜色 = 同步明暗（明暗 ≡ 色系） ================= */
console.log('\n=== D. 点颜色同步明暗 ===');

const d1 = await open();
await d1.page.click('[data-mode="dark"]');
await d1.page.waitForTimeout(1000);
await pick(d1.page, 'white');
const afterWhite = await fingerprint(d1.page);
await pick(d1.page, 'black');
const afterBlack = await fingerprint(d1.page);
await d1.ctx.close();

check('D1 点「白」（白系）→ 明暗同步为明（isDark=false）', afterWhite.isDark === false, `isDark=${afterWhite.isDark}`);
check('D2 点「白」后 theme=white', afterWhite.theme === 'white', afterWhite.theme);
check('D3 点「黑」（黑系）→ 明暗同步为暗（isDark=true）', afterBlack.isDark === true, `isDark=${afterBlack.isDark}`);
check('D4 点「黑」后 theme=black', afterBlack.theme === 'black', afterBlack.theme);

/* ================= E. 五色齐全且并列 ================= */
console.log('\n=== E. 五个并列选项 ===');
const e1 = await open();
const colors = await e1.page.$$eval('[data-color-pick]', els =>
  els.map(x => x.getAttribute('data-color-pick'))
);
await e1.ctx.close();
check('E1 颜色清单含 5 种', colors.length === 5, colors.join(', '));
check(
  'E2 黑白蓝青彩齐全',
  ['black', 'white', 'blue', 'cyan', 'rainbow'].every(c => colors.includes(c)),
  colors.join(', ')
);

/* ================= F. 跨设备系别一致（mobile blue → standard 回落 white） ================= */
console.log('\n=== F. 同系别跨设备保持：mobile blue → standard 回落 white → 缩回恢复 blue ===');

const f1 = await open();
await pick(f1.page, 'blue');
const blueMobile = await fingerprint(f1.page);          // 窄屏 mobile blue
// 拉宽到桌面 → 分发器渲染 StandardLogin、activeDevice=standard；blue 在 standard 没有 → 同系别回落 white
await f1.page.setViewportSize({ width: 1440, height: 900 });
await f1.page.waitForTimeout(1500);
const blueWide = await fingerprint(f1.page);            // standard white（系别回落）
// 缩回窄视口 → activeDevice=mobile，blue 重新生效
await f1.page.setViewportSize({ width: 420, height: 900 });
await f1.page.waitForTimeout(1500);
const blueNarrowBack = await fingerprint(f1.page);
await f1.ctx.close();

check('F1 窄屏 mobile blue 底色 = #d8e9f8', blueMobile.canvas === '#d8e9f8', blueMobile.canvas);
check('F2 拉宽 standard 无 blue → 同系别回落 white（#ffffff）', blueWide.canvas === '#ffffff', blueWide.canvas);
check('F3 缩回窄屏 → blue 重新生效（#d8e9f8）', blueNarrowBack.canvas === '#d8e9f8', blueNarrowBack.canvas);

await browser.close();
console.log(`\n===== 通过 ${pass} / 失败 ${fails.length} =====`);
if (fails.length) {
  for (const f of fails) console.log('  -', f);
  process.exitCode = 1;
}
