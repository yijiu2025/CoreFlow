/**
 * 登录页「业务容器 + 可换版式」验收
 *
 * 覆盖：
 *   A 默认无参数 → 基础版式（data-mauth-view）
 *   B ?view=base  → 基础版式
 *   D 非法 / 未登记 id → 回退基础版式（不回退到别的变体）
 *   E 业务完整性：协议拦截 / 邮箱码登录 / 密码登录（先过图形码）/ 会话与请求体
 *   F 分层体检：主题包内的版式没有业务依赖；容器里业务齐备；基础版式无样式块
 *   G 三块面板（授权确认 / 邮箱二次验证 / 登录表单）由容器判定，版式只负责渲染
 *   H 容器仍提供浮层（图形码）、缺标识提示、以及 /login 分发路径同样生效
 */
import { chromium } from 'playwright-core';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:5174';
const QS = '?appName=posecraft&client_id=demo-client-001';
// 关卡所在目录 = oauth21/e2e/，oauth21 就是上一级（跨机器可移植，不再写死本机绝对路径）
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

let capturedLogin;
let capturedVerify;
/** 登录接口的响应体（各场景改写它来驱动容器的分支） */
let loginData = { accessToken: 'mock-token', user: { id: 1, username: 'tester' } };

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
  await page.route('**/verify/v1/verify-captcha', route => route.fulfill(json({ code: 0, message: '验证码已发送', data: { emailSent: true } })));
  await page.route('**/oauth2.1/login/verify-email', route => {
    capturedVerify = JSON.parse(route.request().postData() || '{}');
    return route.fulfill(json({ code: 0, message: 'ok', data: { accessToken: 'mock-token', user: { id: 1, username: 'tester' } } }));
  });
  await page.route('**/oauth2.1/login', route => {
    capturedLogin = JSON.parse(route.request().postData() || '{}');
    return route.fulfill(json({ code: 0, message: 'ok', data: loginData }));
  });
}

async function open(page, path, { w = 390, h = 844 } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await mock(page);
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mauth-page', { timeout: 20000 });
  await page.waitForTimeout(250);
}

/** 当前渲染的版式 id（取自版式自己声明的 data-mauth-view） */
const viewOf = page => page.evaluate(() => document.querySelector('.mauth-page')?.getAttribute('data-mauth-view') ?? null);
const text = async (page, sel) => ((await page.textContent(sel)) ?? '').trim();

console.log('\n=== A/B/D 版式选择 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await open(page, '/m/login' + QS);
  check('A 默认无参数 → 基础版式', (await viewOf(page)) === 'default', `view=${await viewOf(page)}`);
  check('A 登录表单已渲染（tabs + 提交按钮）', (await page.$$('.mauth-tab')).length === 2 && (await page.$('.mauth-submit')) !== null);

  await open(page, '/m/login' + QS + '&view=base');
  check('B ?view=base → 基础版式', (await viewOf(page)) === 'default');

  for (const bad of ['../evil', 'NOPE', 'nope-xyz', '%2e%2e%2fevil', 'base%20']) {
    await open(page, `/m/login${QS}&view=${bad}`);
    const v = await viewOf(page);
    check(`D 非法 id "${bad}" → 回退基础版式`, v === 'default', `view=${v}`);
  }
  await ctx.close();
}

console.log('\n=== E 业务完整性（容器侧）===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  loginData = { accessToken: 'mock-token', user: { id: 1, username: 'tester' } };

  // E1 未勾协议就提交 → 容器拦下，不发任何登录请求
  await open(page, '/m/login' + QS);
  capturedLogin = null;
  await page.fill('.mauth-input >> nth=0', 'user@example.com');
  await page.fill('.mauth-input >> nth=1', '123456');
  await page.click('.mauth-submit');
  await page.waitForTimeout(600);
  check('E1 未勾协议 → 不发登录请求（容器拦下）', capturedLogin === null);

  // E2 勾选协议 → 提交，断言到达 /oauth2.1/login 且密码走加密信封
  await page.click('.mauth-checkbox >> nth=1');
  await page.waitForTimeout(150);
  await page.click('.mauth-submit');
  await page.waitForTimeout(900);
  check('E2 勾选后 → 发出登录请求', !!capturedLogin);
  const body = capturedLogin || {};
  check('E2 请求体带 client_id', body.client_id === 'demo-client-001', `client_id=${body.client_id}`);
  check('E2 登录参数走加密信封（encrypted 为长密文，不含明文邮箱）', typeof body.encrypted === 'string' && body.encrypted.length > 100 && !body.encrypted.includes('user@example.com'), `len=${body.encrypted?.length}`);
  check('E2 邮箱模式不带图形码 key（payload 与登录方式一致）', !body.captchaKey, `captchaKey=${JSON.stringify(body.captchaKey)}`);

  // E3 切到密码登录：先过图形验证码，请求里必须带上 captchaKey
  await open(page, '/m/login' + QS);
  capturedLogin = null;
  await page.click('.mauth-tab >> nth=1');
  await page.waitForTimeout(500);
  const ph = await page.$$eval('.mauth-input', els => els.map(e => e.getAttribute('placeholder')));
  check('E3 切到密码登录 → 字段换成账号/密码（容器同步 type 字段）', ph.length === 2, JSON.stringify(ph));

  await page.fill('.mauth-input >> nth=0', 'tester');
  await page.fill('.mauth-input >> nth=1', 'Abcdef1');
  await page.click('.mauth-checkbox >> nth=1');
  await page.click('.mauth-submit');
  // v2.21.0 起 GraphicCaptcha token 化重写：输入框类名 .mauth-captcha-input → .mauth-captcha-input
  await page.waitForSelector('.mauth-captcha-input', { timeout: 8000 });
  check('E3 密码登录先弹图形验证码（容器渲染的浮层）', true);
  await page.fill('.mauth-captcha-input', '1234');
  await page.waitForTimeout(1300);
  check('E3 图形码通过后发出登录请求', !!capturedLogin);
  check('E3 请求带 captchaKey', (capturedLogin || {}).captchaKey === 'mock-captcha-key', `captchaKey=${(capturedLogin || {}).captchaKey}`);

  // E4 密码校验：太短的密码被拦在请求之前
  await open(page, '/m/login' + QS + '&view=base');
  capturedLogin = null;
  await page.click('.mauth-tab >> nth=1');
  await page.waitForTimeout(400);
  await page.fill('.mauth-input >> nth=0', 'tester');
  await page.fill('.mauth-input >> nth=1', 'ab');
  await page.click('.mauth-checkbox >> nth=1');
  await page.click('.mauth-submit');
  await page.waitForTimeout(700);
  const pwdErr = await text(page, '.mauth-cell >> nth=1 >> .mauth-err');
  check('E4 密码太短 → 报错且不发请求', pwdErr.length > 0 && capturedLogin === null, `err="${pwdErr}"`);
  await ctx.close();
}

console.log('\n=== G 三块面板由容器判定 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // G1 登录表单（默认）
  await open(page, '/m/login' + QS);
  check('G1 默认落在登录表单面板', (await text(page, '.mauth-title')) === '欢迎回来' && (await page.$('.mauth-tabs')) !== null);

  // G2 后端返回 action=consent → 授权确认面板（同一份 ConsentPanel 组件）
  loginData = { action: 'consent', consentKey: 'ck-1', client_name: 'PoseCraft', scope: 'user', consentKey2: 'x' };
  await open(page, '/m/login' + QS);
  await page.fill('.mauth-input >> nth=0', 'user@example.com');
  await page.fill('.mauth-input >> nth=1', '123456');
  await page.click('.mauth-checkbox >> nth=1');
  await page.click('.mauth-submit');
  await page.waitForTimeout(900);
  check('G2 action=consent → 标题切到授权确认', (await text(page, '.mauth-title')) === '授权确认', `title="${await text(page, '.mauth-title')}"`);
  check('G2 授权面板顶掉登录表单（tab 不再渲染）', (await page.$('.mauth-tabs')) === null);

  // G3 后端返回 action=needs_email_verify → 邮箱二次验证面板 + 倒计时禁用重发
  loginData = { action: 'needs_email_verify', verifyToken: 'vt-1', email: 'u@example.com', reason: '新设备登录' };
  await open(page, '/m/login' + QS);
  await page.fill('.mauth-input >> nth=0', 'u@example.com');
  await page.fill('.mauth-input >> nth=1', '123456');
  await page.click('.mauth-checkbox >> nth=1');
  await page.click('.mauth-submit');
  await page.waitForTimeout(900);
  check('G3 action=needs_email_verify → 标题切到环境变更验证', (await text(page, '.mauth-title')) === '环境变更验证', `title="${await text(page, '.mauth-title')}"`);
  check('G3 展示后端给的邮箱', (await text(page, '.mauth-panel-sub')).includes('u@example.com'));
  check('G3 重发按钮进入倒计时禁用（容器驱动）', await page.isDisabled('.mauth-resend'));

  // G4 提交二次验证码 → 打到 verify-email（verifyToken 由容器保管，不下发到版式）
  capturedVerify = null;
  await page.fill('.mauth-panel .mauth-input', '1234');
  await page.click('.mauth-submit');
  await page.waitForTimeout(900);
  check('G4 提交二次验证码 → 请求体带 verifyToken', (capturedVerify || {}).verifyToken === 'vt-1', JSON.stringify(capturedVerify));
  await ctx.close();
}

console.log('\n=== H 浮层 / 缺标识 / 分发路径 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // H1 缺 appName/client_id → 版式渲染提示（判据由容器给出）
  await open(page, '/m/login?isMobile=true');
  check('H1 缺应用标识 → 渲染提示块', (await page.$('.mauth-missing')) !== null);
  check('H1 缺标识时不渲染登录表单', (await page.$('.mauth-submit')) === null);

  // H2 /login 分发到移动端形态时，同一套机制生效（容器被两处复用）
  await open(page, '/login' + QS + '&isMobile=true');
  check('H2 /login?isMobile=true 同样是基础版式', (await viewOf(page)) === 'default', `view=${await viewOf(page)}`);

  // H3 图形验证码弹窗由容器渲染：版式里没有它的挂载点也能出现
  await open(page, '/m/login' + QS);
  await page.fill('.mauth-input >> nth=0', 'user@example.com');
  await page.click('.mauth-code-btn');
  await page.waitForSelector('.mauth-captcha-input', { timeout: 8000 });
  check('H3 发码弹窗由容器渲染（版式无需知道它存在）', true);
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
  /** 静态体检要看的是代码，不是注释/文档 —— 注释里举反例（"不要写 router.push"）不算违规 */
  const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  // 契约与注册表在架构层（views/），版式实现在主题包内 —— 两处都到位才算接入。
  // 业务依赖只查**版式实现**（.vue）：包内的配色 index.ts 是纯数据，另一类文件。
  const archFiles = walk(join(ROOT, 'src/theme')).map(f => f.replace(/\\/g, '/'));
  const codeFiles = walk(join(ROOT, 'src/theme/themes')).filter(f => f.endsWith('.vue'));

  check(
    'F1 登录页已接入版式机制（契约+注册表在 views/login.ts，实现在主题包内）',
    ['views/login.ts'].every(x => archFiles.some(f => f.endsWith(x))) &&
      codeFiles.some(f => f.endsWith('login/index.vue')),
    `${archFiles.length} 个架构文件 / ${codeFiles.length} 个版式文件`
  );

  const BIZ = [/from '@\/api\//, /from 'vee-validate'/, /from 'zod'/, /from '@vee-validate\/zod'/, /from 'vue-router'/, /from '@\/stores\//, /from '@\/utils\/crypto'/, /useRouter\(/, /router\.push/];
  const offenders = [];
  for (const f of codeFiles) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const re of BIZ) if (re.test(src)) offenders.push(`${f.replace(ROOT, '')} ← ${re}`);
  }
  check('F2 主题包内的版式不含任何业务依赖/跳转', offenders.length === 0, offenders.join(' | '));

  const container = readFileSync(join(ROOT, 'src/view/app/login/index.vue'), 'utf8');
  const need = ['useLoginFlow', 'useSocialLogin', 'loginSchema', 'useCaptchaFlow', 'handleSubmit', 'postToParent', 'useAuthStore'];
  const missing = need.filter(k => !container.includes(k));
  check('F3 业务仍在容器里（登录流程/校验/图形码/第三方/父窗口通知）', missing.length === 0, missing.join(','));

  const base = stripComments(readFileSync(join(ROOT, 'src/theme/themes/default/mobile/login/index.vue'), 'utf8'));
  check('F4 基础版式不含 <style>（样式单一来源）', !/<style/.test(base));
  check('F5 基础版式只通过 ctx 取数据/动作', base.includes('ctx.actions.') && !/const \{ values|authStore|useLoginFlow/.test(base));
  check('F6 容器有编译期契约自检', container.includes('assertLoginContract'));

  // 版式侧不得出现"该不该拦"的判断：登录页特有的是协议勾选与图形码
  const LEAK = [/agreed\s*=/];
  const leak = LEAK.filter(re => re.test(base)).map(String);
  check('F7 版式不自己改业务状态（如 agreed 赋值）', leak.length === 0, leak.join(','));
}

await browser.close();
console.log(`\n===== 登录页版式验收：通过 ${pass} / 失败 ${fails.length} =====`);
if (fails.length) {
  console.log('失败项：');
  for (const f of fails) console.log('  -', f);
  process.exitCode = 1;
}
