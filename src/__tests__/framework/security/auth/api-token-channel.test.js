/**
 * 个人访问令牌通道（`framework/security/auth/bearer-auth.js` 的注册位）
 *
 * 守两件事：
 *   1. **未注册时行为不变** —— 其它部署形态 / 单测里不装用户中心，Bearer 头仍只认 JWT；
 *   2. **个人令牌不受 `jwtEnabled` 控制** —— 这个开关管的是"接不接受 OAuth 签发的 JWT"，
 *      与"用户能不能用自己签的令牌"是两件事。捆在一起的表现是：关掉 OAuth 的部署里
 *      令牌静默失效，而页面还写着"可用"。
 *
 * 测试环境的 `jwtEnabled` 恒为 false（`auth_config` 未配置），所以第 2 条在这里
 * 天然可验证：能通过就说明没被那个开关挡住。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  authenticateByJwt,
  registerApiTokenAuthenticator,
  hasApiTokenAuthenticator,
  resetApiTokenAuthenticatorForTesting
} from '../../../../framework/security/auth/bearer-auth.js';

/** 造一个"令牌命中"的用户对象（形状与 api-token-auth 的返回一致） */
const tokenUser = {
  sub: 'uid-1',
  uid: 'uid-1',
  userId: 7,
  username: 'alice',
  roles: ['admin_viewer'],
  permissions: { allows: ['admin:user:read'], denies: [] },
  appId: 'admin',
  tokenType: 'api_token'
};

describe('个人令牌通道：注册位', () => {
  beforeEach(() => {
    resetApiTokenAuthenticatorForTesting();
  });

  afterEach(() => {
    resetApiTokenAuthenticatorForTesting();
  });

  test('默认未注册：Bearer 头不会命中（行为与接入前一致）', async () => {
    expect(hasApiTokenAuthenticator()).toBe(false);
    await expect(authenticateByJwt({}, { authorization: 'Bearer nsk_whatever' })).resolves.toBeNull();
  });

  test('注册后：Bearer 头直接由令牌解析器认证', async () => {
    registerApiTokenAuthenticator(async plain => (plain === 'nsk_good' ? tokenUser : null));
    expect(hasApiTokenAuthenticator()).toBe(true);

    await expect(authenticateByJwt({}, { authorization: 'Bearer nsk_good' })).resolves.toEqual(tokenUser);
  });

  test('令牌不命中时返回 null（不抛错、不误放行）', async () => {
    registerApiTokenAuthenticator(async () => null);
    await expect(authenticateByJwt({}, { authorization: 'Bearer nsk_bad' })).resolves.toBeNull();
  });

  test('解析器抛错按未认证处理（库抖动不能把门打开）', async () => {
    registerApiTokenAuthenticator(async () => {
      throw new Error('db down');
    });
    await expect(authenticateByJwt({}, { authorization: 'Bearer nsk_boom' })).resolves.toBeNull();
  });

  test('没有 Authorization 头时不调用解析器（避免每条请求都查库）', async () => {
    let calls = 0;
    registerApiTokenAuthenticator(async () => {
      calls += 1;
      return null;
    });
    await authenticateByJwt({}, {});
    expect(calls).toBe(0);
  });

  test('传 null 可以取消注册（测试与热重载用）', async () => {
    registerApiTokenAuthenticator(async () => tokenUser);
    registerApiTokenAuthenticator(null);
    expect(hasApiTokenAuthenticator()).toBe(false);
    await expect(authenticateByJwt({}, { authorization: 'Bearer nsk_good' })).resolves.toBeNull();
  });
});
