/**
 * 安全响应头 / 跨域选项构造
 *
 * 这份选项里有两条一旦写错就"看不见"的属性：
 *   ① 开发环境必须关掉 CSP —— 否则 HMR 的内联脚本被拦成一片 404（表现为页面白屏）；
 *   ② 生产环境的 `frame-ancestors` 必须跟随白名单：白名单为空时要退化成 `'none'`，
 *      否则任何站点都能 iframe 嵌入本站（点击劫持）。
 *
 * 选项构造是纯函数，因此可以脱离 Fastify 实例直接断言。
 */
import { describe, it, expect } from '@jest/globals';
import {
  buildHelmetOptions,
  buildCorsOptions,
  CORS_ALLOWED_HEADERS,
  CORS_EXPOSED_HEADERS
} from '../../../../framework/ingress/http/security-options.js';

describe('buildHelmetOptions', () => {
  it('开发环境禁用 CSP（HMR 需要内联脚本），且不开 HSTS（避免 localhost 被强制 HTTPS）', () => {
    const options = buildHelmetOptions(false, []);
    expect(options.contentSecurityPolicy).toBe(false);
    expect(options.hsts).toBe(false);
  });

  it('生产环境启用 CSP 与 HSTS', () => {
    const options = buildHelmetOptions(true, []);
    expect(options.hsts).toMatchObject({ maxAge: 31536000, includeSubDomains: true, preload: false });
    expect(options.contentSecurityPolicy.directives.defaultSrc).toEqual(["'self'"]);
  });

  it('🔴 白名单为空时 frame-ancestors = none（不允许被任意站点嵌入）', () => {
    const { directives } = buildHelmetOptions(true, []).contentSecurityPolicy;
    expect(directives.frameAncestors).toEqual(["'none'"]);
    expect(directives.frameSrc).toEqual(["'self'"]);
    expect(directives.connectSrc).toEqual(["'self'"]);
  });

  it('受信应用域进入 connect-src / frame-src / frame-ancestors（SSO 互嵌）', () => {
    const { directives } = buildHelmetOptions(true, ['https://a.example.com']).contentSecurityPolicy;
    expect(directives.frameAncestors).toEqual(["'self'", 'https://a.example.com']);
    expect(directives.frameSrc).toEqual(["'self'", 'https://a.example.com']);
    expect(directives.connectSrc).toEqual(["'self'", 'https://a.example.com']);
  });

  it('frameguard 必须关闭（否则与 CSP frame-ancestors 冲突，嵌入方按更严的生效）', () => {
    expect(buildHelmetOptions(true, []).frameguard).toBe(false);
  });

  it('空字符串来源被过滤，不产生空指令项', () => {
    const { directives } = buildHelmetOptions(true, ['', 'https://a.example.com', null]).contentSecurityPolicy;
    expect(directives.frameAncestors).toEqual(["'self'", 'https://a.example.com']);
  });
});

describe('buildCorsOptions', () => {
  it('同源请求（origin 为空）放行', () => {
    const options = buildCorsOptions({ origins: [], isProduction: true });
    expect(options.origin(undefined, (err, ok) => expect(ok).toBe(true))).toBeUndefined();
  });

  it('🔴 生产环境未命中白名单 → 返回错误且不放行', () => {
    const options = buildCorsOptions({ origins: ['https://a.example.com'], isProduction: true });
    let denied = null;
    options.origin('https://evil.example.com', (err, ok) => {
      denied = { err, ok };
    });
    expect(denied.ok).toBe(false);
    expect(denied.err).toBeInstanceOf(Error);
  });

  it('生产环境命中白名单 → 放行', () => {
    const options = buildCorsOptions({ origins: ['https://a.example.com'], isProduction: true });
    let allowed = null;
    options.origin('https://a.example.com', (err, ok) => {
      allowed = { err, ok };
    });
    expect(allowed.err).toBeNull();
    expect(allowed.ok).toBe(true);
  });

  it('credentials 必须为 true（cookie 会话跨域直连依赖它）', () => {
    expect(buildCorsOptions({}).credentials).toBe(true);
  });

  it('🔴 设备身份响应头必须暴露（cookie 是 httpOnly，JS 只能从这里拿到 ID）', () => {
    expect(CORS_EXPOSED_HEADERS).toContain('X-Device-Id');
    expect(CORS_EXPOSED_HEADERS).toContain('X-Device-Id-Updated');
    // H5 签名 / 设备指纹相关的请求头也一个不能少
    // 自定义头漏一个 = 该链路在跨域直连时预检失败（整条请求发不出去），
    // 所以这里按"业务实际发送的头"逐项断言，而不是只断言数组非空。
    expect(CORS_ALLOWED_HEADERS).toEqual(
      expect.arrayContaining(['token', 'X-Sign', 'X-Timestamp', 'X-Nonce', 'x-device-id', 'x-csrf-token'])
    );
  });
});
