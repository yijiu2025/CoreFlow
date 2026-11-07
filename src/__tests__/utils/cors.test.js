/**
 * CORS 来源白名单判据
 *
 * 这条判据守的是跨域边界：生产环境下白名单为空 / 未命中时必须**拒绝**，
 * 而不是"没配就放行"——后者等于把 CSRF 与信息泄露的门直接开着。
 * 判断逻辑已从 `@fastify/cors` 的 origin 回调里抽成纯函数，此处逐条钉死。
 */
import { describe, it, expect } from '@jest/globals';
import { parseOriginList, isOriginAllowed } from '../../utils/cors.js';

describe('parseOriginList', () => {
  it('未配置 / 空串 → 空数组（生产会被判为"拒绝全部跨域"）', () => {
    expect(parseOriginList(undefined)).toEqual([]);
    expect(parseOriginList(null)).toEqual([]);
    expect(parseOriginList('')).toEqual([]);
    expect(parseOriginList('   ')).toEqual([]);
  });

  it('逗号分隔、去空白、丢空项', () => {
    expect(parseOriginList(' https://a.example.com , https://b.example.com ')).toEqual([
      'https://a.example.com',
      'https://b.example.com'
    ]);
    expect(parseOriginList('https://a.example.com,,')).toEqual(['https://a.example.com']);
    expect(parseOriginList(' , ')).toEqual([]);
  });
});

describe('isOriginAllowed', () => {
  it('无 Origin（同源请求 / 非浏览器客户端）恒放行', () => {
    expect(isOriginAllowed(undefined, [], true)).toBe(true);
    expect(isOriginAllowed('', [], true)).toBe(true);
  });

  it('非生产环境放行任意来源（本地多端口开发）', () => {
    expect(isOriginAllowed('http://localhost:5177', [], false)).toBe(true);
    expect(isOriginAllowed('https://evil.example.com', ['https://a.example.com'], false)).toBe(true);
  });

  it('🔴 生产环境白名单为空 → 一律拒绝（不允许"没配就放行"）', () => {
    expect(isOriginAllowed('https://a.example.com', [], true)).toBe(false);
    expect(isOriginAllowed('https://a.example.com', undefined, true)).toBe(false);
  });

  it('🔴 生产环境只放行精确命中（不做子串 / 通配匹配）', () => {
    const allowed = ['https://a.example.com'];
    expect(isOriginAllowed('https://a.example.com', allowed, true)).toBe(true);
    expect(isOriginAllowed('https://evil-a.example.com', allowed, true)).toBe(false);
    expect(isOriginAllowed('https://a.example.com.evil.com', allowed, true)).toBe(false);
    expect(isOriginAllowed('http://a.example.com', allowed, true)).toBe(false);
  });
});
