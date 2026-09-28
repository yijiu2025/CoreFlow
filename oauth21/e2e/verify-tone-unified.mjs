/**
 * 验证「明暗 = 色系」新语义：
 *  1. 全新用户（无落盘，跟随系统 + 系统亮色）→ 首屏对齐白系 white，html 无 dark、外围浅色
 *  2. 点黑卡 → themeId=black 且 mode=dark → html 挂 dark、App 外围 bg-slate-950 深色（核心修复）
 *  3. 点白卡 → mode=light、外围浅色
 *  4. 明暗按钮「暗」→ 切黑系；「明」→ 切白系
 * 退出码 0 = 全过。
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
// 全新用户：确保 localStorage 干净
await page.addInitScript(() => localStorage.clear());

let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
  cond ? pass++ : fail++;
};

const grab = () =>
  page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector('.min-h-screen');
    const field = document.querySelector('.std-field');
    const modeDark = document.querySelector('[data-mode="dark"]');
    const modeLight = document.querySelector('[data-mode="light"]');
    return {
      themeAttr: root.dataset.mauthTheme || '(none)',
      htmlDark: root.classList.contains('dark'),
      htmlBg: getComputedStyle(root).backgroundColor,
      shellBg: shell ? getComputedStyle(shell).backgroundColor : '(no shell)',
      fieldBg: field ? getComputedStyle(field).backgroundColor : '(no field)',
      modeIsDark: !!modeDark && modeDark.className.includes('bg-sky-400/20'),
      modeIsLight: !!modeLight && modeLight.className.includes('bg-sky-400/20'),
    };
  });

await page.goto(`${BASE}/login?appName=posecraft&client_id=demo-client-001&debug=theme`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

// 1. 全新用户 + 跟随系统(亮) → 首屏白系
const a = await grab();
assert('1 全新用户首屏白系 white', a.themeAttr === 'white', a.themeAttr);
assert('1 html 不挂 dark', a.htmlDark === false, a.htmlDark);
assert('1 外围浅色 bg-slate-50', a.shellBg === 'rgb(248, 250, 252)', a.shellBg);

// 2. 点黑卡 → 黑系 + mode=dark + html.dark + 外围深色
await page.click('[data-color-pick="black"]');
await page.waitForTimeout(1200);
const b = await grab();
assert('2 点黑卡 themeAttr=black', b.themeAttr === 'black', b.themeAttr);
assert('2 html 挂 dark（核心修复）', b.htmlDark === true, String(b.htmlDark));
assert('2 明暗意图同步为「暗」', b.modeIsDark === true, `dark=${b.modeIsDark} light=${b.modeIsLight}`);
assert('2 html 背景非红（:global(.dark) 回归）', b.htmlBg !== 'rgba(239, 68, 68, 0.1)', b.htmlBg);
assert('2 html 背景深色画布（v2.18.8 起 black = 纯黑）', b.htmlBg === 'rgb(0, 0, 0)', b.htmlBg);
assert('2 外围深色（black 纯黑底）', b.shellBg === 'rgb(0, 0, 0)', b.shellBg);
assert('2 field 深色（v2.20.0 起 0.10 白半透）', b.fieldBg === 'rgba(255, 255, 255, 0.1)', b.fieldBg);

// 3. 点白卡 → mode=light + 外围浅色
await page.click('[data-color-pick="white"]');
await page.waitForTimeout(1200);
const c = await grab();
assert('3 点白卡 themeAttr=white', c.themeAttr === 'white', c.themeAttr);
assert('3 明暗意图同步为「明」', c.modeIsLight === true, `dark=${c.modeIsDark} light=${c.modeIsLight}`);
assert('3 html 不挂 dark', c.htmlDark === false, String(c.htmlDark));
assert('3 外围浅色', c.shellBg === 'rgb(248, 250, 252)', c.shellBg);

// 4. 明暗按钮「暗」→ 切黑系（themeAttr=black + html.dark）
await page.click('[data-mode="dark"]');
await page.waitForTimeout(1200);
const d = await grab();
assert('4 切「暗」→ black', d.themeAttr === 'black', d.themeAttr);
assert('4 html 挂 dark', d.htmlDark === true, String(d.htmlDark));

// 5. 明暗按钮「明」→ 切白系
await page.click('[data-mode="light"]');
await page.waitForTimeout(1200);
const e = await grab();
assert('5 切「明」→ white', e.themeAttr === 'white', e.themeAttr);
assert('5 html 不挂 dark', e.htmlDark === false, String(e.htmlDark));

console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAIL'}  ${pass}/${pass + fail}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
