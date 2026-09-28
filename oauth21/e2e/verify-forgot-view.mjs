/**
 * 重置密码页「业务容器 + 可换版式」验收
 *
 * 与 `verify-login-view.mjs` / `verify-register-view.mjs` 是同一套断言面，
 * 覆盖**版式维度**（不是重测业务流程 —— 流程另有 verify-mobile-forgot*.mjs）：
 *
 *   A/B/D 版式选择：默认 / `?view=base` / 5 种非法 id 一律回落 base
 *   E 业务完整性（容器侧）：邮箱前置校验、图形码浮层、邮箱码必填、
 *                          两次密码一致（refine 补丁）、加密信封
 *   G 步骤状态由容器判定：code 模式 3 步（email→code→done）进度 33/67/100；
 *                        link 模式带 token 直达 reset（75%）、无 token 落 verify（25%）
 *   H 容器职责：图形码浮层由容器渲染；`/reset-password?token=` 兼容重定向保留 token
 *   F 分层体检（静态源码断言）：主题包内的版式无业务依赖、base 无 <style>、容器有契约自检
 *
 * 两个 dev server：5174 = code 模式，5175 = link 模式（VITE_PASSWORD_RESET_MODE=link）。
 */
import { chromium } from 'playwright-core';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CODE = 'http://127.0.0.1:5174';
const LINK = 'http://127.0.0.1:5175';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATH = '/m/forgot-password';

let pass = 0;
const fails = [];
function check(name, ok, extra = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}${extra ? '  ' + extra : ''}`);
  } else {
    fails.push(name);
    console.log(`  ❌ ${name}${extra ? '  ' + extra : ''}`);
  }
}

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubJwk = publicKey.export({ format: 'jwk' });
const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

/** 各端点捕获到的请求体（未发出则保持 undefined） */
let capturedVerify; // /verify/v1/verify-captcha
let capturedReset; // /user/v1/reset-password
let capturedLink; // /user/v1/send-reset-link
let capturedByLink; // /user/v1/reset-password-by-link

async function mock(page) {
  await page.route('**/oauth2.1/crypto/public-key', route => route.fulfill(json({ kid: 'mock-kid-1', key: pubJwk })));
  await page.route('**/verify/v1/generate-captcha', route =>
    route.fulfill(
      json({
        code: 0,
        message: 'ok',
        data: {
          captchaImage: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
          captchaKey: 'mock-captcha-key'
        }
      })
    )
  );
  await page.route('**/verify/v1/verify-captcha', route => {
    capturedVerify = JSON.parse(route.request().postData() || '{}');
    return route.fulfill(json({ code: 0, message: '验证码已发送', data: { emailSent: true } }));
  });
  await page.route('**/user/v1/send-reset-link', route => {
    capturedLink = JSON.parse(route.request().postData() || '{}');
    return route.fulfill(json({ code: 0, message: 'ok', data: {} }));
  });
  await page.route('**/user/v1/reset-password-by-link', route => {
    capturedByLink = JSON.parse(route.request().postData() || '{}');
    return route.fulfill(json({ code: 0, message: 'ok', data: {} }));
  });
  await page.route('**/user/v1/reset-password', route => {
    capturedReset = JSON.parse(route.request().postData() || '{}');
    return route.fulfill(json({ code: 0, message: 'ok', data: {} }));
  });
}

async function open(page, base, path, { w = 390, h = 844 } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await mock(page);
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mauth-page', { timeout: 20000 });
  await page.waitForTimeout(250);
}

/** 当前渲染的版式 id（取自版式自己声明的 data-mauth-view） */
const viewOf = page => page.evaluate(() => document.querySelector('.mauth-page')?.getAttribute('data-mauth-view') ?? null);
const text = async (page, sel) => ((await page.textContent(sel)) ?? '').trim();
/** 进度条宽度（%），版式把 ctx.progress 写成 inline style */
const progressOf = page =>
  page.evaluate(() => {
    const el = document.querySelector('.mauth-progress-bar');
    return el ? parseFloat(el.style.width) : NaN;
  });
/** 走完「填邮箱 → 过图形码」，停在 code 步（code 模式专用） */
async function toCodeStep(page, base, email = 'user@example.com') {
  await open(page, base, PATH);
  await page.fill('.mauth-input >> nth=0', email);
  await page.click('.mauth-submit');
  await page.waitForSelector('.mauth-captcha-input', { timeout: 8000 });
  // 图形码填满 4 位会自动校验（GraphicCaptcha 内 `watch(userInput)`），无需点按钮
  await page.fill('.mauth-captcha-input', '1234');
  await page.waitForTimeout(1400);
}

console.log('\n=== A/B/D 版式选择 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await open(page, CODE, PATH);
  check('A 默认无参数 → 基础版式', (await viewOf(page)) === 'default', `view=${await viewOf(page)}`);
  check('A 第 1 步已渲染（邮箱输入 + 提交按钮）', (await page.$$('.mauth-input')).length === 1 && (await page.$('.mauth-submit')) !== null);

  await open(page, CODE, PATH + '?view=base');
  check('B ?view=base → 基础版式', (await viewOf(page)) === 'default');

  for (const bad of ['../evil', 'NOPE', 'nope-xyz', '%2e%2e%2fevil', 'base%20']) {
    await open(page, CODE, `${PATH}?view=${bad}`);
    const v = await viewOf(page);
    check(`D 非法 id "${bad}" → 回退基础版式`, v === 'default', `view=${v}`);
  }
  await ctx.close();
}

console.log('\n=== E 业务完整性（容器侧）===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // E1 邮箱非法 → 连图形码都不该弹（validateField 前置拦截）
  await open(page, CODE, PATH);
  // 清掉上一条用例残留的捕获值：本用例断言"不该发出 verify-captcha"，
  // 必须确认它确实没被再赋值 —— 这是有意的显式重置，非无用赋值。
  // eslint-disable-next-line no-useless-assignment
  capturedVerify = undefined;
  await page.fill('.mauth-input >> nth=0', 'not-an-email');
  await page.click('.mauth-submit');
  await page.waitForTimeout(700);
  const emailErr = await text(page, '.mauth-err');
  check('E1 邮箱非法 → 报错且不弹图形码', emailErr.length > 0 && (await page.$('.mauth-captcha-input')) === null, `err="${emailErr}"`);

  // E2 邮箱合法 → 弹图形码（容器渲染的浮层）
  await open(page, CODE, PATH);
  await page.fill('.mauth-input >> nth=0', 'user@example.com');
  await page.click('.mauth-submit');
  await page.waitForSelector('.mauth-captcha-input', { timeout: 8000 });
  check('E2 邮箱合法 → 弹出图形验证码（浮层由容器渲染）', true);

  // E3 过图形码 → verify-captcha 带上 email + type=reset_password；随后进入第 2 步
  capturedVerify = undefined;
  await page.fill('.mauth-captcha-input', '1234');
  await page.waitForTimeout(1400);
  const v = capturedVerify || {};
  check('E3 图形码通过 → 调用 verify-captcha', !!capturedVerify);
  check('E3 verify-captcha 带 type=reset_password', v.type === 'reset_password', `type=${v.type}`);
  check('E3 verify-captcha 带邮箱（send-email=true）', v.email === 'user@example.com', `email=${v.email}`);
  check('E3 verify-captcha 带 captchaKey', v.captchaKey === 'mock-captcha-key', `captchaKey=${v.captchaKey}`);
  check('E3 进入第 2 步（图形码输入消失、出现 3 个字段）', (await page.$('.mauth-captcha-input')) === null && (await page.$$('.mauth-input')).length === 3);
  check('E3 重发按钮进入倒计时禁用（容器驱动）', await page.isDisabled('.mauth-code-btn'));

  // E4 邮箱码留空 → 容器显式拦截（schema 里 code 是 optional，validateField 放行）
  capturedReset = undefined;
  await page.fill('.mauth-input >> nth=1', 'Abcdef12');
  await page.fill('.mauth-input >> nth=2', 'Abcdef12');
  await page.click('.mauth-submit');
  await page.waitForTimeout(700);
  const codeErr = await text(page, '.mauth-cell >> nth=0 >> .mauth-err');
  check('E4 邮箱码留空 → 报错且不发请求', codeErr.length > 0 && capturedReset === null, `err="${codeErr}"`);

  // E5 两次密码不一致 → 必须显式比对（zod 的 object 级 refine 不被 validateField 执行）
  capturedReset = undefined;
  await page.fill('.mauth-input >> nth=0', '123456');
  await page.fill('.mauth-input >> nth=1', 'Abcdef12');
  await page.fill('.mauth-input >> nth=2', 'Abcdef99');
  await page.click('.mauth-submit');
  await page.waitForTimeout(700);
  const confirmErr = await text(page, '.mauth-cell >> nth=2 >> .mauth-err');
  check('E5 两次密码不一致 → 报错且不发请求（refine 补丁生效）', confirmErr.length > 0 && capturedReset === null, `err="${confirmErr}"`);

  // E6 密码太弱（两次都填 'abc'，避免落到"不一致"分支）→ 报错且不发请求
  capturedReset = undefined;
  await page.fill('.mauth-input >> nth=1', 'abc');
  await page.fill('.mauth-input >> nth=2', 'abc');
  await page.click('.mauth-submit');
  await page.waitForTimeout(700);
  const pwdErr = await text(page, '.mauth-cell >> nth=1 >> .mauth-err');
  check('E6 密码太弱 → 报错且不发请求', pwdErr.length > 0 && capturedReset === null, `err="${pwdErr}"`);

  // E7 合法提交 → reset-password，密码走加密信封
  capturedReset = undefined;
  await page.fill('.mauth-input >> nth=1', 'Abcdef12');
  await page.fill('.mauth-input >> nth=2', 'Abcdef12');
  await page.click('.mauth-submit');
  await page.waitForTimeout(1200);
  const r = capturedReset || {};
  check('E7 合法提交 → 发出 reset-password 请求', !!capturedReset);
  check('E7 请求体带 email + code', r.email === 'user@example.com' && r.code === '123456', `email=${r.email} code=${r.code}`);
  check(
    'E7 密码走加密信封（长密文，不含明文）',
    typeof r.password === 'string' && r.password.length > 100 && !r.password.includes('Abcdef12'),
    `len=${r.password?.length}`
  );

  // E8 完成后 footer 消失（ctx.step === ctx.totalSteps）
  check('E8 完成步骤 → 显示成功面板', (await page.$('.mauth-panel-icon-ok')) !== null);
  check('E8 完成步骤 → 底部返回登录入口隐藏（step === totalSteps）', (await page.$('.mauth-footer')) === null);
  await ctx.close();
}

console.log('\n=== G 步骤状态由容器判定 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // G1~G3 code 模式 3 步的进度与标题
  await open(page, CODE, PATH);
  check('G1 code 模式第 1 步 → 进度 33%', Math.round(await progressOf(page)) === 33, `progress=${await progressOf(page)}`);
  const title1 = await text(page, '.mauth-title');
  check('G1 头部标题非空（容器按阶段给文案）', title1.length > 0, `title="${title1}"`);

  await toCodeStep(page, CODE);
  check('G2 第 2 步 → 进度 67%', Math.round(await progressOf(page)) === 67, `progress=${await progressOf(page)}`);
  const title2 = await text(page, '.mauth-title');
  check('G2 标题随阶段改变（与第 1 步不同）', title2 !== title1, `1="${title1}" 2="${title2}"`);
  // 密码强度条只在有输入时出现 → 证明版式读的是 ctx.strength（不是自己算的）
  check('G2 未输入密码时无强度条', (await page.$('.mauth-strength')) === null);
  await page.fill('.mauth-input >> nth=1', 'Abcdef12');
  await page.waitForTimeout(250);
  check('G2 输入后出现强度条且带档位类名', (await page.$('.mauth-strength-bar.is-strong, .mauth-strength-bar.is-medium, .mauth-strength-bar.is-weak')) !== null);
  await page.fill('.mauth-input >> nth=1', '');

  // G3 done：容器把 stage 置为 done
  await page.fill('.mauth-input >> nth=0', '123456');
  await page.fill('.mauth-input >> nth=1', 'Abcdef12');
  await page.fill('.mauth-input >> nth=2', 'Abcdef12');
  await page.click('.mauth-submit');
  await page.waitForTimeout(1200);
  check('G3 第 3 步 → 进度 100%', Math.round(await progressOf(page)) === 100, `progress=${await progressOf(page)}`);
  check('G3 标题切成成功文案（与第 2 步不同）', (await text(page, '.mauth-title')) !== title2, `2="${title2}" 3="${await text(page, '.mauth-title')}"`);

  // G4 link 模式：带 token 进来 → 容器直接置 reset（版式不判"该不该跳过某步"）
  await open(page, LINK, PATH + '?token=tk-abc');
  check('G4 link 模式 + token → 直接落在「设置新密码」', Math.round(await progressOf(page)) === 75, `progress=${await progressOf(page)}`);
  check('G4 该步不渲染邮箱输入（只有两个字段）', (await page.$$('.mauth-input')).length === 2);
  check('G4 无邮箱码字段（link 模式用不到）', (await page.$('.mauth-code-btn')) === null);

  // G5 link 模式无 token → 第 1 步 verify（25%），4 步制
  await open(page, LINK, PATH);
  check('G5 link 模式无 token → 落在第 1 步（进度 25%，总步数 4）', Math.round(await progressOf(page)) === 25, `progress=${await progressOf(page)}`);

  // G6 link 模式走完第 1 步 → sent（50%），且调的是 send-reset-link 而不是邮箱码
  capturedLink = undefined;
  capturedVerify = undefined;
  await page.fill('.mauth-input >> nth=0', 'user@example.com');
  await page.click('.mauth-submit');
  await page.waitForSelector('.mauth-captcha-input', { timeout: 8000 });
  await page.fill('.mauth-captcha-input', '1234');
  await page.waitForTimeout(1300);
  check('G6 link 模式过图形码 → 调 send-reset-link', !!capturedLink, JSON.stringify(capturedLink));
  check('G6 图形码不带 email（send-email=false）', (capturedVerify || {}).email === undefined, `email=${JSON.stringify((capturedVerify || {}).email)}`);
  check('G6 进入第 2 步 sent（进度 50%）', Math.round(await progressOf(page)) === 50, `progress=${await progressOf(page)}`);

  // G7 link 模式第 3 步提交 → reset-password-by-link，带 token
  await open(page, LINK, PATH + '?token=tk-abc');
  capturedByLink = undefined;
  await page.fill('.mauth-input >> nth=0', 'Abcdef12');
  await page.fill('.mauth-input >> nth=1', 'Abcdef12');
  await page.click('.mauth-submit');
  await page.waitForTimeout(1200);
  check('G7 link 模式提交 → 调 reset-password-by-link 且带 token', (capturedByLink || {}).token === 'tk-abc', JSON.stringify(capturedByLink));
  check('G7 密码走加密信封', typeof (capturedByLink || {}).password === 'string' && !String(capturedByLink.password).includes('Abcdef12'));
  check('G7 完成 → 进度 100%', Math.round(await progressOf(page)) === 100, `progress=${await progressOf(page)}`);
  await ctx.close();
}

console.log('\n=== H 容器职责 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // H1 邮件链接兼容：/reset-password?token= → 重定向到 /forgot-password 且 token 原样带
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CODE + '/reset-password?token=tk-mail-1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const url = new URL(page.url());
  check('H1 /reset-password?token= → 重定向到 /forgot-password', url.pathname.endsWith('/forgot-password'), `path=${url.pathname}`);
  check('H1 重定向保留 token（丢了整条流程就废）', url.searchParams.get('token') === 'tk-mail-1', `token=${url.searchParams.get('token')}`);
  await ctx.close();
}

console.log('\n=== I iframe 分发一致性（窄 iframe 不得自行切移动端）===');
{
  /**
   * 真实宿主场景：posecraft（5176）把 SSO 登录页嵌在弹窗 iframe 里（宽 854px，
   * 宿主收窄后 iframe 内宽度会掉到 768px 以下）。此时从 mini 登录页点「忘记密码」
   * 会带着 `fromLogin=mini` 跳到 `/forgot-password` —— 该页必须**保持桌面卡片版**，
   * 与同一 iframe 里的 mini 登录页一致，不能因为 iframe 窄就切成全屏手机版。
   *
   * 这个 bug 真实发生过（2026-09-24）：forgot 分发器漏了 mini 来源分支。
   * 断言用「iframe 内实际 innerWidth」而不是桌面 page 的 viewport —— 只有放进 iframe 才复现。
   */
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await mock(page);

  /** 在宿主里放一个指定宽度的 iframe，读回内部渲染结果 */
  async function probeIframe(iframeW, srcPath) {
    await page.goto(CODE + '/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(300);
    await page.setContent(
      `<!doctype html><body style="margin:0"><iframe id="f" src="${CODE}${srcPath}" style="width:${iframeW}px;height:520px;border:0"></iframe></body>`,
      { waitUntil: 'domcontentloaded' }
    );
    await page.waitForTimeout(2200);
    const target = page.frames().find(x => x !== page.mainFrame() && x.url().includes('127.0.0.1:5174'));
    if (!target) return { err: 'no frame', frames: page.frames().map(x => x.url()).slice(0, 5) };
    await target.waitForSelector('.mauth-page, .auth-viewport, .auth-card', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    return target.evaluate(() => ({
      innerWidth: window.innerWidth,
      mobile: !!document.querySelector('.mauth-page'),
      desktop: !!document.querySelector('.auth-viewport, .auth-card'),
      forgotWrapper: !!document.querySelector('.forgot-dispatcher-wrapper')
    }));
  }

  // 窄 iframe（580px <768）下：带 fromLogin=mini → 桌面卡片版（不切手机端）
  const miniNarrow = await probeIframe(580, '/forgot-password?isMobile=false&fromLogin=mini&appName=posecraft');
  check(
    'I1 窄 iframe + fromLogin=mini → 保持桌面卡片版（不切移动端）',
    miniNarrow.mobile === false && miniNarrow.desktop === true,
    `innerW=${miniNarrow.innerWidth} mobile=${miniNarrow.mobile} desktop=${miniNarrow.desktop}`
  );

  // 对照：不带 fromLogin（真机 / 邮件链接直达）→ 窄 iframe 仍应切移动端
  const plainNarrow = await probeIframe(580, '/forgot-password?appName=posecraft');
  check(
    'I2 窄 iframe 无 fromLogin → 仍按自动识别切移动端（行为未被误伤）',
    plainNarrow.mobile === true,
    `innerW=${plainNarrow.innerWidth} mobile=${plainNarrow.mobile}`
  );

  // 对照：宽 iframe（854px）下两种都应走桌面版
  const miniWide = await probeIframe(854, '/forgot-password?isMobile=false&fromLogin=mini&appName=posecraft');
  check('I3 宽 iframe（854px）+ fromLogin=mini → 桌面卡片版', miniWide.desktop === true && miniWide.mobile === false, `innerW=${miniWide.innerWidth}`);

  // 显式 ?isMobile=true 优先级最高：即使带 fromLogin=mini 也走手机端
  const explicitMobile = await probeIframe(854, '/forgot-password?isMobile=true&fromLogin=mini&appName=posecraft');
  check('I4 显式 isMobile=true 优先于 fromLogin=mini（参数优先级未被破坏）', explicitMobile.mobile === true, `mobile=${explicitMobile.mobile}`);

  await ctx.close();
}

console.log('\n=== F 分层体检（静态源码断言）===');
{
  const walk = dir => {
    const out = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else out.push(p.replace(/\\/g, '/'));
    }
    return out;
  };
  /** 静态体检要看的是代码，不是注释 —— 注释里举反例（"不要写 router.push"）不算违规 */
  const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  // 契约与注册表在架构层（views/），版式实现在主题包内 —— 两处都到位才算接入。
  // 业务依赖只查**版式实现**（.vue）：包内的配色 index.ts 是纯数据，另一类文件。
  const archFiles = walk(join(ROOT, 'src/theme')).map(f => f.replace(/\\/g, '/'));
  const codeFiles = walk(join(ROOT, 'src/theme/themes')).filter(f => f.endsWith('.vue'));

  check(
    'F1 重置密码页已接入版式机制（契约+注册表在 views/，实现在主题包内）',
    ['views/forgot-password.ts'].every(x => archFiles.some(f => f.endsWith(x))) &&
      codeFiles.some(f => f.endsWith('forgot-password/index.vue')),
    `${archFiles.length} 个架构文件 / ${codeFiles.length} 个版式文件`
  );

  const BIZ = [
    /from '@\/api\//,
    /from 'vee-validate'/,
    /from 'zod'/,
    /from '@vee-validate\/zod'/,
    /from 'vue-router'/,
    /from '@\/stores\//,
    /from '@\/utils\/crypto'/,
    /useRouter\(/,
    /router\.push/
  ];
  const offenders = [];
  for (const f of codeFiles) {
    const src = strip(readFileSync(f, 'utf8'));
    for (const re of BIZ) if (re.test(src)) offenders.push(`${f.replace(ROOT, '')} ← ${re}`);
  }
  check('F2 主题包内的版式不含任何业务依赖/跳转', offenders.length === 0, offenders.join(' | '));

  const container = readFileSync(join(ROOT, 'src/view/app/forgot-password/index.vue'), 'utf8');
  const need = ['authApi', 'useCaptchaFlow', 'resetSchema', 'rsaEncrypt', 'setFieldError', 'usePasswordStrength', 'submitReset'];
  const missing = need.filter(k => !container.includes(k));
  check('F3 业务仍在容器里（发码/发链接/加密提交/校验补丁/路由）', missing.length === 0, missing.join(','));

  const base = strip(readFileSync(join(ROOT, 'src/theme/themes/default/mobile/forgot-password/index.vue'), 'utf8'));
  check('F4 基础版式不含 <style>（样式单一来源）', !/<style/.test(base));
  check('F5 基础版式只通过 ctx 取数据/动作', base.includes('ctx.actions.') && !/const \{ values|authApi|useCaptchaFlow/.test(base));
  check('F6 容器有编译期契约自检', container.includes('assertForgotPasswordContract'));
  check('F7 容器仍把浮层交给自己渲染（版式不引入 GraphicCaptcha）', /GraphicCaptcha/.test(container) && !/GraphicCaptcha/.test(base));

  // 版式侧不得自己推进步骤（stage 由容器判定）
  const LEAK = [/codeStep\s*(\.value)?\s*=[^=]/, /linkStep\s*(\.value)?\s*=[^=]/, /\bstage\s*(\.value)?\s*=[^=]/];
  const leak = LEAK.filter(re => re.test(base)).map(String);
  check('F8 版式不自己推进业务步骤（codeStep/linkStep/stage 赋值）', leak.length === 0, leak.join(','));
}

await browser.close();
console.log(`\n===== 重置密码页版式验收：通过 ${pass} / 失败 ${fails.length} =====`);
if (fails.length) {
  console.log('失败项：');
  for (const f of fails) console.log('  -', f);
  process.exitCode = 1;
}
