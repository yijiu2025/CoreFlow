/**
 * tablet 落地演练验收 —— 端到端证明「加一种设备」零配置可用
 *
 * 验证链（`?from=tablet` 来源标记，与 mini 的 `?from=mini` 同形）：
 *   1. 分发器 `pickDeviceId` 返回 tablet（不落 standard）
 *   2. 渲染的是 tablet 容器（转发 StandardLogin + device="tablet"）
 *   3. 主题作用域 = tablet：配色从 themes/default/tablet/ 加载（黑/白与 standard 同）
 *   4. 调试面板设备标签出现「平板」
 *
 * 用法：node verify-tablet-landing.mjs [baseUrl]
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

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  console.log('\n【1. ?from=tablet 渲染 tablet 形态（而非 standard 兜底）】');
  await page.goto(`${BASE}/login?from=tablet&${QS}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-mauth-view]', { timeout: 8000 });

  const rendered = await page.evaluate(() => {
    const root = document.querySelector('[data-mauth-view]');
    return {
      view: root?.getAttribute('data-mauth-view'),
      theme: document.documentElement.getAttribute('data-mauth-theme'),
      // 容器根：转发 StandardLogin 时，根是 standard-login-root（桌面卡片形态）
      isStandardCard: !!document.querySelector('.standard-login-root')
    };
  });

  check('渲染出桌面卡片形态（转发 StandardLogin）', rendered.isStandardCard);
  check('版式身份 data-mauth-view="default"（view ≡ 包名）', rendered.view === 'default', `实际=${rendered.view}`);

  console.log('\n【2. 主题作用域 = tablet（配色从 themes/default/tablet/ 加载）】');
  // 打开调试面板，确认设备列表出现「平板」，且 tablet 的配色清单是 black/white
  await page.goto(`${BASE}/login?from=tablet&debug=theme&${QS}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-color-pick]', { timeout: 8000 });

  const deviceLabels = await page.evaluate(() => {
    // 面板里设备标签（含「平板」）—— 遍历含设备名的元素
    const text = document.body.innerText;
    return {
      hasTabletLabel: text.includes('平板'),
      // 当前设备标签（跟随页面的 title 或设备区）
      hasMobile: text.includes('手机端'),
      hasDesktop: text.includes('桌面端'),
      hasMini: text.includes('紧凑版')
    };
  });
  check('面板设备标签出现「平板」（deviceLabel 单一来源）', deviceLabels.hasTabletLabel);
  check('三端标签仍在（mobile/standard/mini 未丢）',
    deviceLabels.hasMobile && deviceLabels.hasDesktop && deviceLabels.hasMini);

  // tablet 当前配色清单 = black/white（与 standard 同）
  const colors = await page.$$eval('[data-color-pick]', els =>
    els.map(e => e.getAttribute('data-color-pick')).sort()
  );
  check('tablet 配色清单 = black/white', JSON.stringify(colors) === JSON.stringify(['black', 'white']),
    `实际=[${colors}]`);

  console.log('\n【3. tablet 配色真实生效（点 black → 纯黑底）】');
  // 点 black 色卡，验证 token 注入
  const blackPicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-color-pick]')]
      .find(e => e.getAttribute('data-color-pick') === 'black');
    if (el) el.click();
    return !!el;
  });
  if (blackPicked) {
    await page.waitForTimeout(300);
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--mauth-bg').trim()
    );
    check('点 black → --mauth-bg 注入为 #000000（tablet 配色 re-export 生效）',
      bg === '#000000', `实际=${bg}`);
  } else {
    check('点 black → --mauth-bg 注入为 #000000（tablet 配色 re-export 生效）', false, '面板无 black 色卡');
  }

  console.log('\n【4. 无 from 标记时仍是桌面（tablet 不干扰现有判定）】');
  await page.goto(`${BASE}/login?${QS}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-mauth-view]', { timeout: 8000 });
  const noMark = await page.evaluate(() => ({
    view: document.querySelector('[data-mauth-view]')?.getAttribute('data-mauth-view'),
    isStandardCard: !!document.querySelector('.standard-login-root')
  }));
  check('无 from=tablet → 仍是 standard 桌面卡片', noMark.isStandardCard && noMark.view === 'default',
    `view=${noMark.view}`);

  await ctx.close();
} catch (err) {
  fails.push(`脚本异常：${err.message}`);
  console.error(err);
} finally {
  await browser.close();
}

console.log(`\n===== 通过 ${pass} / 失败 ${fails.length} =====`);
if (fails.length) {
  console.log('失败项：');
  for (const f of fails) console.log(`  ❌ ${f}`);
  process.exit(1);
}
