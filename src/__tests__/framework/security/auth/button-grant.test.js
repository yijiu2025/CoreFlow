/**
 * 按钮授权「提供方注册位」的单元测试
 *
 * `button-grant.js` 是框架与 console 应用之间唯一的耦合点：守卫问它"这个用户的
 * 按钮授权是什么"，它转给注册进来的函数。三条边界必须钉住：
 *   1. 没注册（其它部署 / 单测）= 不设闸，行为与改造前一致；
 *   2. 注册后按 user 转发；
 *   3. 提供方抛错 = 退化成不设闸（不能把整个控制台锁死），且**不向上抛**。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import {
  registerButtonGrantProvider,
  hasButtonGrantProvider,
  resolveButtonGrants,
  resetButtonGrantProviderForTesting
} from '../../../../framework/security/auth/permission/button-grant.js';

afterEach(() => resetButtonGrantProviderForTesting());

describe('按钮授权提供方注册位', () => {
  it('未注册时：不设闸（返回 null）', async () => {
    expect(hasButtonGrantProvider()).toBe(false);
    await expect(resolveButtonGrants({ userId: 1 })).resolves.toBeNull();
  });

  it('注册后：按 user 转发并回传数据', async () => {
    const seen = [];
    registerButtonGrantProvider(async user => {
      seen.push(user.userId);
      return { buttonCodes: ['admin:user:create'], menuPerms: [] };
    });
    expect(hasButtonGrantProvider()).toBe(true);
    const grants = await resolveButtonGrants({ userId: 9 });
    expect(seen).toEqual([9]);
    expect(grants).toEqual({ buttonCodes: ['admin:user:create'], menuPerms: [] });
  });

  it('提供方抛错：吞掉并返回 null（退化为只看 policy）', async () => {
    registerButtonGrantProvider(async () => {
      throw new Error('db down');
    });
    await expect(resolveButtonGrants({ userId: 9 })).resolves.toBeNull();
  });

  it('传 null 等价于注销', async () => {
    registerButtonGrantProvider(async () => ({ buttonCodes: [], menuPerms: [] }));
    registerButtonGrantProvider(null);
    expect(hasButtonGrantProvider()).toBe(false);
  });
});
