/**
 * 授权码一次性消费（重放必须被拒绝）
 *
 * 这条用例锁的是一个**已经发生过**的静默缺陷（2026-11-08 修复）：
 * `CodeDao.consume()` 在 DB 分支发现 code 已消费时返回的是数据 + `replay_detected: true`
 * （而不是 null），而 `handleAuthorizationCode` 只看 `!codeData` —— 于是"重放检测"
 * 只写不判，Redis 关闭/不可用时同一个 authorization_code 能反复换出新令牌。
 *
 * 为什么必须真实加载被测代码：如果把 `handleAuthorizationCode` 也换成替身，
 * 这层"DAO 给了信号、service 有没有读"的接缝就完全测不到 —— 正是漏掉的那一环。
 *
 * @author yijiu2025
 * @since 2026-11-08
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/** 各 DAO 的可控替身 */
let consumeResult = null;
const savedTokens = [];
let userById = { id: 1, uid: 'uid-1', status: 1 };

jest.unstable_mockModule('../../../framework/security/auth/index.js', () => ({
  verifyPassword: async () => true,
  COOKIE_POLICY: {}
}));

jest.unstable_mockModule('../../../framework/support/log/index.js', () => {
  const noop = () => {};
  const logger = { info: noop, warn: noop, error: noop, debug: noop, always: { error: noop } };
  return { default: logger, log: logger, createLogger: () => logger };
});

jest.unstable_mockModule('../../../app/oauth21/dao/code.dao.js', () => ({
  default: {
    consume: async () => consumeResult
  }
}));

jest.unstable_mockModule('../../../app/oauth21/dao/token.dao.js', () => ({
  default: {
    save: async (token, data) => {
      savedTokens.push({ token, data });
    },
    find: async () => null,
    findRevoked: async () => null,
    revoke: async () => {},
    revokeAllForUser: async () => {}
  }
}));

jest.unstable_mockModule('../../../app/oauth21/dao/client.dao.js', () => ({
  default: { findById: async () => null }
}));

jest.unstable_mockModule('../../../app/oauth21/dao/user.dao.js', () => ({
  default: { findById: async () => userById }
}));

jest.unstable_mockModule('../../../app/oauth21/crypto/jwt.js', () => ({
  issueAccessToken: async () => ({ token: 'access-token-ok', kid: 'kid-1' }),
  issueIdToken: async () => ({ token: 'id-token-ok', kid: 'kid-1' })
}));

const { TokenService } = await import('../../../app/oauth21/services/token.service.js');

const CLIENT = { client_id: 'posecraft', token_endpoint_auth_method: 'none' };

/** 一份"已经兑换过一次"的授权码数据（DAO 会带上 replay_detected 标记） */
function consumedCodeData(extra = {}) {
  return {
    sub: 'uid-1',
    client_id: 'posecraft',
    redirect_uri: 'https://app.example.com/callback',
    scope: 'openid profile',
    consumed: true,
    ...extra
  };
}

beforeEach(() => {
  consumeResult = null;
  savedTokens.length = 0;
  userById = { id: 1, uid: 'uid-1', status: 1 };
});

describe('授权码兑换：重放检测必须被执行', () => {
  it('DAO 返回 replay_detected → 拒绝，且不签发任何令牌', async () => {
    consumeResult = consumedCodeData({ replay_detected: true });
    const svc = new TokenService();

    await expect(
      svc.handleAuthorizationCode({
        code: 'the-code',
        redirect_uri: 'https://app.example.com/callback',
        client: CLIENT
      })
    ).rejects.toMatchObject({ error: 'invalid_grant' });

    expect(savedTokens).toHaveLength(0);
  });

  it('code 不存在/已过期（DAO 返回 null）→ 同样 invalid_grant', async () => {
    consumeResult = null;
    const svc = new TokenService();

    await expect(
      svc.handleAuthorizationCode({
        code: 'missing',
        redirect_uri: 'https://app.example.com/callback',
        client: CLIENT
      })
    ).rejects.toMatchObject({ error: 'invalid_grant' });
  });

  it('正常首次兑换仍然成功（新检查不能误伤主路径）', async () => {
    consumeResult = consumedCodeData(); // 无 replay_detected
    const svc = new TokenService();

    const result = await svc.handleAuthorizationCode({
      code: 'fresh-code',
      redirect_uri: 'https://app.example.com/callback',
      client: CLIENT
    });

    expect(result.access_token).toBe('access-token-ok');
    expect(typeof result.refresh_token).toBe('string');
    // 刷新令牌必须落库（否则刷新链路断掉）
    expect(savedTokens).toHaveLength(1);
  });

  it('禁用账号不得用授权码换令牌（Number 归一，兼容字符串 "0"）', async () => {
    consumeResult = consumedCodeData();
    userById = { id: 1, uid: 'uid-1', status: '0' }; // DB 驱动可能返回字符串
    const svc = new TokenService();

    await expect(
      svc.handleAuthorizationCode({
        code: 'fresh-code',
        redirect_uri: 'https://app.example.com/callback',
        client: CLIENT
      })
    ).rejects.toMatchObject({ error: 'invalid_grant' });
    expect(savedTokens).toHaveLength(0);
  });
});
