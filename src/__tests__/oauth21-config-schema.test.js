/**
 * OAuth21 配置 schema 契约测试
 *
 * 锁住「按功能分组」这件事本身：
 *   - TTL 属于**令牌生命周期**，不得挂在 `jwt` 下（默认 Session 模式也用它算
 *     cookie maxAge / expires_in；只有 id_token 是真 JWT）
 *   - 授权码是**一次性不透明码**，与 JWT 无关，单独 `authorizationCode.ttl`
 *   - `jwt` 只留模式开关（+ 结构性常量 algorithm 由 config.js 补）
 *
 * 若有人把 TTL 挪回 jwt（或反过来拍平），本测试先红，避免"看起来能跑、
 * 语义却错位"的配置结构再次出现。
 */

import { describe, it, expect } from '@jest/globals';
import { OAUTH21_CONFIG } from '../config/oauth21_config.js'; // 覆盖层（出厂为空）
import config from '../app/oauth21/config/config.js';

describe('oauth21 配置 · 分组契约', () => {
  it('src/config 出厂为空覆盖（默认值在 app/oauth21/config/config.js）', () => {
    expect(OAUTH21_CONFIG).toEqual({});
  });

  it('生效配置顶层分组恰好是 server / tokens / authorizationCode / jwt / pkce / device / session', () => {
    expect(Object.keys(config).sort()).toEqual([
      'authorizationCode',
      'device',
      'jwt',
      'pkce',
      'server',
      'session',
      'tokens'
    ]);
  });

  it('jwt 组只放模式开关与算法常量，不承载任何 TTL', () => {
    const jwtKeys = Object.keys(config.jwt);
    expect(jwtKeys).toContain('enabled');
    expect(jwtKeys.filter(k => /TTL/i.test(k))).toEqual([]);
  });

  it('三个令牌期都在 tokens 组下', () => {
    expect(Object.keys(config.tokens).sort()).toEqual(['accessTokenTTL', 'idTokenTTL', 'refreshTokenTTL']);
  });

  it('授权码独立成组（不经 jwt）', () => {
    expect(config.authorizationCode).toEqual({ ttl: 600 });
  });
});

describe('oauth21 生效配置 · 取值与一致性', () => {
  it('TTL 全部为正数（0/负数会让令牌立即过期或永不过期）', () => {
    const { accessTokenTTL, refreshTokenTTL, idTokenTTL } = config.tokens;
    for (const ttl of [accessTokenTTL, refreshTokenTTL, idTokenTTL, config.authorizationCode.ttl]) {
      expect(Number.isInteger(ttl)).toBe(true);
      expect(ttl).toBeGreaterThan(0);
    }
  });

  it('refresh 必须比 access 长（否则刷新链形同虚设）', () => {
    expect(config.tokens.refreshTokenTTL).toBeGreaterThan(config.tokens.accessTokenTTL);
  });

  it('algorithm 是结构性常量（不在可调配置里）', () => {
    expect(config.jwt.algorithm).toBe('RS256');
    expect(OAUTH21_CONFIG.jwt).toBeUndefined();
  });

  it('maxRefreshTokens 与框架会话层同源（同一旋钮只留一份默认值）', () => {
    expect(config.session.maxRefreshTokens).toBe(10);
  });
});
