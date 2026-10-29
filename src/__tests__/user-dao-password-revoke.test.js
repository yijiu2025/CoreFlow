/**
 * updatePassword 凭证撤销安全测试
 *
 * 【安全背景】密码重置/修改后，攻击者可能仍持有旧的 Session/Refresh/OAuth 凭证。
 * 本测试验证：updatePassword 成功后必须撤销所有既有凭证，防止旧凭证继续可用。
 *
 * 【Red→Green 流程】
 * 1. Red: 当前 updatePassword 仅更新密码，不断言撤销 → 测试失败
 * 2. Green: 修复后调用 kickAllSessions + TokenDao.revokeAllForUser → 测试通过
 *
 * @see src/app/user/dao/user.js updatePassword
 * @see src/framework/auth/session-kick.js kickAllSessions
 * @see src/app/oauth21/dao/token.dao.js revokeAllForUser
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// ── Mock 追踪 ──
const calls = {
  identitySave: 0,
  kickAllSessions: [],
  revokeAllForUser: []
};

// ── DB 模型桩 ──
const mockIdentity = {
  credential: 'old-hash',
  user: { id: 42, uid: 'user-uid-42', status: 1 },
  save: jest.fn(async () => {
    calls.identitySave++;
  })
};

const models = {
  UserIdentity: {
    findOne: jest.fn(async () => mockIdentity)
  },
  User: {
    findOne: jest.fn(async () => mockIdentity.user)
  }
};

jest.unstable_mockModule('../framework/db/index.js', () => ({
  default: { transaction: async cb => cb({}) },
  sequelize: { transaction: async cb => cb({}) },
  getModel: name => models[name]
}));

jest.unstable_mockModule('../framework/keys/encryption.js', () => ({
  decrypt: async () => 'NewPassw0rd!'
}));

jest.unstable_mockModule('../framework/auth/password-hash.js', () => ({
  hashPassword: async () => 'new-hash',
  verifyPassword: async () => true,
  isLegacyHash: () => false
}));

jest.unstable_mockModule('../framework/auth/password-policy.js', () => ({
  validatePasswordStrength: () => ({ valid: true, errors: [] })
}));

jest.unstable_mockModule('../app/admin/dao/iam.dao.js', () => ({
  default: {}
}));

// ── 凭证撤销函数 mock（关键：断言它们是否被调用）──
jest.unstable_mockModule('../framework/auth/session.js', () => ({
  kickAllSessions: jest.fn(async userId => {
    calls.kickAllSessions.push(userId);
  })
}));

jest.unstable_mockModule('../app/oauth21/dao/token.dao.js', () => ({
  default: {
    revokeAllForUser: jest.fn(async uid => {
      calls.revokeAllForUser.push(uid);
    })
  }
}));

// 动态导入被测模块（在 mock 之后）
const { default: userDao } = await import('../app/user/dao/user.js');

beforeEach(() => {
  jest.clearAllMocks();
  calls.identitySave = 0;
  calls.kickAllSessions.length = 0;
  calls.revokeAllForUser.length = 0;
  mockIdentity.credential = 'old-hash';
});

describe('updatePassword 密码更新', () => {
  test('成功更新密码哈希', async () => {
    const result = await userDao.updatePassword('test@example.com', 'encrypted', 'kid-1');

    expect(result).toBe(true);
    expect(mockIdentity.credential).toBe('new-hash');
    expect(calls.identitySave).toBe(1);
  });
});

describe('updatePassword 凭证撤销（安全要求）', () => {
  test('密码更新后必须撤销该用户所有 Session/Refresh（kickAllSessions）', async () => {
    await userDao.updatePassword('test@example.com', 'encrypted', 'kid-1');

    // 【Red】当前代码不会调用 kickAllSessions → 此断言失败
    // 【Green】修复后应传入 user.id=42
    expect(calls.kickAllSessions).toHaveLength(1);
    expect(calls.kickAllSessions[0]).toBe(42);
  });

  test('密码更新后必须撤销该用户所有 OAuth Refresh Token', async () => {
    await userDao.updatePassword('test@example.com', 'encrypted', 'kid-1');

    // 【Red】当前代码不会调用 revokeAllForUser → 此断言失败
    // 【Green】修复后应传入 user.uid='user-uid-42'
    expect(calls.revokeAllForUser).toHaveLength(1);
    expect(calls.revokeAllForUser[0]).toBe('user-uid-42');
  });

  test('凭证撤销失败不得报告完整成功，但仍执行其余撤销', async () => {
    const { kickAllSessions } = await import('../framework/auth/session.js');
    kickAllSessions.mockRejectedValueOnce(new Error('Redis connection failed'));

    await expect(userDao.updatePassword('test@example.com', 'encrypted', 'kid-1')).rejects.toThrow(
      '密码已更新，但旧凭证撤销未完成'
    );

    expect(mockIdentity.credential).toBe('new-hash');
    expect(calls.identitySave).toBe(1);
    expect(calls.revokeAllForUser).toEqual(['user-uid-42']);
  });
});
