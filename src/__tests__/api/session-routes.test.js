/**
 * 会话管理接口的行为测试
 *
 * 分两层，因为安全边界跨了两个文件：
 *
 * **① api 层（`api/user|admin/.../sessions.js`）** —— 断言"该调哪个 repo 函数、传什么"。
 *   踢别人的会话必须 404（403 等于确认它存在）、清理只接受会话里的 userId、
 *   管理员列表响应里不能有 token。
 *
 * **② repo 层（`framework/.../session/session-repo.js`）** —— 断言"where 到底怎么构造"。
 *   `user_id` 必须进 where（否则能用行 id 探测别人的设备）、只删 `revoked = true`、
 *   哈希必须来自 `sidHash` 而不是这里另写一份 sha256。
 *
 * 为什么必须先有这层网才敢搬到 framework：这是认证核心路径，
 * 改错了的表现是"设备踢不掉"或"认不出当前设备"，不是抛错。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { beforeEach, describe, expect, jest } from '@jest/globals';

/** 收集路由 handler（按 options.name），两个模块共用一张表 */
const handlers = {};

jest.unstable_mockModule('../../api/guard.js', () => ({
  registerGroupMetadata: () => undefined,
  registerSecureRoute: (_fastify, options) => {
    handlers[options.name] = options.handler;
    return { name: options.name, fullUrl: options.url, method: options.method };
  }
}));

/** 认证框架侧能力：会话相关的读操作全部走 repo，这里打桩 */
const checkMaxSessions = jest.fn();
const kickSessionFn = jest.fn();
const kickAllSessionsFn = jest.fn();
const kickDeviceEverywhereFn = jest.fn();
const clearAuthCookiesFn = jest.fn();
const logAuditEventFn = jest.fn();
const findOwnedSession = jest.fn();
const findOwnedDeviceRow = jest.fn();
const listUserDeviceRows = jest.fn();
const listDeviceRows = jest.fn();
const pruneRevokedOfUser = jest.fn();
jest.unstable_mockModule('../../framework/security/auth/index.js', () => ({
  checkMaxSessions,
  kickSession: kickSessionFn,
  kickAllSessions: kickAllSessionsFn,
  kickDeviceEverywhere: kickDeviceEverywhereFn,
  clearAuthCookies: clearAuthCookiesFn,
  logAuditEvent: logAuditEventFn,
  LONG_SESSION_TTL: 30 * 24 * 60 * 60,
  findOwnedSession,
  findOwnedDeviceRow,
  listUserDeviceRows,
  listDeviceRows,
  pruneRevokedOfUser,
  // 桩里模拟"哈希的唯一真源"：真实实现是 sha256，这里只需要可预测
  currentTokenHash: sid => (sid ? `hash:${sid}` : null)
}));

jest.unstable_mockModule('../../app/user/services/session-view.service.js', () => ({
  formatSessionList: rows => ({ sessions: rows, total: rows.length }),
  formatDeviceList: rows => rows
}));

jest.unstable_mockModule('../../app/admin/permission/index.js', () => ({
  ADMIN_PERMISSIONS: { USER: { READ: 'admin:user:read', UPDATE: 'admin:user:update' } }
}));

/** 模型桩：admin 的踢设备接口还要取用户名；repo 的测试也用它 */
const tokenFindAll = jest.fn();
const tokenFindOne = jest.fn();
const tokenDestroy = jest.fn();
const userFindByPk = jest.fn();
const getModelFn = jest.fn(name => {
  if (name === 'SessionToken') {
    return { findAll: tokenFindAll, findOne: tokenFindOne, destroy: tokenDestroy };
  }
  if (name === 'User') return { findByPk: userFindByPk };
  return undefined;
});
jest.unstable_mockModule('../../framework/persistence/db/index.js', () => ({ getModel: getModelFn }));

const { default: registerUserSessionRoutes } = await import('../../api/user/v1/sessions.js');
const { default: registerAdminSessionRoutes } = await import('../../api/admin/user/v1/sessions.js');
await registerUserSessionRoutes({});
await registerAdminSessionRoutes({});

/** repo 用真实实现（它只依赖 db 桩与 sidHash 纯函数） */
const repo = await import('../../framework/security/auth/session/session-repo.js');

/**
 * reply 桩
 *
 * @returns {object} 记录最后一次响应
 */
function makeReply() {
  const out = { calls: [] };
  let status = 200;
  out.code = value => {
    status = value;
    return out;
  };
  out.send = body => {
    out.calls.push({ kind: 'error', status, body });
    return out;
  };
  out.result = {
    success: (message, data) => {
      out.calls.push({ kind: 'success', message, data });
      return out;
    },
    fail: (message, data) => {
      out.calls.push({ kind: 'fail', message, data });
      return out;
    }
  };
  out.last = () => out.calls[out.calls.length - 1];
  return out;
}

/** 已登录用户（`sub` 是框架写入的登录标识） */
const loggedIn = (over = {}) => ({ sub: 'u-1', userId: 7, sessionId: 'sid-current', deviceId: null, ...over });

beforeEach(() => {
  tokenFindAll.mockReset().mockResolvedValue([]);
  tokenFindOne.mockReset().mockResolvedValue(null);
  tokenDestroy.mockReset().mockResolvedValue(0);
  userFindByPk.mockReset().mockResolvedValue({ id: 7, username: '张三' });
  checkMaxSessions.mockReset().mockResolvedValue({ sessions: [], maxSessions: 5 });
  kickSessionFn.mockReset().mockResolvedValue(true);
  kickAllSessionsFn.mockReset().mockResolvedValue(2);
  kickDeviceEverywhereFn.mockReset().mockResolvedValue({ kicked: 1, revoked: 0, clearedRefresh: 0 });
  clearAuthCookiesFn.mockReset();
  logAuditEventFn.mockReset();
  findOwnedSession.mockReset().mockResolvedValue(null);
  findOwnedDeviceRow.mockReset().mockResolvedValue(null);
  listUserDeviceRows.mockReset().mockResolvedValue([]);
  listDeviceRows.mockReset().mockResolvedValue([]);
  pruneRevokedOfUser.mockReset().mockResolvedValue(0);
});

describe('踢指定会话的归属校验', () => {
  it('越权踢别人的会话返回 404（不是 403，403 等于确认它存在）', async () => {
    findOwnedSession.mockResolvedValue(null);
    const reply = makeReply();

    await handlers.kickSession({ state: { user: loggedIn() }, body: { sessionId: 'sid-other' } }, reply);

    const last = reply.last();
    expect(last.kind).toBe('error');
    expect(last.status).toBe(404);
    expect(kickSessionFn).not.toHaveBeenCalled();
    // 归属校验必须带上当前用户，不能只按 sessionId 查
    expect(findOwnedSession).toHaveBeenCalledWith('sid-other', 7);
  });

  it('缺少 sessionId 返回 400，不查库', async () => {
    const reply = makeReply();
    await handlers.kickSession({ state: { user: loggedIn() }, body: {} }, reply);

    expect(reply.last().status).toBe(400);
    expect(findOwnedSession).not.toHaveBeenCalled();
  });

  it('属于自己的会话才真正踢出', async () => {
    findOwnedSession.mockResolvedValue({ id: 3, token: 'hash' });
    const reply = makeReply();

    await handlers.kickSession({ state: { user: loggedIn() }, body: { sessionId: 'sid-mine' } }, reply);

    expect(kickSessionFn).toHaveBeenCalledWith('sid-mine', 7);
    expect(reply.last().kind).toBe('success');
  });
});

describe('踢自己的设备', () => {
  it('归属不符返回 404，且不回显设备是否存在', async () => {
    findOwnedDeviceRow.mockResolvedValue(null);
    const reply = makeReply();

    await handlers.kickMyDevice({ state: { user: loggedIn() }, body: { id: 999 } }, reply);

    expect(reply.last().status).toBe(404);
    expect(kickDeviceEverywhereFn).not.toHaveBeenCalled();
    expect(findOwnedDeviceRow).toHaveBeenCalledWith(999, 7);
  });

  it('非法 id 返回 400', async () => {
    const reply = makeReply();
    await handlers.kickMyDevice({ state: { user: loggedIn() }, body: { id: 'abc' } }, reply);
    expect(reply.last().status).toBe(400);
  });

  it('踢的是当前设备时清 Cookie 并标记 current', async () => {
    findOwnedDeviceRow.mockResolvedValue({ id: 5, app_id: 'console', device_id: 'DEV-1' });
    const reply = makeReply();

    await handlers.kickMyDevice({ state: { user: loggedIn({ deviceId: 'DEV-1' }) }, body: { id: 5 } }, reply);

    expect(clearAuthCookiesFn).toHaveBeenCalledTimes(1);
    expect(reply.last().data).toMatchObject({ current: true });
  });

  it('设备没有设备码时提示改用「退出其他所有设备」，不发踢出', async () => {
    findOwnedDeviceRow.mockResolvedValue({ id: 6, app_id: 'console', device_id: null });
    const reply = makeReply();

    await handlers.kickMyDevice({ state: { user: loggedIn() }, body: { id: 6 } }, reply);

    expect(reply.last().kind).toBe('fail');
    expect(kickDeviceEverywhereFn).not.toHaveBeenCalled();
  });
});

describe('清理已下线记录', () => {
  it('只清会话里的 userId（忽略请求体传的 userId）', async () => {
    pruneRevokedOfUser.mockResolvedValue(3);
    const reply = makeReply();

    await handlers.pruneMyRevokedDevices({ state: { user: loggedIn() }, body: { userId: 999 } }, reply);

    expect(pruneRevokedOfUser).toHaveBeenCalledWith(7);
    expect(reply.last().data).toMatchObject({ removed: 3 });
  });
});

describe('踢其他所有会话', () => {
  it('带上当前 sessionId 以保留自己这条', async () => {
    const reply = makeReply();
    await handlers.kickAllSessions({ state: { user: loggedIn() } }, reply);
    expect(kickAllSessionsFn).toHaveBeenCalledWith(7, 'sid-current');
  });
});

describe('管理员看设备列表', () => {
  it('token 绝不出现在响应里，只用来算 is_current', async () => {
    listDeviceRows.mockResolvedValue([
      {
        id: 11,
        user_id: 7,
        app_id: 'console',
        device_id: 'DEV-2',
        ip: '127.0.0.1',
        revoked: false,
        last_active: new Date(),
        token: 'hash:sid-current' // 与 currentTokenHash('sid-current') 一致
      }
    ]);
    const reply = makeReply();

    await handlers.listUserSessions({ query: { userId: '7' }, state: { user: loggedIn() } }, reply);

    const data = reply.last().data;
    expect(data).toHaveLength(1);
    expect(data[0]).not.toHaveProperty('token');
    expect(data[0].is_current).toBe(true);
    expect(data[0]).toHaveProperty('stale');
  });

  it('userId 传 uuid 被拒绝（数字列 Number(uuid) 是 NaN，静默查空）', async () => {
    const reply = makeReply();
    await handlers.listUserSessions(
      { query: { userId: 'd102d02f-c338-4847-8cd8-71afb69b878a' }, state: { user: loggedIn() } },
      reply
    );

    expect(reply.last().kind).toBe('fail');
    expect(listDeviceRows).not.toHaveBeenCalled();
  });

  it('userId 为空被拒绝', async () => {
    const reply = makeReply();
    await handlers.listUserSessions({ query: {}, state: { user: loggedIn() } }, reply);
    expect(reply.last().kind).toBe('fail');
  });
});

describe('管理员按设备踢下线', () => {
  it('缺参数被拒绝', async () => {
    const reply = makeReply();
    await handlers.kickSessionByDevice({ body: { userId: 7 }, state: { user: loggedIn() } }, reply);
    expect(reply.last().kind).toBe('fail');
    expect(kickDeviceEverywhereFn).not.toHaveBeenCalled();
  });

  it('留痕：操作者记 userId，被踢人/应用/设备放 details', async () => {
    const reply = makeReply();
    await handlers.kickSessionByDevice(
      {
        body: { userId: 8, appId: 'console', deviceId: 'DEV-9' },
        state: { user: loggedIn() },
        headers: { 'user-agent': 'UA-test' },
        ip: '127.0.0.1'
      },
      reply
    );

    expect(kickDeviceEverywhereFn).toHaveBeenCalledWith(8, 'console', 'DEV-9');
    const event = logAuditEventFn.mock.calls[0][0];
    expect(event).toMatchObject({
      type: 'SESSION_KICK_DEVICE',
      userId: 7, // 操作者
      details: { targetUserId: 8, targetAppId: 'console', deviceId: 'DEV-9', self: false }
    });
  });
});

describe('session-repo：where 到底怎么构造', () => {
  it('归属校验必须把 user_id 写进 where（否则能用 token 探测别人的会话）', async () => {
    tokenFindOne.mockResolvedValue({ id: 1 });
    await repo.findOwnedSession('sid-x', 7);

    const arg = tokenFindOne.mock.calls[0][0];
    expect(arg.where).toMatchObject({ user_id: 7, revoked: false });
    // token 必须是 sha256(sid)，与 session-store 的 sidHash 同源
    expect(arg.where.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('非法 userId 不发查询（NaN 会静默查空，等于放行一切）', async () => {
    await repo.findOwnedSession('sid-x', 0);
    await repo.findOwnedSession('sid-x', Number.NaN);
    expect(tokenFindOne).not.toHaveBeenCalled();
  });

  it('设备行必须同时按 id 和 user_id 查', async () => {
    tokenFindOne.mockResolvedValue({ id: 5, app_id: 'a', device_id: 'D' });
    await repo.findOwnedDeviceRow(5, 7);

    const arg = tokenFindOne.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 5, user_id: 7 });
    // 只取必要的三列：不把 ip / ua / token 带出来
    expect(arg.attributes).toEqual(['id', 'app_id', 'device_id']);
  });

  it('清理只删 revoked 行，且 user_id 只能来自入参', async () => {
    await repo.pruneRevokedOfUser(7);
    expect(tokenDestroy).toHaveBeenCalledWith({ where: { user_id: 7, revoked: true } });
  });

  it('自助列表不含设备指纹（那是管理员视图才要的）', async () => {
    await repo.listUserDeviceRows(7);
    const arg = tokenFindAll.mock.calls[0][0];
    expect(arg.where).toEqual({ user_id: 7 });
    expect(arg.attributes).not.toContain('device_fingerprint');
    // token 要取出来算"当前设备"，由接口层负责摘掉
    expect(arg.attributes).toContain('token');
  });

  it('管理员列表按 appId / revoked 过滤，revoked 传布尔而不是字符串', async () => {
    await repo.listDeviceRows({ userId: 7, appId: 'console', revoked: true });
    const arg = tokenFindAll.mock.calls[0][0];
    expect(arg.where).toEqual({ user_id: 7, app_id: 'console', revoked: true });
  });

  it('userId 非法时返回空集，不退化成"查全部"', async () => {
    expect(await repo.listDeviceRows({ userId: 0 })).toEqual([]);
    expect(await repo.listUserDeviceRows(0)).toEqual([]);
    expect(await repo.pruneRevokedOfUser(0)).toBe(0);
    expect(tokenFindAll).not.toHaveBeenCalled();
    expect(tokenDestroy).not.toHaveBeenCalled();
  });
});
