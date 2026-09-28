/**
 * 移动端重置密码（/m/forgot-password）验收
 *
 * 覆盖四类契约：
 *   ① 与手机端登录/注册页**视觉一致** —— 逐项比对三页同名元素的计算样式（同一套 mauth-* 类）
 *   ② 分步流程可用 —— 初始步、邮箱校验、图形验证码弹窗、进度条比例
 *   ③ 入口链路完整 —— 邮件链接 /reset-password?token=… 重定向、宽视口保持路由渲染桌面版、
 *                      手机端登录页"忘记密码"落到移动端页
 *   ④ 桌面版未被分发器改坏 —— 1440 视口下仍是 AuthContainer 卡片
 *
 * 说明：dev server 的 VITE_PASSWORD_RESET_MODE=code（见 .env.development），
 *      因此这里验的是验证码重置链路；邮件链接模式另由 --mode link 的临时 server 验。
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.VF_BASE || 'http://127.0.0.1:5174';
const QS = '?appName=posecraft&client_id=demo-client-001';
const PHONE = { width: 390, height: 844 };

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(`${name}${detail ? ' → ' + detail : ''}`);
    console.log(`  ❌ ${name}${detail ? ' → ' + detail : ''}`);
  }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function open(path, viewport = PHONE) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  return { ctx, page };
}

/** 抓取三页共有的元素样式（同一套 mauth-* 类必须给出同样的结果） */
const SNAPSHOT_FN = () => {
  const pick = (sel, props) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = cs[p];
    return o;
  };
  return {
    page: pick('.mauth-page', ['backgroundColor', 'height', 'display', 'flexDirection', 'alignSelf']),
    header: pick('.mauth-header', ['backgroundColor', 'paddingTop', 'paddingLeft', 'paddingBottom', 'flexShrink']),
    backBtn: pick('.mauth-back-btn', ['width', 'height', 'borderRadius', 'backgroundColor', 'color']),
    logo: pick('.mauth-logo', ['width', 'height', 'borderRadius', 'backgroundColor']),
    title: pick('.mauth-title', ['fontSize', 'fontWeight', 'color', 'lineHeight']),
    sub: pick('.mauth-sub', ['fontSize', 'color', 'lineHeight']),
    field: pick('.mauth-field', [
      'height',
      'backgroundColor',
      'borderRadius',
      'borderTopWidth',
      'borderTopColor',
      'paddingLeft',
      'columnGap'
    ]),
    input: pick('.mauth-input', ['fontSize', 'color', 'height', 'backgroundColor']),
    icon: pick('.mauth-icon', ['color', 'width', 'height']),
    cta: pick('.mauth-submit', [
      'height',
      'fontSize',
      'fontWeight',
      'borderRadius',
      'backgroundColor',
      'color'
    ]),
    footer: pick('.mauth-footer', ['fontSize', 'color', 'paddingTop']),
    footerBtn: pick('.mauth-register-btn', ['fontSize', 'color', 'fontWeight']),
    err: pick('.mauth-err', ['height', 'fontSize', 'color', 'marginTop', 'paddingLeft'])
  };
};

function diffObjects(a, b) {
  const out = [];
  for (const group of Object.keys(a)) {
    const ga = a[group];
    const gb = b[group];
    if (!ga || !gb) continue;
    for (const prop of Object.keys(ga)) {
      if (ga[prop] !== gb[prop]) out.push(`${group}.${prop}: ${ga[prop]} vs ${gb[prop]}`);
    }
  }
  return out;
}

function countCompared(a, b) {
  let n = 0;
  for (const group of Object.keys(a)) {
    if (!a[group] || !b[group]) continue;
    n += Object.keys(a[group]).length;
  }
  return n;
}

// ============================================================
console.log('\n=== ① 三页视觉一致性（同一套 mauth-* 样式体系）===');

const snapshots = {};
for (const [label, path] of [
  ['login', '/m/login'],
  ['register', '/m/register'],
  ['forgot', '/m/forgot-password']
]) {
  const { ctx, page } = await open(path + QS);
  const hasPage = (await page.locator('.mauth-page').count()) === 1;
  check(`/m/${label === 'login' ? 'login' : label} 渲染移动端版式（.mauth-page）`, hasPage);
  snapshots[label] = await page.evaluate(SNAPSHOT_FN);
  await ctx.close();
}

for (const label of ['register', 'forgot']) {
  const d = diffObjects(snapshots.login, snapshots[label]);
  const n = countCompared(snapshots.login, snapshots[label]);
  check(`login vs ${label}：${n} 项样式完全一致`, d.length === 0, d.slice(0, 6).join(' | '));
}

// 进度条只有注册页与重置页有（登录页无进度条）
{
  const { ctx, page } = await open('/m/register' + QS);
  const regBar = await page.evaluate(() => {
    const el = document.querySelector('.mauth-progress');
    const bar = document.querySelector('.mauth-progress-bar');
    if (!el || !bar) return null;
    const cs = getComputedStyle(el);
    return {
      height: cs.height,
      background: cs.backgroundColor,
      radius: cs.borderRadius,
      fill: getComputedStyle(bar).backgroundColor,
      barHeight: getComputedStyle(bar).height
    };
  });
  await ctx.close();

  const { ctx: c2, page: p2 } = await open('/m/forgot-password' + QS);
  const fpBar = await p2.evaluate(() => {
    const el = document.querySelector('.mauth-progress');
    const bar = document.querySelector('.mauth-progress-bar');
    if (!el || !bar) return null;
    const cs = getComputedStyle(el);
    return {
      height: cs.height,
      background: cs.backgroundColor,
      radius: cs.borderRadius,
      fill: getComputedStyle(bar).backgroundColor,
      barHeight: getComputedStyle(bar).height
    };
  });
  await c2.close();

  check('进度条样式与注册页一致', JSON.stringify(regBar) === JSON.stringify(fpBar), JSON.stringify(fpBar));
}

// ============================================================
console.log('\n=== ② 分步流程（code 模式）===');

{
  const { ctx, page } = await open('/m/forgot-password' + QS);

  const state1 = await page.evaluate(() => ({
    inputs: document.querySelectorAll('.mauth-input').length,
    sub: document.querySelector('.mauth-sub')?.textContent?.trim(),
    cta: document.querySelector('.mauth-submit')?.textContent?.trim(),
    footer: !!document.querySelector('.mauth-footer'),
    barRatio: (() => {
      const bar = document.querySelector('.mauth-progress-bar');
      const box = document.querySelector('.mauth-progress');
      if (!bar || !box) return null;
      return +(bar.getBoundingClientRect().width / box.getBoundingClientRect().width).toFixed(3);
    })()
  }));

  check('初始为「输入邮箱」步（单字段）', state1.inputs === 1, `inputs=${state1.inputs}`);
  check('副标题显示步骤 1/3', /1\/3/.test(state1.sub || ''), state1.sub);
  check('CTA 文案为「发送验证码」', /发送验证码/.test(state1.cta || ''), state1.cta);
  check('进度条约 1/3', state1.barRatio !== null && Math.abs(state1.barRatio - 0.333) < 0.02, `ratio=${state1.barRatio}`);
  check('底部有返回登录入口', state1.footer);

  // 空邮箱提交：拦截 + 不弹图形码
  await page.click('.mauth-submit');
  await page.waitForTimeout(400);
  const afterEmpty = await page.evaluate(() => ({
    err: document.querySelector('.mauth-err')?.textContent?.trim() || '',
    fieldErr: !!document.querySelector('.mauth-field.is-error'),
    captcha: document.querySelectorAll('[class~="fixed"][class~="inset-0"]').length
  }));
  check('空邮箱被拦截（错误位有文案 + 字段标红）', !!afterEmpty.err && afterEmpty.fieldErr, JSON.stringify(afterEmpty));
  check('空邮箱不打开图形验证码', afterEmpty.captcha === 0, `captcha=${afterEmpty.captcha}`);

  // 非法邮箱
  await page.fill('.mauth-input', 'not-an-email');
  await page.click('.mauth-submit');
  await page.waitForTimeout(400);
  const badMail = await page.evaluate(
    () => document.querySelectorAll('[class~="fixed"][class~="inset-0"]').length
  );
  check('非法邮箱不打开图形验证码', badMail === 0, `captcha=${badMail}`);

  // 合法邮箱 → 弹出图形验证码
  await page.fill('.mauth-input', 'user@example.com');
  await page.click('.mauth-submit');
  await page.waitForTimeout(700);
  const captchaState = await page.evaluate(() => {
    const modal = document.querySelector('[class~="fixed"][class~="inset-0"]');
    return {
      open: !!modal,
      title: modal?.querySelector('h4')?.textContent?.trim() || '',
      type: null
    };
  });
  check('合法邮箱后弹出图形验证码弹窗', captchaState.open);
  check('弹窗标题走 i18n（安全验证）', /安全验证|Security check/.test(captchaState.title), captchaState.title);

  await ctx.close();
}

// ============================================================
console.log('\n=== ③ 入口链路 ===');

{
  // 邮件链接：/reset-password?token=… → /forgot-password?token=…（窄视口下渲染移动端页）
  const { ctx, page } = await open('/reset-password?token=test-token-123&appName=posecraft');
  const url = new URL(page.url());
  check('邮件链接 /reset-password 已重定向', url.pathname === '/forgot-password', url.pathname);
  check('重定向保留 token', url.searchParams.get('token') === 'test-token-123', url.search);
  check('重定向保留其他透传参数', url.searchParams.get('appName') === 'posecraft', url.search);
  check('窄视口下渲染移动端版式', (await page.locator('.mauth-page').count()) === 1);
  await ctx.close();
}

{
  // 宽视口访问 /m/forgot-password → URL 不变，分发器渲染桌面卡片
  // （2026-09-25：视口不再改写 URL，/m/* 与 /<page> 共用同一套分发器）
  const { ctx, page } = await open('/m/forgot-password' + QS, { width: 1440, height: 900 });
  const url = new URL(page.url());
  check('宽视口 /m/forgot-password 保持路由（不被视口改写）', url.pathname === '/m/forgot-password', url.pathname);
  check('query 保留（appName/client_id）', url.searchParams.get('client_id') === 'demo-client-001', url.search);
  check('宽视口渲染桌面版（非移动端版式）', (await page.locator('.mauth-page').count()) === 0);
  const desktopMarkup = await page.evaluate(() => document.body.innerText.slice(0, 120));
  check('桌面版渲染出重置密码文案', /重置密码|Reset Password/.test(desktopMarkup), desktopMarkup.replace(/\n/g, ' '));
  await ctx.close();
}

{
  // 手机端登录页「忘记密码」→ /m/forgot-password，且透传 OAuth 上下文
  const { ctx, page } = await open('/m/login' + QS);
  await page.click('.mauth-tab:nth-child(2)'); // 切到「密码登录」，忘记密码入口在此表单内
  await page.waitForTimeout(400);
  await page.click('.mauth-forgot');
  await page.waitForTimeout(700);
  const url = new URL(page.url());
  check('登录页「忘记密码」落到 /m/forgot-password', url.pathname === '/m/forgot-password', url.pathname);
  check('透传 client_id', url.searchParams.get('client_id') === 'demo-client-001', url.search);
  check('落点渲染移动端版式', (await page.locator('.mauth-page').count()) === 1);
  await ctx.close();
}

// ============================================================
console.log('\n=== ④ 移动端可用性（横屏可滚动 / 触摸目标）===');

{
  const { ctx, page } = await open('/m/forgot-password' + QS, { width: 667, height: 320 });
  const m = await page.evaluate(() => {
    const p = document.querySelector('.mauth-page');
    const submit = document.querySelector('.mauth-submit');
    const back = document.querySelector('.mauth-back-btn');
    const r = submit?.getBoundingClientRect();
    const after = back ? getComputedStyle(back, '::after') : null;
    return {
      overflowY: getComputedStyle(p).overflowY,
      canScroll: p.scrollHeight > p.clientHeight,
      submitVisible: !!r && r.top >= 0 && r.bottom <= window.innerHeight,
      backTouchH: after?.height || null
    };
  });
  check('横屏极矮视口下页面自身可滚动', m.overflowY === 'auto', m.overflowY);
  check('横屏下 CTA 在首屏可见', m.submitVisible, JSON.stringify(m));
  check('返回按钮触摸热区 ≥44px', m.backTouchH === null || parseFloat(m.backTouchH) >= 44, String(m.backTouchH));
  await ctx.close();
}

await browser.close();

console.log(`\n${'='.repeat(64)}`);
console.log(`移动端重置密码验收：${pass} 通过 / ${failures.length} 失败`);
if (failures.length) {
  console.log('失败项：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('全部通过 ✅');
