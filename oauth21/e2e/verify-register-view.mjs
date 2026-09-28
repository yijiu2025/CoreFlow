/**
 * 注册页「业务容器 + 可换版式」验收
 *
 * 覆盖：
 *   A 默认无参数 → 基础版式
 *   B ?view=base  → 基础版式
 *   C ?view=compact → 变体（动态 chunk）真的被加载并渲染
 *   D 非法 / 未登记 id → 回退基础版式（不回退到别的变体）
 *   E 变体下业务仍然完整：校验 / 发码 / 图形码 / 提交请求体 / 成功后跳转
 *   F 分层体检：主题包内的版式没有业务依赖；容器里业务齐备
 *   G 变体复用的是同一套样式表（字段计算样式与基础版式一致）
 *   H 变体下的交互细节：返回逐级回退、横屏可滚、浮层由容器提供
 */
import { chromium } from 'playwright-core';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:5174';
const QS = '?appName=posecraft&client_id=demo-client-001';
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
let capturedRegister = null;

async function mock(page) {
  await page.route('**/user/v1/check-email**', route => route.fulfill(json({ code: 0, message: 'ok', data: { isDuplicate: false } })));
  await page.route('**/verify/v1/generate-captcha', route =>
    route.fulfill(
      json({
        code: 0,
        message: 'ok',
        data: { captchaImage: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', captchaKey: 'mock-captcha-key' }
      })
    )
  );
  await page.route('**/verify/v1/verify-captcha', route => route.fulfill(json({ code: 0, message: '验证码已发送', data: { emailSent: true } })));
  await page.route('**/oauth2.1/crypto/public-key', route => route.fulfill(json({ kid: 'mock-kid-1', key: pubJwk })));
  await page.route('**/user/v1/register', route => {
    capturedRegister = JSON.parse(route.request().postData() || '{}');
    return route.fulfill(json({ code: 0, message: '注册成功', data: null }));
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

console.log('\n=== A/B/C/D 版式选择 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await open(page, '/m/register' + QS);
  check('A 默认无参数 → 基础版式', (await viewOf(page)) === 'default', `view=${await viewOf(page)}`);
  check('A 基础版式无变体痕迹（无 .mreg-dots）', (await page.$('.mreg-dots')) === null);

  await open(page, '/m/register' + QS + '&view=base');
  check('B ?view=base → 基础版式', (await viewOf(page)) === 'default');

  await open(page, '/m/register' + QS + '&view=compact');
  check('C ?view=compact → 变体被动态加载', (await viewOf(page)) === 'compact', `view=${await viewOf(page)}`);
  check('C 变体结构生效（步骤点 + 卡片）', (await page.$('.mreg-dots')) !== null && (await page.$('.mreg-card')) !== null);
  check('C 变体展示 appName（基础版式不展示）', (await page.textContent('.mreg-app'))?.includes('posecraft') === true);

  for (const bad of ['../evil', 'NOPE', 'nope-xyz', '%2e%2e%2fevil', 'base%20']) {
    await open(page, `/m/register${QS}&view=${bad}`);
    const v = await viewOf(page);
    check(`D 非法 id "${bad}" → 回退基础版式`, v === 'default', `view=${v}`);
  }
  await ctx.close();
}

console.log('\n=== E 变体下业务完整性（走通三步 + 断言请求体）===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await open(page, '/m/register' + QS + '&view=compact');

  // 1) 未发码前：验证码框禁用 + 主按钮禁用（状态来自容器）
  check('E1 未发码 → 验证码框 disabled', await page.isDisabled('.mauth-input >> nth=2'));
  check('E1 未发码 → 主按钮 disabled', await page.isDisabled('.mreg-cta'));

  // 2) 填字段 → 发码（图形码弹窗由容器提供）
  await page.fill('.mauth-input >> nth=0', 'user12345');
  await page.fill('.mauth-input >> nth=1', 'user@example.com');
  await page.click('.mauth-code-btn');
  await page.waitForSelector('.mauth-captcha-input', { timeout: 8000 });
  check('E2 图形验证码弹窗出现（容器渲染的浮层）', true);
  await page.fill('.mauth-captcha-input', '1234');
  await page.waitForTimeout(1300);
  check('E2 发码后 → 验证码框可用', !(await page.isDisabled('.mauth-input >> nth=2')));
  check('E2 发码后 → 主按钮可用', !(await page.isDisabled('.mreg-cta')));

  // 3) 空验证码点下一步 → 错误态标在验证码字段（ctx.fields.code.invalid/error 通路）
  await page.click('.mreg-cta');
  await page.waitForTimeout(400);
  const codeErr = (await page.textContent('.mauth-cell >> nth=2 >> .mauth-err'))?.trim() ?? '';
  check('E3 空验证码 → 报错且停在第一步', codeErr.length > 0 && (await viewOf(page)) === 'compact', `err="${codeErr}"`);

  // 4) 填码 → 进第二步；两次密码不一致 → 被拦在第二步（容器侧校验）
  await page.fill('.mauth-input >> nth=2', '123456');
  await page.click('.mreg-cta');
  await page.waitForSelector('.mauth-pwd-toggle', { timeout: 8000 });
  check('E4 正确验证码 → 进入第二步', (await page.$$('.mauth-pwd-toggle')).length === 2);
  await page.fill('.mauth-input >> nth=0', 'Abcdefgh1');
  await page.fill('.mauth-input >> nth=1', 'Abcdefgh2');
  await page.click('.mreg-cta');
  await page.waitForTimeout(400);
  const mismatchErr = (await page.textContent('.mauth-cell >> nth=1 >> .mauth-err'))?.trim() ?? '';
  check('E4 两次密码不一致 → 报错且停在第二步', mismatchErr.length > 0 && (await page.$$('.mauth-pwd-toggle')).length === 2, `err="${mismatchErr}"`);

  // 5) 一致性修正 → 第三步；勾选协议才可提交
  await page.fill('.mauth-input >> nth=1', 'Abcdefgh1');
  await page.click('.mreg-cta');
  await page.waitForSelector('.mauth-summary', { timeout: 8000 });
  check('E5 进入第三步（核对摘要展示表单值）', (await page.textContent('.mauth-summary'))?.includes('user12345') === true);
  await page.click('.mauth-checkbox');
  await page.waitForTimeout(200);
  check('E5 勾选协议 → 提交按钮可用（canSubmit 通路）', !(await page.isDisabled('.mreg-cta')));

  // 6) 提交 → 请求体完整 + 跳回登录页
  await page.click('.mreg-cta');
  await page.waitForTimeout(1500);
  const body = capturedRegister || {};
  check('E6 提交发出注册请求', !!capturedRegister);
  check('E6 请求体带 username/email/code', body.username === 'user12345' && body.email === 'user@example.com' && body.code === '123456', JSON.stringify({ u: body.username, e: body.email, c: body.code }));
  check('E6 密码是密文（未明文外发）', typeof body.password === 'string' && body.password.length > 100 && !body.password.includes('Abcdefgh1'), `len=${body.password?.length}`);
  check('E6 带 kid 与图形码 captchaKey', body.kid === 'mock-kid-1' && body.captchaKey === 'mock-captcha-key');
  check('E6 成功后跳回登录页', page.url().includes('/m/login'), page.url());

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
  // 只看版式**实现**（.vue）：包内还有配色的 index.ts（纯数据）与 theme.scss，
  // 用「不许有业务依赖」去框它们只会把断言放宽到没有意义。
  const codeFiles = walk(join(ROOT, 'src/theme/themes')).filter(f => f.endsWith('.vue'));
  check(
    'F1 default 包有基础版式，compact 包有自己的 register 版式（v2.18.5 起一包一版式）',
    codeFiles.some(f => f.endsWith('themes/default/mobile/register/index.vue')) &&
      codeFiles.some(f => f.endsWith('themes/compact/mobile/register/index.vue')),
    `${codeFiles.length} 个版式文件`
  );

  const BIZ = [/from '@\/api\//, /from 'vee-validate'/, /from 'zod'/, /from '@vee-validate\/zod'/, /from 'vue-router'/, /from '@\/stores\//, /from '@\/utils\/crypto'/, /useRouter\(/, /router\.push/];
  const offenders = [];
  for (const f of codeFiles) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const re of BIZ) if (re.test(src)) offenders.push(`${f.replace(ROOT, '')} ← ${re}`);
  }
  check('F2 主题包内的版式不含任何业务依赖/跳转', offenders.length === 0, offenders.join(' | '));

  const container = readFileSync(join(ROOT, 'src/view/app/register/index.vue'), 'utf8');
  const need = ['authApi.register', 'rsaEncrypt', 'checkEmail', 'useCaptchaFlow', 'registerSchema', 'handleSubmit'];
  const missing = need.filter(k => !container.includes(k));
  check('F3 业务仍在容器里（api/加密/查重/校验）', missing.length === 0, missing.join(','));

  const base = stripComments(readFileSync(join(ROOT, 'src/theme/themes/default/mobile/register/index.vue'), 'utf8'));
  check('F4 基础版式不含 <style>（样式单一来源）', !/<style/.test(base));
  // v2.18.5 起 compact 是独立主题包（themes/compact/mobile/register/），不再是 default 包内变体
  const compact = stripComments(readFileSync(join(ROOT, 'src/theme/themes/compact/mobile/register/index.vue'), 'utf8'));
  check('F4b 变体样式只用 token（无裸色值）', !/#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|hsl\(/.test(compact.slice(compact.indexOf('<style'))), '变体自带样式允许，但取值必须走 --mauth-*');
  check('F5 基础版式只通过 ctx 取数据/动作', base.includes('ctx.actions.') && !/const \{ values|authApi/.test(base));

  // 编译期契约自检确实存在（改契约会立刻报错，而不是悄悄跑偏）
  check('F6 容器有编译期契约自检', container.includes('assertRegisterContract'));
}

console.log('\n=== G/H 变体复用同一套样式 + 交互细节 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const readField = () => page.evaluate(() => {
    const el = document.querySelector('.mauth-input');
    const s = getComputedStyle(el);
    const f = getComputedStyle(el.closest('.mauth-field'));
    return { h: el.getBoundingClientRect().height, font: s.fontSize, family: s.fontFamily, fieldH: f.height, radius: f.borderRadius, bg: f.backgroundColor };
  });
  await open(page, '/m/register' + QS + '&theme=white');
  const baseStyle = await readField();
  // 🔴 钉住 &theme=white：跨包切版式会按设计自动重置配色到新包默认色（v2.18.5，
  //    字母序 black）——不钉住的话 compact 侧按 black 渲染，比的是"配色差异"而不是"样式源"。
  await open(page, '/m/register' + QS + '&view=compact&theme=white');
  const compactStyle = await readField();
  check('G 同一配色下，跨包版式的字段计算样式一致（同一套 mauth-* 样式表）', JSON.stringify(baseStyle) === JSON.stringify(compactStyle), JSON.stringify(compactStyle));

  // 返回逐级回退：第 1 步 → 回登录页
  await page.click('.mauth-back-btn');
  await page.waitForTimeout(600);
  check('H 第 1 步返回 → 回登录页（容器决定去向）', page.url().includes('/m/login'), page.url());

  // 横屏：内容可达（可滚）。真机横屏（844×390）带**移动 UA** → 判定走手机端；
  // 桌面 chromium 裸开 844 宽会被宽度优先判定成桌面版（见 utils/device.ts），
  // 所以这里必须单独开一个带 iPhone UA 的 context 复现真机横屏。
  const landCtx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const landPage = await landCtx.newPage();
  await open(landPage, '/m/register' + QS + '&view=compact', { w: 844, h: 390 });
  const scroll = await landPage.evaluate(() => {
    const el = document.querySelector('.mauth-page');
    el.scrollTop = 9999;
    return { canScroll: el.scrollHeight > el.clientHeight, moved: el.scrollTop };
  });
  check('H 横屏可滚动（版式没有破坏页面滚动容器）', scroll.canScroll === false || scroll.moved > 0, JSON.stringify(scroll));
  await landCtx.close();
  await ctx.close();
}

await browser.close();
console.log(`\n===== 通过 ${pass} / 失败 ${fails.length} =====`);
if (fails.length) {
  console.log('失败项：');
  for (const f of fails) console.log('  -', f);
  process.exitCode = 1;
}
