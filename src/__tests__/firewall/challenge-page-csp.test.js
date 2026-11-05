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

import { registerSettingsReader } from '../../framework/firewall/interface/config-access.js';
import { DEFAULT_SECURITY_SETTINGS } from '../../framework/firewall/config/defaults.js';
import {
  buildChallengePage,
  challengePageCsp,
  buildSolverSource
} from '../../framework/firewall/challenge-template.js';

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

  it('求解线程源码内联了同一份 sha256Hex，且不会截断 <script>', () => {
    const src = buildSolverSource();
    expect(src).toContain('function sha256Hex');
    expect(src).toContain('self.postMessage');
    expect(src).not.toContain('</script');
  });

  it('页面里 SOLVER_SRC 是合法的 JS 字符串字面量（换行已转义）', async () => {
    const html = await buildChallengePage('127.0.0.1', null, null, { nonce: 'a'.repeat(32) });
    const literal = html.match(/const SOLVER_SRC = ("(?:[^"\\]|\\.)*");/);
    expect(literal).not.toBeNull();
    // 用 JSON.parse 反解，证明它确实是一个完整的字符串（没有裸换行把字面量劈开）
    const decoded = JSON.parse(literal[1]);
    expect(decoded).toContain('sha256Hex');
    expect(decoded).toContain('\n');
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
