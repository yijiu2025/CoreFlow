/**
 * `/authorize/login` 的账号防护（锁定 + 禁用）
 *
 * 锁的是一个真实存在的绕过口（2026-11-08 修复）：本端点与 `/login` 消费同一套凭证，
 * 却既不查 `isAccountLocked` 也不查 `status`，而且**不要求图形验证码** ——
 * 攻击者只要改打这条路由，账号维度的暴力破解锁定就完全失效。
 *
 * @author yijiu2025
 * @since 2026-11-08
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

let locked = false;
let userRow = { id: 1, uid: 'uid-1', username: 'alice', status: 1 };
const findByUsernameCalls = [];

jest.unstable_mockModule('../../../framework/support/log/index.js', () => {
  const noop = () => {};
  const logger = { info: noop, warn: noop, error: noop, debug: noop, always: { error: noop } };
  return { default: logger, log: logger, createLogger: () => logger };
});

jest.unstable_mockModule('../../../framework/ingress/firewall/engine/detectors/brute-force.js', () => ({
  isAccountLocked: async () => locked,
  checkLoginBruteForce: async () => {}
}));

jest.unstable_mockModule('../../../app/oauth21/dao/user.dao.js', () => ({
  default: {
    findByUsername: async name => {
      findByUsernameCalls.push(name);
      return userRow ? { ...userRow } : null;
    },
    verifyPassword: async () => true,
    findById: async () => userRow
  }
}));

jest.unstable_mockModule('../../../app/oauth21/dao/code.dao.js', () => ({
  default: { save: async () => {} }
}));

jest.unstable_mockModule('../../../app/oauth21/dao/client.dao.js', () => ({
  default: { findById: async () => null }
}));

jest.unstable_mockModule('../../../app/oauth21/dao/approval.dao.js', () => ({
  default: {
    getEffectiveApproval: async () => null,
    saveApproval: async () => ({})
  }
}));

const { AuthorizationService } = await import('../../../app/oauth21/services/authorization.service.js');

/** 会话存储替身：只需 get/set/delete */
function makeSessionStore(session = {}) {
  const data = session;
  return {
    get: async () => data,
    set: async () => {},
    delete: async () => {}
  };
}

/** 极简 reply 替身：记录状态码与响应体 */
function makeReply() {
  const reply = {
    statusCode: 200,
    body: null,
    code(c) {
      reply.statusCode = c;
      return reply;
    },
    send(payload) {
      reply.body = payload;
      return reply;
    }
  };
  return reply;
}

const SESSION = {
  client: { client_id: 'posecraft', client_name: 'PoseCraft' },
  scope: 'openid profile',
  query: { redirect_uri: 'https://app.example.com/callback' }
};

beforeEach(() => {
  locked = false;
  userRow = { id: 1, uid: 'uid-1', username: 'alice', status: 1 };
  findByUsernameCalls.length = 0;
});

describe('/authorize/login 的账号防护', () => {
  it('账号处于锁定窗口 → 423，且根本不校验密码', async () => {
    locked = true;
    const svc = new AuthorizationService();
    const reply = makeReply();

    await svc.handleAuthorizeLogin(
      { body: { sessionId: 's1', username: 'alice', password: 'whatever' } },
      reply,
      makeSessionStore(SESSION)
    );

    expect(reply.statusCode).toBe(423);
    // 关键：锁定期间不能再去比对密码（否则锁定只挡住"结果"，不挡住"尝试"）
    expect(findByUsernameCalls).toHaveLength(0);
  });

  it('禁用账号（status=0）→ 403，不签发授权码', async () => {
    userRow = { id: 1, uid: 'uid-1', username: 'alice', status: 0 };
    const svc = new AuthorizationService();
    const reply = makeReply();

    await svc.handleAuthorizeLogin(
      { body: { sessionId: 's1', username: 'alice', password: 'right' } },
      reply,
      makeSessionStore(SESSION)
    );

    expect(reply.statusCode).toBe(403);
  });

  it('status 以字符串 "0" 返回时同样拒绝（Number 归一）', async () => {
    userRow = { id: 1, uid: 'uid-1', username: 'alice', status: '0' };
    const svc = new AuthorizationService();
    const reply = makeReply();

    await svc.handleAuthorizeLogin(
      { body: { sessionId: 's1', username: 'alice', password: 'right' } },
      reply,
      makeSessionStore(SESSION)
    );

    expect(reply.statusCode).toBe(403);
  });

  it('正常账号 → 进入授权确认流程（新检查不误伤主路径）', async () => {
    const svc = new AuthorizationService();
    const reply = makeReply();

    await svc.handleAuthorizeLogin(
      { body: { sessionId: 's1', username: 'alice', password: 'right' } },
      reply,
      makeSessionStore(SESSION)
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.action).toBe('consent');
  });
});
