/**
 * Origin 来源校验守卫（isAllowedOrigin）
 *
 * 覆盖点：
 * 1. 白名单归一化：env 里尾斜杠 / 大小写不得导致失配（浏览器 Origin 头与
 *    new URL().origin 都是 scheme/host 小写、无尾斜杠形态）
 * 2. Origin 头 → Referer 兜底 → 双无（curl）的三级校验顺序
 * 3. 生产 fail-closed / 开发宽松的环境分界
 *
 * 模块按 env 惰性解析（按原始串缓存），测试直接改 process.env 即可驱动，
 * 无需隔离模块注册表。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */
import { describe, it, expect, afterEach } from '@jest/globals';

import { isAllowedOrigin } from '../../../../framework/security/auth/security/origin-guard.js';

const originalEnv = process.env.CORS_ORIGINS;
const originalNodeEnv = process.env.NODE_ENV;

function req(headers) {
  return { headers };
}

afterEach(() => {
  if (originalEnv === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = originalEnv;
  process.env.NODE_ENV = originalNodeEnv;
});

describe('白名单归一化', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('env 带尾斜杠与大小写混杂 → 仍能与浏览器 Origin 头精确匹配', () => {
    // 回归：修复前 env 按原样精确比对，`HTTPS://A.com/` 永远匹配不到
    // 浏览器发来的 `https://a.com` → 合法来源被误拒
    process.env.CORS_ORIGINS = ' HTTPS://A.com/ , https://B.example.cn ';
    expect(isAllowedOrigin(req({ origin: 'https://a.com' }))).toBe(true);
    expect(isAllowedOrigin(req({ origin: 'https://b.example.cn' }))).toBe(true);
    expect(isAllowedOrigin(req({ origin: 'https://evil.com' }))).toBe(false);
  });

  it('Referer 兜底同样走归一化比对', () => {
    process.env.CORS_ORIGINS = 'https://a.com/';
    expect(isAllowedOrigin(req({ referer: 'https://a.com/page?x=1' }))).toBe(true);
    expect(isAllowedOrigin(req({ referer: 'https://evil.com/page' }))).toBe(false);
  });
});

describe('三级校验顺序', () => {
  it('Referer 格式异常 → 拒绝（不因兜底分支放行垃圾头）', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://a.com';
    expect(isAllowedOrigin(req({ referer: '::not-a-url::' }))).toBe(false);
  });

  it('无 Origin 无 Referer（curl）→ 开发放行', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_ORIGINS = 'https://a.com';
    expect(isAllowedOrigin(req({}))).toBe(true);
  });

  it('无 Origin 无 Referer（curl）→ 生产拒绝（fail-closed）', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://a.com';
    expect(isAllowedOrigin(req({}))).toBe(false);
  });
});

describe('环境分界', () => {
  it('白名单为空：开发放行带 Origin 的请求，生产拒绝', () => {
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = 'development';
    expect(isAllowedOrigin(req({ origin: 'https://anything.cn' }))).toBe(true);

    process.env.NODE_ENV = 'production';
    expect(isAllowedOrigin(req({ origin: 'https://anything.cn' }))).toBe(false);
  });

  it('白名单非空：生产环境只放行名单内来源', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://a.com';
    expect(isAllowedOrigin(req({ origin: 'https://a.com' }))).toBe(true);
    expect(isAllowedOrigin(req({ origin: 'https://b.com' }))).toBe(false);
  });
});
