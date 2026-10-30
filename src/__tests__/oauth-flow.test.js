/**
 * OAuth 2.1 授权边界（真实模块驱动）
 *
 * 旧版本把 PKCE 算法抄进测试里自证（自己算 challenge、自己断言），生产实现改坏也全绿。
 * 本版直接驱动生产代码：
 * - `crypto/pkce.js`：S256/plain 校验、verifier 格式边界（RFC 7636 §4.1）
 * - `config/scope-registry.js`：scope 越权（requested ⊄ allowed）、字段裁剪
 *   （phone 声明为 sensitive → 永不下发）、未知 scope 剔除
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'node:crypto';

import { verifyPKCE, isValidCodeVerifier } from '../app/oauth21/crypto/pkce.js';
import {
  resolveScopeDetails,
  resolveFieldSet,
  validateScopes,
  checkScopeSubset,
  REQUIRED_SCOPES
} from '../app/oauth21/config/scope-registry.js';

describe('PKCE 校验（生产实现）', () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  it('S256：verifier 与 challenge 匹配', () => {
    expect(verifyPKCE(verifier, challenge, 'S256')).toBe(true);
  });

  it('S256：不匹配的 verifier 被拒', () => {
    expect(verifyPKCE(`${verifier}x`, challenge, 'S256')).toBe(false);
  });

  it('plain：按明文比较', () => {
    expect(verifyPKCE(verifier, verifier, 'plain')).toBe(true);
    expect(verifyPKCE(verifier, `${verifier}y`, 'plain')).toBe(false);
  });

  it('未知 method 一律拒绝（不允许降级绕过）', () => {
    expect(verifyPKCE(verifier, verifier, 'S512')).toBe(false);
  });

  it('不传 method 时默认 S256（默认值是强算法，不会退化成 plain）', () => {
    expect(verifyPKCE(verifier, challenge)).toBe(true);
    expect(verifyPKCE(verifier, verifier)).toBe(false);
  });

  it('缺 verifier 或 challenge 直接拒绝', () => {
    expect(verifyPKCE('', challenge)).toBe(false);
    expect(verifyPKCE(verifier, '')).toBe(false);
  });
});

describe('code_verifier 格式（RFC 7636 §4.1）', () => {
  it('43 字符是下界，42 字符非法', () => {
    expect(isValidCodeVerifier('a'.repeat(43))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(42))).toBe(false);
  });

  it('128 字符是上界，129 字符非法', () => {
    expect(isValidCodeVerifier('a'.repeat(128))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
  });

  it('允许的字符集恰好是 unreserved', () => {
    expect(isValidCodeVerifier(`${'a'.repeat(42)}-._~`)).toBe(true);
    expect(isValidCodeVerifier(`${'a'.repeat(42)}+`)).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(42)}/`)).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(42)} `)).toBe(false);
  });
});

describe('scope 越权防护', () => {
  it('requested ⊆ allowed 时放行', () => {
    expect(checkScopeSubset('openid profile', 'openid profile email')).toEqual({ valid: true, exceeded: [] });
  });

  it('请求超出注册范围被拒，并列出越权项', () => {
    expect(checkScopeSubset('openid admin', 'openid profile')).toEqual({ valid: false, exceeded: ['admin'] });
  });

  it('空 requested 视为合法（无请求即无越权）', () => {
    expect(checkScopeSubset('', 'openid').valid).toBe(true);
    expect(checkScopeSubset(undefined, 'openid').valid).toBe(true);
  });

  it('allowed 为空时任何请求都算越权', () => {
    expect(checkScopeSubset('openid', '').valid).toBe(false);
  });

  it('多空格/换行不会产生幽灵 scope', () => {
    expect(checkScopeSubset('  openid   profile  ', 'openid profile').valid).toBe(true);
  });
});

describe('scope 字段裁剪（防隐私越权）', () => {
  it('未知 scope 被剔除，不报错也不带字段', () => {
    expect(validateScopes('openid unknown_scope')).toEqual({ valid: false, unknown: ['unknown_scope'] });
    expect(resolveFieldSet('openid unknown_scope')).toEqual([]);
  });

  it('profile 只给公开字段', () => {
    expect(resolveFieldSet('profile')).toEqual(expect.arrayContaining(['username', 'name', 'avatar']));
  });

  it('phone 是 sensitive：即便声明了 scope 也不下发字段', () => {
    expect(resolveFieldSet('phone')).not.toContain('phone');
    expect(resolveFieldSet('profile phone')).not.toContain('phone');
  });

  it('多 scope 取并集且不重复', () => {
    const fields = resolveFieldSet('profile email profile');
    expect(fields.filter(f => f === 'username')).toHaveLength(1);
    expect(fields).toEqual(expect.arrayContaining(['username', 'email']));
  });

  it('空 scope 返回空字段集', () => {
    expect(resolveFieldSet('')).toEqual([]);
    expect(resolveFieldSet(null)).toEqual([]);
  });
});

describe('scope 元数据', () => {
  it('openid/profile 标记为必选', () => {
    expect(REQUIRED_SCOPES).toEqual(expect.arrayContaining(['openid', 'profile']));
    expect(REQUIRED_SCOPES).not.toContain('email');
  });

  it('授权页描述可被客户端覆盖，字段映射不可覆盖', () => {
    const [detail] = resolveScopeDetails('email', { email: { desc: '用于发送作品审核通知' } });
    expect(detail.desc).toBe('用于发送作品审核通知');
    expect(detail.fields).toEqual(['email']);
  });
});
