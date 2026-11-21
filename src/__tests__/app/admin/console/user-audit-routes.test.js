/**
 * 用户管理写接口 → 审计留痕（handler 级端到端）
 *
 * 与 `user-audit.test.js` 的分工：
 *   · 那个测的是审计服务本身的载荷正确性；
 *   · 这个测的是"按钮真的会记" —— 直接驱动 `users.js` 里注册的真实 handler，
 *     DAO / 权限判定打桩，一路跑到 `logAuditEvent`，断言落库参数。
 *
 * 之所以不只测 service：漏记的根因就在"handler 里根本没调用"，只测 service
 * 会让这类回归全部通过（本次「冻结/解冻无日志」正是这样漏掉的）。
 *
 * @author yijiu2025
 * @since 2026-11-17
 */
import { describe, expect, jest, beforeEach } from '@jest/globals';

/** 收集审计写入 */
const auditCalls = [];
/** 收集路由 handler（按 options.name） */
const handlers = {};

jest.unstable_mockModule('../../../../api/guard.js', () => ({
  registerGroupMetadata: () => undefined,
  registerSecureRoute: (_fastify, options) => {
    handlers[options.name] = options.handler;
    return { name: options.name, fullUrl: options.url, method: options.method };
  }
}));

/** 用户 DAO 桩 */
const updateStatus = jest.fn();
const daoCreate = jest.fn();
const daoUpdate = jest.fn();
const page = jest.fn();
jest.unstable_mockModule('../../../../app/admin/console/dao/user.dao.js', () => ({
  default: {
    updateStatus,
    create: daoCreate,
    update: daoUpdate,
    page,
    options: jest.fn(),
    isEmailTaken: jest.fn(),
    // 业务层已改为走 DAO 取快照（findBrief），这里转发到同一个桩
    findBrief: (...args) => userFindByPk(...args)
  }
}));
jest.unstable_mockModule('../../../../app/admin/console/dao/role.dao.js', () => ({
  default: {
    hasAdminCapability: jest.fn(async () => true),
    /*
     * 名字解析已从业务层收进 role.dao.findNames（原先 users.js 与 user-audit
     * 各写一份）。桩转发到同一个 roleFindAll，断言的仍是"取了哪些角色、名字对不对"。
     */
    findNames: async ids => {
      const rows = await roleFindAll();
      const nameOf = new Map(rows.map(row => [Number(row.id), row.name]));
      return ids.map(id => nameOf.get(Number(id)) || `#${id}`);
    },
    listBrief: () => roleFindAll()
  }
}));
jest.unstable_mockModule('../../../../app/admin/console/dao/grant.dao.js', () => ({ default: {} }));

/** 权限作用域桩：默认「超管，什么都管得了」 */
jest.unstable_mockModule('../../../../app/admin/console/services/access-scope.service.js', () => ({
  appLabel: id => id,
  canWriteApp: () => true,
  loadRoles: async ids => new Map(ids.map(id => [id, { id, name: `角色${id}`, appId: 'GLOBAL', rank: 1 }])),
  getActorScope: async () => ({ roleIds: [], apps: new Set(), maxRank: 999, isSuper: true, crossApp: true }),
  getTargetScope: async () => ({ roleIds: [], apps: new Set(), maxRank: 1, isSuper: false, crossApp: false }),
  assertCanManageUser: () => undefined,
  // 窄 mock 会炸链接期：users.js 新增了 assertCanSetRank 的导入，这里必须给全
  assertCanSetRank: () => undefined,
  assertGrantable: async () => undefined,
  planRoleChange: async ({ submittedRoleIds }) => ({ finalRoleIds: [...submittedRoleIds], outside: [] })
}));
jest.unstable_mockModule('../../../../app/admin/console/services/user-access.service.js', () => ({
  describeCurrentAccess: async () => ({})
}));
jest.unstable_mockModule('../../../../app/admin/console/services/user-profile.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../../app/admin/console/services/data-scope.service.js', () => ({
  resolveDataScope: async () => ({}),
  assertDeptWritable: () => undefined,
  logScopeSql: () => ''
}));
jest.unstable_mockModule('../../../../app/admin/console/services/import-roles.service.js', () => ({
  buildRoleLookup: async () => new Map(),
  resolveImportRoles: async () => [],
  importFingerprint: () => 'fp'
}));
jest.unstable_mockModule('../../../../app/admin/console/services/user-danger.service.js', () => ({
  default: {
    pendingByUsers: async () => new Map(),
    listDeletion: async () => ({ requests: [], pendingKicks: [] }),
    listPendingKicks: async () => [],
    stepUpFactors: async () => ({}),
    createStepUpChallenge: async () => ({})
  }
}));
jest.unstable_mockModule('../../../../app/admin/console/services/stepup.service.js', () => ({ default: {} }));

/** 模型桩：User / Role */
const userFindByPk = jest.fn();
const roleFindAll = jest.fn();
jest.unstable_mockModule('../../../../framework/persistence/db/index.js', () => ({
  getModel: name => {
    if (name === 'User') return { findByPk: userFindByPk };
    if (name === 'Role') return { findAll: roleFindAll };
    return undefined;
  }
}));

jest.unstable_mockModule('../../../../framework/security/auth/index.js', () => ({
  logAuditEvent: async event => {
    auditCalls.push(event);
  }
}));

const { default: registerUserRoutes } = await import('../../../../api/admin/console/v1/users.js');

// 一次性把路由注册进桩里，后面各用例直接按 name 取 handler
await registerUserRoutes({});

/** 极简 reply：够 handler 用（成功 / 失败 / 下载三种出口） */
function makeReply() {
  const reply = { sent: null, statusCode: 200 };
  const chain = () => reply;
  reply.header = chain;
  reply.send = body => {
    reply.sent = body;
    return reply;
  };
  reply.code = code => {
    reply.statusCode = code;
    return reply;
  };
  reply.result = {
    success: (message, data) => {
      reply.sent = { message, data };
      return reply;
    },
    unauth: message => {
      reply.statusCode = 401;
      reply.sent = { message };
      return reply;
    },
    forbidden: message => {
      reply.statusCode = 403;
      reply.sent = { message };
      return reply;
    },
    badRequest: message => {
      reply.statusCode = 400;
      reply.sent = { message };
      return reply;
    }
  };
  return reply;
}

/** 已登录管理员的请求桩 */
function makeRequest(overrides = {}) {
  return {
    params: {},
    body: {},
    query: {},
    ip: '10.0.0.9',
    headers: { 'user-agent': 'jest-agent' },
    state: { user: { userId: 42, username: 'op' } },
    ...overrides
  };
}

/** 跑一次 handler，返回 reply */
async function call(name, request) {
  const reply = makeReply();
  await handlers[name](request, reply);
  return reply;
}

beforeEach(async () => {
  auditCalls.length = 0;
  updateStatus.mockReset().mockResolvedValue(true);
  daoCreate.mockReset();
  daoUpdate.mockReset().mockResolvedValue(true);
  page.mockReset().mockResolvedValue({ rows: [] });
  userFindByPk.mockReset();
  roleFindAll.mockReset().mockResolvedValue([]);
});

describe('冻结 / 解冻（用户报的问题）', () => {
  test('冻结账号会写一条 USER_STATUS，并带 from → to', async () => {
    userFindByPk.mockResolvedValue({ username: '张三', status: 1 });
    await call('consoleUserStatus', makeRequest({ params: { id: '7' }, body: { status: 0 } }));

    expect(updateStatus).toHaveBeenCalledWith(7, 0);
    expect(auditCalls).toHaveLength(1);
    const event = auditCalls[0];
    expect(event.type).toBe('USER_STATUS');
    expect(event.userId).toBe(42);
    expect(event.appId).toBe('console');
    expect(event.details).toMatchObject({
      targetId: 7,
      targetUsername: '张三',
      from: 1,
      to: 0,
      verb: '冻结'
    });
    expect(event.details.changes).toEqual([{ field: 'status', from: '正常', to: '冻结' }]);
  });

  test('解冻同样留痕，verb 是「启用」', async () => {
    userFindByPk.mockResolvedValue({ username: '张三', status: 0 });
    await call('consoleUserStatus', makeRequest({ params: { id: '7' }, body: { status: 1 } }));
    expect(auditCalls[0].details).toMatchObject({ verb: '启用', from: 0, to: 1 });
    expect(auditCalls[0].details.changes).toEqual([{ field: 'status', from: '冻结', to: '正常' }]);
  });

  test('状态没实际变化也留痕（点击行为本身要有记录），但 changes 为空', async () => {
    userFindByPk.mockResolvedValue({ username: '张三', status: 1 });
    await call('consoleUserStatus', makeRequest({ params: { id: '7' }, body: { status: 1 } }));
    expect(auditCalls).toHaveLength(1);
  });

  test('有待注销申请时拒绝执行，且不产生日志（未发生的操作不该留痕）', async () => {
    userFindByPk.mockResolvedValue({ username: '张三', status: 1 });
    const danger = (await import('../../../../app/admin/console/services/user-danger.service.js')).default;
    danger.listDeletion = async () => ({ requests: [{ id: 1 }], pendingKicks: [] });
    await call('consoleUserStatus', makeRequest({ params: { id: '7' }, body: { status: 0 } }));
    expect(updateStatus).not.toHaveBeenCalled();
    expect(auditCalls).toHaveLength(0);
    danger.listDeletion = async () => ({ requests: [], pendingKicks: [] });
  });
});

describe('新建用户', () => {
  test('USER_CREATE 带上目标账号与角色名', async () => {
    daoCreate.mockResolvedValue({ id: 9, uid: 'u_9', username: '新同事' });
    roleFindAll.mockResolvedValue([{ id: 3, name: '超级管理员' }]);

    await call(
      'consoleUserCreate',
      makeRequest({ body: { username: '新同事', password: 'Passw0rd!', roleIds: [3], deptId: 2 } })
    );

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      type: 'USER_CREATE',
      details: {
        targetId: 9,
        targetUsername: '新同事',
        deptId: 2,
        roleIds: [3],
        roleNames: ['超级管理员']
      }
    });
  });
});

describe('编辑用户', () => {
  test('资料字段变化写 USER_UPDATE，逐字段 from → to', async () => {
    userFindByPk.mockResolvedValue({ username: '旧名', email: 'old@x.com', dept_id: 2, status: 1 });

    await call('consoleUserUpdate', makeRequest({ params: { id: '11' }, body: { username: '新名', deptId: 5 } }));

    const update = auditCalls.find(e => e.type === 'USER_UPDATE');
    expect(update).toBeTruthy();
    expect(update.details.targetUsername).toBe('旧名');
    expect(update.details.changes).toEqual([
      { field: 'username', from: '旧名', to: '新名' },
      { field: 'deptId', from: '2', to: '5' }
    ]);
    // 没提交角色 → 不该凭空多出一条 ROLE_ASSIGNED
    expect(auditCalls.some(e => e.type === 'ROLE_ASSIGNED')).toBe(false);
  });

  test('值没变时不写 USER_UPDATE（避免每次保存刷噪音）', async () => {
    userFindByPk.mockResolvedValue({ username: '同名', email: null, dept_id: null, status: 1 });
    await call('consoleUserUpdate', makeRequest({ params: { id: '11' }, body: { username: '同名' } }));
    expect(auditCalls.filter(e => e.type === 'USER_UPDATE')).toHaveLength(0);
  });
});

describe('导出用户', () => {
  test('USER_EXPORT 记条数与生效的筛选条件', async () => {
    page.mockResolvedValue({
      rows: [
        { id: 1, username: 'a', email: 'a@x.com', status: 1 },
        { id: 2, username: 'b', email: 'b@x.com', status: 1 }
      ]
    });

    const reply = await call('consoleUserExport', makeRequest({ query: { keyword: '张', status: 1 } }));

    expect(reply.sent).toBeTruthy(); // CSV 已下发
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      type: 'USER_EXPORT',
      details: { count: 2, filters: { keyword: '张', status: 1 } }
    });
  });
});

describe('批量授权', () => {
  test('USER_BATCH_GRANT 记模式、人数与角色名', async () => {
    roleFindAll.mockResolvedValue([{ id: 8, name: '审计员' }]);
    await call('consoleUserBatchGrant', makeRequest({ body: { userIds: [3, 4], roleIds: [8], mode: 'add' } }));

    expect(daoUpdate).toHaveBeenCalledTimes(2);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      type: 'USER_BATCH_GRANT',
      details: { mode: 'add', count: 2, roleIds: [8], roleNames: ['审计员'], userIds: [3, 4] }
    });
  });
});
