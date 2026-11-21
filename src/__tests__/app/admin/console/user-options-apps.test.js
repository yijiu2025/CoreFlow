/**
 * 用户选项接口只能回「有权限的应用」（`GET /users/options` 的 `apps`）
 *
 * 真实问题：下拉候选取的是"角色表里出现过的全部应用"，于是部门管理员的下拉里
 * 照样列出防火墙 / OAuth / PoseCraft / RetroWeb —— 选了也筛不出人（列表早被
 * 应用域压掉了），纯粹误导。
 *
 * @author yijiu2025
 * @since 2026-11-18
 * @since 2026-11-21 覆盖「已卸载应用角色被过滤」：firewall / retroweb 不再注册，
 *       角色明细与 apps 候选都不该再出现它们
 */
import { describe, expect, jest } from '@jest/globals';

const handlers = {};
const APP_LABEL = { GLOBAL: '全局', admin: '管理后台', notice: '通知中心', oauth21: 'OAuth 2.1 授权中心' };

/** 当前"已注册"的应用（与 `framework/config/app-registry` 的 listAppIds 同形） */
const REGISTERED_APP_IDS = ['admin', 'notice', 'oauth21', 'user'];

jest.unstable_mockModule('../../../../api/guard.js', () => ({
  registerGroupMetadata: () => undefined,
  registerSecureRoute: (_fastify, options) => {
    handlers[options.name] = options.handler;
    return { name: options.name, fullUrl: options.url, method: options.method };
  }
}));

/**
 * 角色表里出现过的应用：既有仍注册的，也有**已卸载**的（firewall / retroweb）
 */
const daoOptions = jest.fn(async () => ({
  roles: [
    { id: 1, app_id: 'firewall', name: '防火墙观察者', rank_level: 10 },
    { id: 2, app_id: 'admin', name: '管理后台管理员', rank_level: 80 },
    { id: 3, app_id: 'retroweb', name: 'RetroWeb 管理员', rank_level: 80 },
    { id: 4, app_id: 'notice', name: '通知管理员', rank_level: 60 },
    { id: 5, app_id: 'GLOBAL', name: '普通用户', rank_level: 1 }
  ],
  depts: [],
  posts: []
}));

jest.unstable_mockModule('../../../../app/admin/console/dao/user.dao.js', () => ({ default: { options: daoOptions } }));
jest.unstable_mockModule('../../../../app/admin/console/dao/role.dao.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../../app/admin/console/dao/grant.dao.js', () => ({ default: {} }));

// 应用注册表：真实实现由启动期 loader 填充，单测里不走 loader，必须给出白名单
jest.unstable_mockModule('../../../../framework/config/app-registry.js', () => ({
  listAppIds: () => [...REGISTERED_APP_IDS],
  listAppConfigs: () => [],
  registerAppConfig: () => undefined,
  resolvePermissionAppId: appId => appId
}));

/** 操作者：只拥有 notice 应用的角色 */
jest.unstable_mockModule('../../../../app/admin/console/services/access-scope.service.js', () => ({
  appLabel: id => APP_LABEL[id] || id,
  // 真实判据的等价实现：超管 / 跨应用 / GLOBAL 全放行，其余看应用域
  canWriteApp: (actor, appId) => {
    if (actor.isSuper || actor.crossApp) return true;
    if (!appId || appId === 'GLOBAL') return true;
    return actor.apps.has(appId);
  },
  getActorScope: async () => ({
    roleIds: [4],
    apps: new Set(['notice']),
    maxRank: 10,
    isSuper: false,
    crossApp: false
  }),
  getTargetScope: async () => ({}),
  assertCanManageUser: () => undefined,
  // 窄 mock 会炸链接期：users.js 新增了 assertCanSetRank 的导入，这里必须给全
  assertCanSetRank: () => undefined,
  assertGrantable: async () => undefined,
  planRoleChange: async () => ({ finalRoleIds: [] }),
  loadRoles: async () => new Map()
}));

jest.unstable_mockModule('../../../../app/admin/console/services/user-access.service.js', () => ({
  describeCurrentAccess: async () => ({})
}));
jest.unstable_mockModule('../../../../app/admin/console/services/user-profile.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../../app/admin/console/services/data-scope.service.js', () => ({
  resolveDataScope: async () => ({ mode: 'self', deptIds: null, actorDeptId: null, appIds: null }),
  assertDeptWritable: () => undefined,
  logScopeSql: () => '',
  mergeAppScopes: () => null
}));
jest.unstable_mockModule('../../../../app/admin/console/services/import-roles.service.js', () => ({
  buildRoleLookup: async () => new Map(),
  resolveImportRoles: async () => [],
  importFingerprint: () => 'fp'
}));
jest.unstable_mockModule('../../../../app/admin/console/services/user-danger.service.js', () => ({
  default: { pendingByUsers: async () => new Map(), listDeletion: async () => ({ requests: [] }) }
}));
jest.unstable_mockModule('../../../../app/admin/console/services/stepup.service.js', () => ({ default: {} }));

jest.unstable_mockModule('../../../../framework/persistence/db/index.js', () => ({
  getModel: () => ({ findByPk: async () => null, findAll: async () => [] })
}));
jest.unstable_mockModule('../../../../framework/security/auth/index.js', () => ({
  logAuditEvent: async () => undefined
}));

const { default: registerUserRoutes } = await import('../../../../api/admin/console/v1/users.js');
await registerUserRoutes({});

/** 极简 reply */
function makeReply() {
  const reply = { sent: null };
  reply.result = {
    success: (message, data) => {
      reply.sent = { message, data };
      return reply;
    }
  };
  reply.code = () => reply;
  reply.send = body => {
    reply.sent = body;
    return reply;
  };
  return reply;
}

describe('apps 候选只含有权限的应用', () => {
  test('只保留应用域内的应用（notice）与 GLOBAL', async () => {
    const reply = makeReply();
    await handlers.consoleUserOptions(
      { state: { user: { userId: 26 } }, ip: '10.0.0.1', headers: {}, query: {} },
      reply
    );
    const ids = reply.sent.data.apps.map(app => app.id).sort();
    expect(ids).toEqual(['GLOBAL', 'notice']);
  });

  test('够不着的应用一个都不回（admin / oauth21）', async () => {
    const reply = makeReply();
    await handlers.consoleUserOptions(
      { state: { user: { userId: 26 } }, ip: '10.0.0.1', headers: {}, query: {} },
      reply
    );
    const ids = reply.sent.data.apps.map(app => app.id);
    for (const denied of ['admin', 'oauth21']) {
      expect(ids).not.toContain(denied);
    }
  });

  test('已卸载应用的角色被过滤，仍注册的照常返回（含 manageable 标记）', async () => {
    const reply = makeReply();
    await handlers.consoleUserOptions(
      { state: { user: { userId: 26 } }, ip: '10.0.0.1', headers: {}, query: {} },
      reply
    );
    // firewall / retroweb 不在注册表里 → 只剩 admin / notice / GLOBAL 三条
    expect(reply.sent.data.roles).toHaveLength(3);
    expect(reply.sent.data.roles.map(role => role.app_id).sort()).toEqual(['GLOBAL', 'admin', 'notice']);

    const adminRole = reply.sent.data.roles.find(role => role.app_id === 'admin');
    expect(adminRole.manageable).toBe(false);
  });
});
