/**
 * 防御性输入的边界行为（真实模块驱动）
 *
 * 旧版本文件在自测 JS 语法（typeof null === 'object'、NaN 检测、JSON.parse 抛错），
 * 完全不 import 生产代码。本版改为驱动**真实的安全边界处理**：
 *
 * - `verifyCookie`：畸形/伪造 cookie 必须一律返回 null 且**绝不抛异常**
 *   （审计 🔴-1 的回归点：64 个非 hex 字符曾让 timingSafeEqual 抛 RangeError，
 *   而调用链无 try-catch，会打崩认证钩子且坏 cookie 永不清除）
 * - `normalizeIp` / `isIpMatch`：空值、IPv4-mapped IPv6、跨协议族、非法 CIDR
 *   都必须给出确定答案而不是抛错（守卫按它决定放行/拒绝）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect } from '@jest/globals';

import { signCookie, verifyCookie } from '../framework/auth/cookie.js';
import { normalizeIp, isIpMatch } from '../utils/ip.js';

describe('verifyCookie 的畸形输入契约', () => {
  it('正常签名可往返', () => {
    const parsed = verifyCookie(signCookie('a'.repeat(64), 7));
    expect(parsed).toEqual({ sessionId: 'a'.repeat(64), accessCount: 7 });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['空字符串', ''],
    ['非字符串', 12345],
    ['没有分隔点', 'abcdef'],
    ['点在开头', '.abcdef'],
    ['缺少签名段', 'cGF5bG9hZA==.'],
    ['payload 无冒号', 'Zm9v.YWJj']
  ])('%s 返回 null', (_name, value) => {
    expect(verifyCookie(value)).toBeNull();
  });

  it('签名被篡改返回 null', () => {
    const [payload, signature] = signCookie('session-1', 0).split('.');
    const flipped = (signature[0] === '0' ? '1' : '0') + signature.slice(1);
    expect(verifyCookie(`${payload}.${flipped}`)).toBeNull();
  });

  it('64 个非 hex 字符不抛 RangeError，只返回 null', () => {
    // 修复前：Buffer.from('zzzz…', 'hex') 静默产出空 Buffer，长度守卫比字符串长度
    // 挡不住 → timingSafeEqual 抛 ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH
    const payload = Buffer.from('session-2:0').toString('base64url');
    expect(() => verifyCookie(`${payload}.${'z'.repeat(64)}`)).not.toThrow();
    expect(verifyCookie(`${payload}.${'z'.repeat(64)}`)).toBeNull();
  });

  it('签名长度不对（短于 64 hex）返回 null', () => {
    const [payload] = signCookie('session-3', 0).split('.');
    expect(verifyCookie(`${payload}.abc`)).toBeNull();
  });

  it('signCookie 拒绝非字符串/空 sessionId', () => {
    expect(() => signCookie('', 0)).toThrow(/sessionId 参数无效/);
    expect(() => signCookie(null, 0)).toThrow(/sessionId 参数无效/);
  });
});

describe('IP 规范化的边界输入', () => {
  it('IPv4-mapped IPv6 去前缀', () => {
    expect(normalizeIp('::ffff:192.168.1.1')).toBe('192.168.1.1');
    expect(normalizeIp('  10.0.0.1  ')).toBe('10.0.0.1');
  });

  it('非字符串返回空串（不抛错）', () => {
    expect(normalizeIp(null)).toBe('');
    expect(normalizeIp(undefined)).toBe('');
    expect(normalizeIp(42)).toBe('');
  });
});

describe('isIpMatch 的边界输入', () => {
  it('空值一律不匹配', () => {
    expect(isIpMatch('', '10.0.0.1')).toBe(false);
    expect(isIpMatch('10.0.0.1', '')).toBe(false);
    expect(isIpMatch(null, null)).toBe(false);
  });

  it('通配符规则', () => {
    expect(isIpMatch('192.168.1.77', '*')).toBe(true);
    expect(isIpMatch('192.168.1.77', '0.0.0.0/0')).toBe(true);
    expect(isIpMatch('::1', '::/0')).toBe(true);
    expect(isIpMatch('192.168.1.77', '192.168.1.*')).toBe(true);
    expect(isIpMatch('192.168.2.77', '192.168.1.*')).toBe(false);
  });

  it('IPv4-mapped 客户端命中 IPv4 CIDR', () => {
    expect(isIpMatch('::ffff:10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(isIpMatch('::ffff:10.1.2.3', '11.0.0.0/8')).toBe(false);
  });

  it('跨协议族不误判', () => {
    expect(isIpMatch('10.0.0.1', '2001:db8::/32')).toBe(false);
    expect(isIpMatch('2001:db8::1', '10.0.0.0/8')).toBe(false);
  });

  it('IPv6 CIDR 正常匹配', () => {
    expect(isIpMatch('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(isIpMatch('2001:db9::1', '2001:db8::/32')).toBe(false);
  });

  it('非法 CIDR 返回 false 而不抛错', () => {
    expect(() => isIpMatch('10.0.0.1', '10.0.0.0/999')).not.toThrow();
    expect(isIpMatch('10.0.0.1', '10.0.0.0/999')).toBe(false);
    expect(isIpMatch('10.0.0.1', 'not-an-ip/24')).toBe(false);
  });
});
