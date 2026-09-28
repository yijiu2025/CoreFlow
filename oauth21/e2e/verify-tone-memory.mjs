/**
 * 验证明暗切换记忆槽的新语义（会话级、只记切走前）：
 *  1. 全新用户（跟随系统+亮）→ 首屏白系 white
 *  2. 点黑卡（黑系）→ 点「明」→ 应切到 white（不是 blue）【核心】
 *  3. 点蓝卡（白系）→ 点「暗」→ black → 点「明」→ 应恢复 blue（保持蓝色）【核心】
 * 退出码 0 = 全过。
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.clear());

let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
  if (cond) pass++;
  else fail++;
};
const theme = () =>
  page.evaluate(() => document.documentElement.dataset.mauthTheme || '(none)');

await page.goto(`${BASE}/m/login?appName=posecraft&client_id=demo-client-001&debug=theme`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

// 1. 首屏白系
assert('1 全新用户首屏 white', (await theme()) === 'white', await theme());

// 2. 点黑卡 → 黑系；点「明」→ 应 white（不是 blue）
await page.click('[data-color-pick="black"]');
await page.waitForTimeout(1000);
assert('2a 点黑卡 → black', (await theme()) === 'black', await theme());
await page.click('[data-mode="light"]');
await page.waitForTimeout(1200);
assert('2b 黑色主题点「明」→ white（不是 blue）', (await theme()) === 'white', await theme());

// 3. 点蓝卡 → 白系；点「暗」→ black；点「明」→ 恢复 blue
await page.click('[data-color-pick="blue"]');
await page.waitForTimeout(1000);
assert('3a 点蓝卡 → blue', (await theme()) === 'blue', await theme());
await page.click('[data-mode="dark"]');
await page.waitForTimeout(1200);
assert('3b 点「暗」→ black', (await theme()) === 'black', await theme());
await page.click('[data-mode="light"]');
await page.waitForTimeout(1200);
assert('3c 蓝色切黑再切回 → 保持 blue', (await theme()) === 'blue', await theme());

// 4. 用户场景：cyan 下点黑卡 → 点「明」应回 white（手动点黑打断记忆链，清空 lightColor）
await page.click('[data-color-pick="cyan"]');
await page.waitForTimeout(1000);
assert('4a 点青卡 → cyan', (await theme()) === 'cyan', await theme());
await page.click('[data-mode="dark"]');
await page.waitForTimeout(1200);
assert('4b 切「暗」→ black（记 lightColor=cyan）', (await theme()) === 'black', await theme());
await page.click('[data-mode="light"]');
await page.waitForTimeout(1200);
assert('4c 切「明」→ 恢复 cyan', (await theme()) === 'cyan', await theme());
await page.click('[data-color-pick="black"]');
await page.waitForTimeout(1000);
assert('4d 手动点黑卡 → black（清空 lightColor）', (await theme()) === 'black', await theme());
await page.click('[data-mode="light"]');
await page.waitForTimeout(1200);
assert('4e 手动点黑后点「明」→ white（不是 cyan）', (await theme()) === 'white', await theme());

console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAIL'}  ${pass}/${pass + fail}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
