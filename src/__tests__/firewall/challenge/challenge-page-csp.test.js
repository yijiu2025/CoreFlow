/**
 * 挑战页的 CSP 与求解线程（Blob Worker）
 *
 * 这组用例钉的是**生产环境才会暴露**的一条链路：
 *   全局 helmet 策略是 `script-src 'self'`，而挑战页脚本是内联的 →
 *   不放行就整段脚本被拦，页面永远停在 "Verifying your browser"，
 *   且 `fail()` 也跑不到（脚本压根没执行），用户没有任何出口。
 *   开发环境 `contentSecurityPolicy: false`，所以本地完全看不出来。
 *
 * 实测（无头 Chrome + 真实 CSP）：修复前控制台报
 *   "Executing inline script violates ... 'script-src 'self'' ... blocked"，
 *   页面停在 "Verifying your browser, please wait..."。
 */

import Fastify from 'fastify';
import helmet from '@fastify/helmet';

import { registerSettingsReader } from '../../../framework/ingress/firewall/interface/config-access.js';
import { DEFAULT_SECURITY_SETTINGS } from '../../../framework/ingress/firewall/config/defaults.js';
import { verifyPow } from '../../../framework/security/verify/pow/service.js';
import {
  buildChallengePage,
  challengePageCsp,
  buildSolverSource
} from '../../../framework/ingress/firewall/challenge/index.js';

registerSettingsReader(() => DEFAULT_SECURITY_SETTINGS);

/** 从 CSP 里取某个指令的值（`script-src` 可能出现在任意位置） */
function directiveOf(csp, name) {
  const found = String(csp)
    .split(';')
    .map(s => s.trim())
    .find(s => s === name || s.startsWith(`${name} `));
  return found || '';
}

describe('challengePageCsp：只放行「本页那一支脚本」', () => {
  const nonce = 'deadbeefdeadbeefdeadbeefdeadbeef';
  const csp = challengePageCsp(nonce);

  it('script-src 用 nonce，且**不含** unsafe-inline', () => {
    const script = directiveOf(csp, 'script-src');
    expect(script).toBe(`script-src 'nonce-${nonce}'`);
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain("'self'");
  });

  it('放行 Blob Worker（PoW 求解线程）与同源 verify 请求', () => {
    expect(directiveOf(csp, 'worker-src')).toBe('worker-src blob:');
    expect(directiveOf(csp, 'connect-src')).toBe("connect-src 'self'");
  });

  it('默认全禁：其余资源一个都不放', () => {
    expect(directiveOf(csp, 'default-src')).toBe("default-src 'none'");
    expect(directiveOf(csp, 'base-uri')).toBe("base-uri 'none'");
    expect(directiveOf(csp, 'form-action')).toBe("form-action 'none'");
    expect(directiveOf(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('内联 style 属性仍需 unsafe-inline（页面没有外部样式表）', () => {
    expect(directiveOf(csp, 'style-src')).toBe("style-src 'unsafe-inline'");
  });

  it('每次 nonce 不同（同页重复下发不可复用）', () => {
    expect(challengePageCsp('a'.repeat(32))).not.toBe(challengePageCsp('b'.repeat(32)));
  });
});

describe('buildChallengePage：nonce 与响应头同源', () => {
  it('传入的 nonce 同时出现在 <script> 与 CSP 里（值一致）', async () => {
    const nonce = 'cafebabecafebabecafebabecafebabe';
    const html = await buildChallengePage('127.0.0.1', null, null, { nonce });

    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(challengePageCsp(nonce)).toContain(`'nonce-${nonce}'`);
  });

  it('不传 nonce 时自生成一个（页面本身仍自洽，不会漏掉属性）', async () => {
    const html = await buildChallengePage('127.0.0.1', null, null);
    const match = html.match(/<script nonce="([0-9a-f]{32})">/);
    expect(match).not.toBeNull();
    // 同一页只应有一支内联脚本
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it('求解线程源码内联了同一份求解内核与常量表，且不会截断 <script>', () => {
    const src = buildSolverSource();
    expect(src).toContain('function makePowSolver');
    // 常量表必须一起带过去：Worker 没有外层闭包，少了它就是 ReferenceError
    expect(src).toContain('var SHA256_K = [');
    expect(src).toContain('self.postMessage');
    expect(src).not.toContain('</script');
  });

  it('页面里 SOLVER_SRC 是合法的 JS 字符串字面量（换行已转义）', async () => {
    const html = await buildChallengePage('127.0.0.1', null, null, { nonce: 'a'.repeat(32) });
    const literal = html.match(/const SOLVER_SRC = ("(?:[^"\\]|\\.)*");/);
    expect(literal).not.toBeNull();
    // 用 JSON.parse 反解，证明它确实是一个完整的字符串（没有裸换行把字面量劈开）
    const decoded = JSON.parse(literal[1]);
    expect(decoded).toContain('makePowSolver');
    expect(decoded).toContain('\n');
  });

  it('求解线程源码**真的能跑**：内联后解出的答案能被服务端判题接受', async () => {
    // 这条不测"字符串长得对"，而是把内联出来的 Worker 源码**当代码执行**：
    // 内联是三段拼接（函数体 `toString()` + 常量表 `JSON.stringify` + 模板字符串），
    // 任何一环断了（例如把 `makePowSolver` 改成箭头函数、或让它引用闭包变量），
    // Worker 里会直接 ReferenceError —— 而浏览器端表现为"页面卡在 5%、没有任何报错"。
    const html = await buildChallengePage('127.0.0.1', null, null, { nonce: 'b'.repeat(32) });
    const challengeId = html.match(/const CHALLENGE_ID = '([0-9a-f]+)'/)[1];
    const salt = html.match(/const SALT = '([0-9a-f]+)'/)[1];
    const difficulty = Number(html.match(/const DIFFICULTY = (\d+)/)[1]);
    const maxAttempts = Number(html.match(/const MAX_ATTEMPTS = (\d+)/)[1]);
    const src = JSON.parse(html.match(/const SOLVER_SRC = ("(?:[^"\\]|\\.)*");/)[1]);

    // 🔴 只有 `--coverage` 跑测试时才需要这一步：istanbul 会把计数器注入函数体，
    // 而内联用的是 `makePowSolver.toString()` —— 计数器引用的 `cov_xxx` 定义在模块作用域，
    // Worker 里不存在，直接 `new Function` 就会 `ReferenceError: cov_xxx is not defined`。
    // 生产构建没有插桩，`toString()` 拿到的就是干净源码；这里按 istanbul 的两种注入形态
    // （独立语句 / `(cov_x().s[77]++, expr)` 序列表达式）还原成生产内联的那段代码。
    const cleanSrc = src
      .replace(/\bcov_[A-Za-z0-9_]+\(\)\.(?:s|f)\[\d+\]\+\+,\s*/g, '')
      .replace(/\bcov_[A-Za-z0-9_]+\(\)\.b\[\d+\]\[\d+\]\+\+,\s*/g, '')
      .replace(/\bcov_[A-Za-z0-9_]+\(\)\.(?:s|f)\[\d+\]\+\+;/g, '')
      .replace(/\bcov_[A-Za-z0-9_]+\(\)\.b\[\d+\]\[\d+\]\+\+;/g, '')
      .replace(/\/\*\s*istanbul[^*]*\*\//g, '');

    // 桩 `self`：Worker 里唯一的全局沟通渠道就是它
    const posted = [];
    const self = { postMessage: m => posted.push(m) };
    new Function('self', cleanSrc)(self);
    self.onmessage({ data: { prefix: `${challengeId}:${salt}:`, difficulty, maxAttempts } });

    const answer = posted.find(m => m.answer !== undefined)?.answer;
    expect(answer).not.toBeNull();
    expect(typeof answer).toBe('string');
    // 与服务端判题共用同一份哈希源码 —— 内联版能解、服务端认，才叫闭环
    expect(verifyPow(challengeId, salt, answer, difficulty)).toBe(true);
  });
});

describe('真实 helmet 环境下：本页 CSP 必须覆盖全局策略', () => {
  let app;
  let base;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    // 与 app.js 生产分支一致（只用本例相关的那几条，避免耦合无关配置）
    await app.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"]
        }
      },
      frameguard: false,
      hsts: false
    });

    // 模拟 pipeline.sendChallengePage 的做法
    app.get('/challenge', async (request, reply) => {
      const nonce = 'f'.repeat(32);
      const html = await buildChallengePage('127.0.0.1', null, null, { nonce });
      return reply
        .headers({ 'Content-Security-Policy': challengePageCsp(nonce) })
        .type('text/html')
        .send(html);
    });

    // 对照：只带全局策略（修复前的样子）
    app.get('/global-only', async (request, reply) => {
      const html = await buildChallengePage('127.0.0.1', null, null, { nonce: 'x' });
      return reply.type('text/html').send(html);
    });

    await app.ready();
    // 真监听 + fetch（不走 app.inject）：注入器依赖 light-my-request，而它 require 的
    // `cookie` 包是纯 ESM，在本仓库的 jest 环境里会直接抛（那 107 例既有失败同因）。
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${app.server.address().port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('本页响应头带 nonce，且与 HTML 里的 nonce 一致（覆盖生效）', async () => {
    const res = await fetch(base + '/challenge');
    expect(res.status).toBe(200);

    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeDefined();
    expect(directiveOf(csp, 'script-src')).toBe(`script-src 'nonce-${'f'.repeat(32)}'`);
    expect(await res.text()).toContain(`<script nonce="${'f'.repeat(32)}">`);
    // 全局的 worker-src 没配，必须由本页补上，否则 Blob Worker 起不来
    expect(directiveOf(csp, 'worker-src')).toBe('worker-src blob:');
  });

  it('对照：只靠全局策略时 script-src 是 self —— 内联脚本必被拦（这是修复前的现场）', async () => {
    const res = await fetch(base + '/global-only');
    const csp = res.headers.get('content-security-policy');
    expect(directiveOf(csp, 'script-src')).toBe("script-src 'self'");
    expect(directiveOf(csp, 'script-src')).not.toContain('nonce-');
    expect(directiveOf(csp, 'worker-src')).toBe('');
  });
});
