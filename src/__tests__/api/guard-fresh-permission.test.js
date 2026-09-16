/**
 * 第 4 层（敏感操作回源校验）的行为验证
 *
 * 直接调用真实的 `applyGuardLogic`（不是内联副本），用假 request/reply 驱动。
 * 覆盖三条关键分支：
 * 1. freshPermission=true → 调用 getPermissions({ fresh: true })
 * 2. 回源失败 → **拒绝**（fail-closed），不是放行
 * 3. 回源成功 → 用回源权限覆盖 request.state.user，后续 requirePermission 读到新值
 * 4. freshPermission 未声明 → 不产生额外查询
 */
import { jest } from '@jest/globals';

const calls = [];
jest.unstable_mockModule('../../framework/auth/perm-cache.js', () => ({
  getPermissions: jest.fn(async (userId, appId, opts) => {
    calls.push({ userId, appId, opts });
    if (appId === '__boom__') throw new Error('DB 不可达');
    return { roles: ['r_fresh'], permissions: { allows: ['iam:role:assign'], denies: [] } };
  })
}));

// guard.js 还依赖 guard-config / ip / log，用真实模块即可（无副作用）
const { __test__applyGuardLogic } = await import('../../api/guard.js');

const makeReply = () => {
  const r = {
    sent: false,
    statusCode: 200,
    body: null,
    result: {
      forbidden: msg => {
        r.sent = true;
        r.statusCode = 403;
        r.body = { forbidden: msg };
        return r;
      },
      unauth: msg => {
        r.sent = true;
        r.statusCode = 401;
        r.body = { unauth: msg };
        return r;
      }
    },
    code(c) {
      r.statusCode = c;
      return r;
    },
    send(b) {
      r.sent = true;
      r.body = b;
      return r;
    }
  };
  return r;
};

const makeRequest = (user = { sub: 7, appId: 'app1', roles: ['r_old'], permissions: { allows: [], denies: [] } }) => ({
  ip: '127.0.0.1',
  state: { user },
  headers: {}
});

describe('敏感操作回源校验（第 4 层）', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  test('freshPermission=true → 以 fresh:true 回源', async () => {
    const req = makeRequest();
    const reply = makeReply();
    await __test__applyGuardLogic({ enabled: true, freshPermission: true }, req, reply);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts).toEqual({ fresh: true });
    expect(calls[0].userId).toBe(7);
    expect(calls[0].appId).toBe('app1');
  });

  test('回源结果覆盖 request.state.user（后续 requirePermission 读新值）', async () => {
    const req = makeRequest();
    const reply = makeReply();
    await __test__applyGuardLogic(
      { enabled: true, freshPermission: true, requirePermission: 'iam:role:assign' },
      req,
      reply
    );
    expect(req.state.user.roles).toEqual(['r_fresh']);
    expect(req.state.user.permissions.allows).toEqual(['iam:role:assign']);
    expect(reply.sent).toBe(false); // 新权限允许该操作 → 放行
  });

  test('回源失败 → 拒绝（fail-closed），不是放行', async () => {
    const req = makeRequest({ sub: 7, appId: '__boom__', roles: [], permissions: { allows: [], denies: [] } });
    const reply = makeReply();
    await __test__applyGuardLogic({ enabled: true, freshPermission: true }, req, reply);
    expect(reply.sent).toBe(true);
    expect(reply.statusCode).toBe(403);
    expect(reply.body.forbidden).toContain('权限校验服务不可用');
  });

  test('未登录 + freshPermission → 401', async () => {
    const req = makeRequest();
    req.state.user = null;
    const reply = makeReply();
    await __test__applyGuardLogic({ enabled: true, freshPermission: true }, req, reply);
    expect(reply.statusCode).toBe(401);
  });

  test('未声明 freshPermission → 零额外查询（普通读接口不付这个成本）', async () => {
    const req = makeRequest();
    const reply = makeReply();
    await __test__applyGuardLogic({ enabled: true, requireLogin: true }, req, reply);
    expect(calls).toHaveLength(0);
    expect(reply.sent).toBe(false);
  });

  test('缺 appId 时回退 GLOBAL（与 perm-cache 的全局语义一致）', async () => {
    const req = makeRequest({ sub: 7, roles: [], permissions: { allows: [], denies: [] } });
    const reply = makeReply();
    await __test__applyGuardLogic({ enabled: true, freshPermission: true }, req, reply);
    expect(calls[0].appId).toBe('GLOBAL');
  });

  test('回源后权限不足 → 403（回源不是为了放行，而是为了拿到真值）', async () => {
    const req = makeRequest();
    const reply = makeReply();
    await __test__applyGuardLogic(
      { enabled: true, freshPermission: true, requirePermission: 'iam:policy:delete' },
      req,
      reply
    );
    expect(reply.statusCode).toBe(403);
    expect(reply.body.forbidden).toContain('权限不足');
  });
});
