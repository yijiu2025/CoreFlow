/**
 * 测试环境自检：`cookie` 的 CJS 镜像（scripts/jest/shims/cookie.cjs）
 *
 * 解决的问题：`cookie@2` 纯 ESM + `light-my-request@6` CJS `require('cookie')`
 * 在 Node 22.x 的 jest 里报 "Must use import to load ES Module"，
 * 所有 `app.inject()` 用例整片失败（integration/app.test.js、api-routes.test.js）。
 *
 * 本测试守四件事：
 * 1. 映射生效：`import 'cookie'` 拿到镜像，且不是真包（真包是 ESM，require 会炸）；
 * 2. 产物不陈旧：镜像头部记录的版本 == 当前安装的 cookie 版本（升级后忘了重跑生成脚本 → 红）；
 * 3. 语义不漂移：4 个导出对同一批输入的输出与**真包**逐字一致
 *    （真包用 file URL 动态 import，绕过 moduleNameMapper）；
 * 4. `app.inject()` 与 `@fastify/cookie` 的读写两条路径真的能用 —— 这是当初失败的入口。
 *
 * @since 2026-11-06
 */

import { describe, test, expect } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
// 这个说明符被 jest.config.js 的 moduleNameMapper 指向 scripts/jest/shims/cookie.cjs。
// 注意：**不能**用相对路径直接 import 产物 —— `src/` 禁止 import `scripts/`
// （conventions/no-scripts-import.test.js），镜像本身的版本/内容断言走 fs 读取。
import * as shim from 'cookie';

const ROOT = process.cwd();
const SHIM_PATH = path.join(ROOT, 'scripts/jest/shims/cookie.cjs');
const REAL_COOKIE_ENTRY = path.join(ROOT, 'node_modules/cookie/dist/index.js');
const REAL_COOKIE_PKG = path.join(ROOT, 'node_modules/cookie/package.json');

/** 真包（ESM）：绝对 file URL 动态 import，不会被 moduleNameMapper 拦到镜像上 */
const realCookie = await import(pathToFileURL(REAL_COOKIE_ENTRY).href);
const installedVersion = JSON.parse(fs.readFileSync(REAL_COOKIE_PKG, 'utf8')).version;

/** stringifySetCookie 的输入矩阵：覆盖 cookie@2 的全部分支 */
const SET_COOKIE_CASES = [
  ['最简 name/value', { name: 'a', value: 'b' }],
  ['value 为空', { name: 'a', value: '' }],
  ['value 缺省（null）', { name: 'a', value: null }],
  ['需要 URL 编码的 value', { name: 'a', value: 'x y=中文' }],
  [
    '全套属性',
    {
      name: 'sid',
      value: 'v',
      maxAge: 1800,
      domain: '.example.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax'
    }
  ],
  ['expires', { name: 'a', value: 'b', expires: new Date(0) }],
  ['partitioned + priority', { name: 'a', value: 'b', partitioned: true, priority: 'high' }],
  ['sameSite=true（等价 Strict）', { name: 'a', value: 'b', sameSite: true }],
  ['sameSite=none', { name: 'a', value: 'b', sameSite: 'none' }]
];

/** 解析类 API 的输入矩阵 */
const PARSE_CASES = [
  'a=b',
  'a=b; c=d',
  'a=1; Path=/; HttpOnly; SameSite=Lax',
  'sid=abc%20def; Max-Age=60; Secure; Priority=High',
  '',
  'novalue'
];

describe('cookie CJS 镜像：存在性与新鲜度', () => {
  test('moduleNameMapper 生效：命中的是镜像，而非 ESM 真包', () => {
    expect(typeof shim.stringifySetCookie).toBe('function');
    // 真包是 ESM，若映射没生效这里会是同一个引用（且 require 场景根本跑不到这行）
    expect(shim.stringifySetCookie).not.toBe(realCookie.stringifySetCookie);
  });

  test('镜像导出面与真包一致（漏 API 会以 500 而非报错的形式炸在业务里）', () => {
    // CJS 被 jest 合成为 ESM 命名空间时会多出 default / 'module.exports' 两个 interop 键
    const shimKeys = Object.keys(shim)
      .filter(key => key !== 'default' && key !== 'module.exports')
      .sort();
    expect(shimKeys).toEqual(Object.keys(realCookie).sort());
  });

  test(`镜像未陈旧：头部记录的版本 == 已安装版本（${installedVersion}）`, () => {
    const head = fs.readFileSync(SHIM_PATH, 'utf8').slice(0, 800);
    expect(head).toContain(`版本：cookie@${installedVersion}`);
  });
});

describe('cookie CJS 镜像：与真包行为逐字一致', () => {
  test.each(SET_COOKIE_CASES)('stringifySetCookie：%s', (_label, cookie) => {
    expect(shim.stringifySetCookie(cookie)).toBe(realCookie.stringifySetCookie(cookie));
  });

  test.each(PARSE_CASES)('parseCookie 一致：%j', header => {
    expect(shim.parseCookie(header)).toEqual(realCookie.parseCookie(header));
  });

  test.each(PARSE_CASES)('parseSetCookie 一致：%j', header => {
    expect(shim.parseSetCookie(header)).toEqual(realCookie.parseSetCookie(header));
  });

  test('stringifyCookie 一致', () => {
    const obj = { a: '1', b: 'x y', c: '' };
    expect(shim.stringifyCookie(obj)).toBe(realCookie.stringifyCookie(obj));
  });

  test.each([
    ['非法 name', { name: 'a=b', value: 'v' }],
    ['非法 maxAge', { name: 'a', value: 'v', maxAge: 1.5 }],
    ['非法 domain', { name: 'a', value: 'v', domain: 'not a domain' }],
    ['非法 sameSite', { name: 'a', value: 'v', sameSite: 'sideways' }],
    ['非法 priority', { name: 'a', value: 'v', priority: 'urgent' }]
  ])('非法输入同样抛 TypeError：%s', (_label, cookie) => {
    expect(() => shim.stringifySetCookie(cookie)).toThrow(TypeError);
    expect(() => realCookie.stringifySetCookie(cookie)).toThrow(TypeError);
  });
});

describe('真实依赖链：app.inject + @fastify/cookie', () => {
  test('inject({ cookies }) 能编码成请求头（light-my-request 的 require 路径）', async () => {
    const app = Fastify({ logger: false });
    app.get('/echo', async request => ({ cookie: request.headers.cookie ?? null }));
    try {
      const res = await app.inject({ method: 'GET', url: '/echo', cookies: { a: '1', b: 'x y' } });
      expect(res.statusCode).toBe(200);
      expect(res.json().cookie).toBe('a=1; b=x%20y');
    } finally {
      await app.close();
    }
  });

  test('带 path 的 cookie 按 RFC 6265 路径匹配过滤', async () => {
    const app = Fastify({ logger: false });
    app.get('/deep/path', async request => ({ cookie: request.headers.cookie ?? null }));
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/deep/path',
        cookies: [
          { name: 'root', value: '1', path: '/' },
          { name: 'deep', value: '2', path: '/deep' },
          { name: 'other', value: '3', path: '/other' }
        ]
      });
      expect(res.json().cookie).toBe('root=1; deep=2');
    } finally {
      await app.close();
    }
  });

  test('@fastify/cookie 的读（parseCookie）与写（stringifySetCookie）都正常', async () => {
    const app = Fastify({ logger: false });
    await app.register(fastifyCookie);
    app.get('/cookies', async (request, reply) => {
      reply.setCookie('out', 'v a l', { httpOnly: true, sameSite: 'lax', path: '/' });
      return { in: request.cookies };
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/cookies', cookies: { sid: 'S1', keep: 'k' } });
      expect(res.statusCode).toBe(200);
      expect(res.json().in).toEqual({ sid: 'S1', keep: 'k' });
      expect(res.headers['set-cookie']).toBe('out=v%20a%20l; Path=/; HttpOnly; SameSite=Lax');
    } finally {
      await app.close();
    }
  });
});
