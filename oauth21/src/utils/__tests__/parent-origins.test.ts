/**
 * `isAllowedParentOrigin` 父 origin 白名单测试
 *
 * 真实加载 `@/utils/parent-origins`，覆盖白名单判定与 trim/空项过滤。
 * 白名单值来自 `VITE_ALLOWED_PARENT_ORIGINS` 或 DEV_FALLBACK，本测试只断言
 * 判定函数的行为（命中/未命中/空值收窄），不依赖 env 具体取值。
 */
import { describe, test, expect } from 'vitest';
import { isAllowedParentOrigin, ALLOWED_PARENT_ORIGINS } from '@/utils/parent-origins';

describe('isAllowedParentOrigin —— 父应用 origin 白名单', () => {
  test('白名单内的 origin 命中', () => {
    // 白名单至少含一条 DEV_FALLBACK；用它测「命中」分支
    const trusted = ALLOWED_PARENT_ORIGINS[0];
    if (trusted) {
      expect(isAllowedParentOrigin(trusted)).toBe(true);
    }
  });

  test('白名单外的 origin 不命中', () => {
    expect(isAllowedParentOrigin('https://evil.example.com')).toBe(false);
  });

  test('空值 / null / undefined 一律不命中且类型收窄为 string', () => {
    expect(isAllowedParentOrigin('')).toBe(false);
    expect(isAllowedParentOrigin(null)).toBe(false);
    expect(isAllowedParentOrigin(undefined)).toBe(false);
  });

  test('白名单不因手写 env 的逗号空格而漏项', () => {
    // ALLOWED_PARENT_ORIGINS 已对 `a, b` 这种带空格的写法做 trim + 过滤空项；
    // 断言白名单里没有含空格或空串的脏项。
    for (const origin of ALLOWED_PARENT_ORIGINS) {
      expect(origin).toBe(origin.trim());
      expect(origin.length).toBeGreaterThan(0);
    }
  });
});
