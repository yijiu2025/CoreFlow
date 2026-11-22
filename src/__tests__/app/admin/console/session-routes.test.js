/**
 * Console 会话接口走 DAO（handler 级）
 *
 * 为什么补这个：`session.js` 原先直接在路由里 `getModel('User')` / `getModel('Role')` /
 * `getModel('UserIdentity')` / `getModel('ConsoleUserProfile')`，四类模型的查询写在路由层，
 * 字段口径与 DAO 里那份各走各的。收敛到 DAO 之后，这里钉住三条**行为**约束：
 *
 *   1. 会话里只有 `uid`，取用户必须走 `userDao.findByUid`（而不是谁再手写 findOne）；
 *   2. 角色编码 → 菜单裁剪只认 `roleDao.findIdsByCodes`，**空角色不能退化成"查全部"**；
 *   3. 资料写入走 `profileDao.patch`，且「没传的字段不写」——
 *      `undefined` 与空串必须区分开，否则自动保存会把昵称清掉。
 *
 * 只读断言「handler 调了哪个 DAO」：这几个接口没有别的副作用可断，
 * 而本次改动要防的正是"又有人绕回 getModel"。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { beforeEach, describe, expect, jest } from '@jest/globals';

/** 收集路由 handler（按 options.name） */
const handlers = {};

jest.unstable_mockModule('../../../../api/guard.js', () => ({
  registerGroupMetadata: () => undefined,
  registerSecureRoute: (_fastify, options) => {
    handlers[options.name] = options.handler;
    return { name: options.name, fullUrl: options.url, method: options.method };
  }
}));

/** 各 DAO 桩 */
const findByUid = jest.fn();
const findPasswordIdentity = jest.fn();
const updatePasswordIdentity = jest.fn();
jest.unstable_mockModule('../../../../app/admin/console/dao/user.dao.js', () => ({
  default: { findByUid, findPasswordIdentity, updatePasswordIdentity }
}));

const findIdsByCodes = jest.fn();
jest.unstable_mockModule('../../../../app/admin/console/dao/role.dao.js', () => ({
  default: { findIdsByCodes }
}));

const deptFindById = jest.fn();
jest.unstable_mockModule('../../../../app/admin/console/dao/dept.dao.js', () => ({
  default: { findById: deptFindById }
}));

const profileFind = jest.fn();
const profilePatch = jest.fn();
jest.unstable_mockModule('../../../../app/admin/console/dao/profile.dao.js', () => ({
  default: { find: profileFind, patch: profilePatch }
}));

const menuTree = jest.fn();
const getRoleMenuIds = jest.fn();
jest.unstable_mockModule('../../../../app/admin/console/dao/menu.dao.js', () => ({
  default: { tree: menuTree, getRoleMenuIds }
}));

jest.unstable_mockModule('../../../../app/admin/console/services/button-grant.service.js', () => ({
  isSuperViewer: user => (user?.roles || []).includes('superadmin'),
  effectiveCodes: async () => []
}));

jest.unstable_mockModule('../../../../framework/security/auth/index.js', () => ({
  clearAuthCookies: jest.fn(async () => undefined),
  hashPassword: jest.fn(async () => 'hashed:new'),
  verifyPassword: jest.fn(async () => true),
  validatePasswordStrength: () => ({ valid: true, errors: [] })
}));

jest.unstable_mockModule('../../../../app/admin/console/services/avatar.service.js', () => ({
  default: { saveAvatar: jest.fn(async () => ({ url: '/console/u/1/a.png' })) }
}));

/** 进栈前收集 handler */
const { default: registerSessionRoutes } = await import('../../../../api/admin/v1/session.js');
await registerSessionRoutes({});

/**
 * 造一个最小 reply
 *
 * @returns {object} reply 桩（记录最后一次调用）
 */
function makeReply() {
  const out = { calls: [] };
  out.result = {
    success: (message, data) => {
      out.calls.push({ kind: 'success', message, data });
      return out;
    },
    forbidden: (message, data) => {
      out.calls.push({ kind: 'forbidden', message, data });
      return out;
    }
  };
  /*
   * `withFail` 会把领域错误翻译成响应而不是抛出去，所以桩必须支持 `code().send()`。
   * 断言方式也随之改变：看 status/message，而不是 `rejects.toThrow`。
   */
  let status = 200;
  out.code = value => {
    status = value;
    return out;
  };
  out.send = body => {
    out.calls.push({ kind: 'error', status, body });
    return out;
  };
  out.last = () => out.calls[out.calls.length - 1];
  return out;
}

beforeEach(() => {
  findByUid.mockReset().mockResolvedValue({ id: 7, uid: 'u-7', username: '张三' });
  findPasswordIdentity.mockReset().mockResolvedValue({ id: 3, credential: 'old-hash' });
  updatePasswordIdentity.mockReset().mockResolvedValue(true);
  findIdsByCodes.mockReset().mockResolvedValue([]);
  deptFindById.mockReset().mockResolvedValue({ id: 5, name: '研发部' });
  profileFind.mockReset().mockResolvedValue({ nickname: null, avatar: null, preferences: { accent: 'blue' } });
  profilePatch.mockReset().mockResolvedValue({ nickname: '李四', avatar: null, preferences: {} });
  menuTree.mockReset().mockResolvedValue([]);
  getRoleMenuIds.mockReset().mockResolvedValue([]);
});

describe('菜单默认拒绝：没有显式授权就没有节点', () => {
  it('只授菜单给角色真的持有的人；角色为空时不查任何菜单', async () => {
    findIdsByCodes.mockResolvedValue([]);
    menuTree.mockResolvedValue([{ id: 1, name: '工作台', visible: 1, children: [] }]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    expect(findIdsByCodes).toHaveBeenCalledWith(['admin_viewer']);
    // 角色编码一个都没匹配上 ⇒ 没有 id 去查授权 ⇒ 树被整枝剪空
    expect(getRoleMenuIds).not.toHaveBeenCalled();
    expect(reply.last().data).toEqual([]);
  });

  it('命中的角色没授权这个菜单 ⇒ 不下发（应用管理 0 授权却全员可见的回归）', async () => {
    findIdsByCodes.mockResolvedValue([11]);
    getRoleMenuIds.mockResolvedValue([2, 3]);
    menuTree.mockResolvedValue([
      {
        id: 2,
        name: '系统管理',
        type: 'dir',
        permission: null,
        visible: 1,
        children: [
          {
            id: 3,
            name: '用户列表',
            type: 'menu',
            permission: 'admin:user:read',
            visible: 1,
            path: '/system/user',
            children: []
          },
          {
            id: 54,
            name: '应用管理',
            type: 'menu',
            permission: 'admin:app:read',
            visible: 1,
            path: '/system/app',
            children: []
          }
        ]
      }
    ]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_admin'] } } }, reply);

    const names = reply.last().data[0].children.map(c => c.name);
    expect(names).toEqual(['用户列表']);
  });

  it('🔴 `admin:*` 不再是菜单豁免：只拿角色已授权的节点', async () => {
    findIdsByCodes.mockResolvedValue([11]);
    // 授「系统管理 + 用户列表」。这里必须连子页面一起授：只授目录的话，空目录会被
    // 裁掉（见下方「空目录」一组），断言就退化成"什么都没下发"，测不出本用例要守的东西。
    getRoleMenuIds.mockResolvedValue([2, 3]);
    menuTree.mockResolvedValue([
      {
        id: 2,
        name: '系统管理',
        type: 'dir',
        permission: null,
        visible: 1,
        children: [
          {
            id: 3,
            name: '用户列表',
            type: 'menu',
            permission: 'admin:user:read',
            visible: 1,
            path: '/system/user',
            children: []
          }
        ]
      },
      { id: 10, name: '日志与审计', type: 'dir', permission: null, visible: 1, children: [] }
    ]);

    const reply = makeReply();
    await handlers.adminRoutes(
      { state: { user: { roles: ['admin_admin'], permissions: { allows: ['admin:*'], denies: [] } } } },
      reply
    );

    // 只有被授权的「系统管理」出现；未授权的「日志与审计」即使是 `admin:*` 也不下发
    expect(reply.last().data.map(n => n.name)).toEqual(['系统管理']);
    expect(reply.last().data[0].children.map(c => c.name)).toEqual(['用户列表']);
  });

  it('父节点未授权时整枝丢弃（子节点授权了也没用）', async () => {
    findIdsByCodes.mockResolvedValue([9]);
    getRoleMenuIds.mockResolvedValue([2]);
    menuTree.mockResolvedValue([
      {
        id: 1,
        name: '系统管理',
        visible: 1,
        children: [
          { id: 2, name: '用户管理', visible: 1, children: [{ id: 3, name: '创建用户', visible: 1, children: [] }] }
        ]
      }
    ]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    expect(reply.last().data).toEqual([]);
  });

  it('超管直接拿整棵树，不查角色也不再裁剪', async () => {
    menuTree.mockResolvedValue([{ id: 1, name: '工作台', visible: 1, children: [] }]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['superadmin'] } } }, reply);

    expect(findIdsByCodes).not.toHaveBeenCalled();
    expect(reply.last().data).toEqual([{ id: 1, name: '工作台', visible: 1, children: [] }]);
  });

  it('持有 `*` 通配的账号同样拿整棵树（新建菜单要有唯一能授权的人）', async () => {
    menuTree.mockResolvedValue([{ id: 54, name: '应用管理', visible: 1, children: [] }]);

    const reply = makeReply();
    await handlers.adminRoutes(
      { state: { user: { roles: ['ops'], permissions: { allows: ['*'], denies: [] } } } },
      reply
    );

    expect(findIdsByCodes).not.toHaveBeenCalled();
    expect(reply.last().data).toHaveLength(1);
  });
});

describe('自助区：只有 /settings/* 免授权，其余一格都不放', () => {
  /** 造一个节点 */
  const node = (id, name, extra = {}) => ({
    id,
    name,
    type: 'menu',
    permission: null,
    visible: 1,
    children: [],
    ...extra
  });

  it('顶级目录的子项全在 /settings/ 下时整组可见（含子项）', async () => {
    findIdsByCodes.mockResolvedValue([9]);
    getRoleMenuIds.mockResolvedValue([]); // 一个页面都没授
    menuTree.mockResolvedValue([
      {
        id: 10,
        name: '个人设置',
        type: 'dir',
        permission: null,
        parent_id: 0,
        visible: 1,
        children: [
          node(11, '个人资料', { path: '/settings/profile' }),
          node(12, '通知偏好', { path: '/settings/notice' }),
          node(13, '账号与安全', { path: '/settings/center' })
        ]
      }
    ]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    // 目录与三个子项都在：只放行目录、子项又被裁掉，是"点开空一半"的典型故障
    expect(reply.last().data).toHaveLength(1);
    expect(reply.last().data[0].children.map(c => c.name)).toEqual(['个人资料', '通知偏好', '账号与安全']);
  });

  it('🔴 顶级无权限码、但路径不在 /settings/ 下的页面不下发（旧后门）', async () => {
    findIdsByCodes.mockResolvedValue([9]);
    getRoleMenuIds.mockResolvedValue([]);
    menuTree.mockResolvedValue([node(30, '应用管理', { path: '/system/app' })]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    expect(reply.last().data).toEqual([]);
  });

  it('目录里只要有一个子项不是自助页，整组按授权走（未授权则整组消失）', async () => {
    findIdsByCodes.mockResolvedValue([9]);
    getRoleMenuIds.mockResolvedValue([]);
    menuTree.mockResolvedValue([
      {
        id: 20,
        name: '系统管理',
        type: 'dir',
        permission: null,
        parent_id: 0,
        visible: 1,
        children: [
          node(21, '通知中心', { permission: 'notice:config:read', path: '/system/notice' }),
          node(22, '未写码的页面', { path: '/system/unknown' })
        ]
      }
    ]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    expect(reply.last().data).toEqual([]);
  });

  it('/settings/ 下但声明了权限码的页面按授权走（自助区不是管理页的后门）', async () => {
    findIdsByCodes.mockResolvedValue([9]);
    getRoleMenuIds.mockResolvedValue([]);
    menuTree.mockResolvedValue([
      {
        id: 40,
        name: '个人设置',
        type: 'dir',
        permission: null,
        visible: 1,
        children: [node(41, '敏感设置', { path: '/settings/danger', permission: 'admin:config:write' })]
      }
    ]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    expect(reply.last().data).toEqual([]);
  });

  it('已授权目录下的未授权子项仍然不可见（授权不会顺延给兄弟节点）', async () => {
    findIdsByCodes.mockResolvedValue([9]);
    getRoleMenuIds.mockResolvedValue([20, 21]);
    menuTree.mockResolvedValue([
      {
        id: 20,
        name: '系统管理',
        type: 'dir',
        permission: null,
        parent_id: 0,
        visible: 1,
        children: [
          node(21, '菜单管理', { permission: 'admin:menu:read', path: '/system/menu' }),
          node(22, '应用管理', { permission: 'admin:app:read', path: '/system/app' })
        ]
      }
    ]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    expect(reply.last().data[0].children.map(c => c.name)).toEqual(['菜单管理']);
  });
});

describe('空目录：只授了目录没授子项时整组不下发', () => {
  /*
   * 现场还原（2026-11-22，真库）：`admin_operator` 的授权里有"系统管理"这个目录，
   * 16 条授权却一条子页面都没有 —— 侧栏因此出现一个点开后空白的"系统管理"。
   * 目录本身没有路由，空着只能是渲染噪音；裁掉它比让人怀疑"是不是加载失败"好。
   */
  const page = (id, name, extra = {}) => ({
    id,
    name,
    type: 'menu',
    permission: null,
    visible: 1,
    children: [],
    ...extra
  });

  const dir = (id, name, children) => ({
    id,
    name,
    type: 'dir',
    permission: null,
    parent_id: 0,
    visible: 1,
    children
  });

  it('目录在授权里、子页面一个都没授权 ⇒ 整组消失', async () => {
    findIdsByCodes.mockResolvedValue([9]);
    getRoleMenuIds.mockResolvedValue([40]); // 只授了目录 40
    menuTree.mockResolvedValue([
      dir(40, '系统管理', [
        page(41, '菜单管理', { permission: 'admin:menu:read', path: '/system/menu' }),
        page(42, '防火墙监控', { permission: 'admin:fw:read', path: '/system/firewall' })
      ])
    ]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_operator'] } } }, reply);

    expect(reply.last().data).toEqual([]);
  });

  it('目录与其中一个子页面都授权 ⇒ 目录保留，另一个子页面仍不可见', async () => {
    findIdsByCodes.mockResolvedValue([9]);
    getRoleMenuIds.mockResolvedValue([40, 41]);
    menuTree.mockResolvedValue([
      dir(40, '系统管理', [
        page(41, '菜单管理', { permission: 'admin:menu:read', path: '/system/menu' }),
        page(42, '防火墙监控', { permission: 'admin:fw:read', path: '/system/firewall' })
      ])
    ]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_operator'] } } }, reply);

    expect(reply.last().data.map(n => n.name)).toEqual(['系统管理']);
    expect(reply.last().data[0].children.map(c => c.name)).toEqual(['菜单管理']);
  });

  it('自助区目录不受影响（它的子项本来就免授权）', async () => {
    findIdsByCodes.mockResolvedValue([9]);
    getRoleMenuIds.mockResolvedValue([]);
    menuTree.mockResolvedValue([dir(50, '个人设置', [page(51, '个人资料', { path: '/settings/profile' })])]);

    const reply = makeReply();
    await handlers.adminRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    expect(reply.last().data.map(n => n.name)).toEqual(['个人设置']);
  });
});

describe('修改本人密码', () => {
  it('读凭证 + 写新哈希都走 DAO', async () => {
    const reply = makeReply();
    await handlers.adminChangePassword(
      {
        state: { user: { userId: 7 } },
        body: { oldPassword: 'old-pass', newPassword: 'new-pass-1' }
      },
      reply
    );

    expect(findPasswordIdentity).toHaveBeenCalledWith(7);
    expect(updatePasswordIdentity).toHaveBeenCalledWith(3, 'hashed:new');
    expect(reply.last().kind).toBe('success');
  });

  it('没有密码凭证时报 NOT_FOUND，且不写库', async () => {
    findPasswordIdentity.mockResolvedValue(null);
    const reply = makeReply();

    await handlers.adminChangePassword(
      { state: { user: { userId: 7 } }, body: { oldPassword: 'a', newPassword: 'new-pass-1' } },
      reply
    );
    const last = reply.last();
    expect(last.kind).toBe('error');
    expect(last.status).toBe(404);
    expect(updatePasswordIdentity).not.toHaveBeenCalled();
  });
});

describe('保存后台个人资料', () => {
  it('只写传上来的字段（undefined 不覆盖）', async () => {
    profilePatch.mockResolvedValue({ nickname: '李四', avatar: '/a.png' });
    const reply = makeReply();

    await handlers.adminSaveProfile({ state: { user: { uid: 'u-7' } }, body: { nickname: '李四' } }, reply);

    expect(findByUid).toHaveBeenCalledWith('u-7', ['id']);
    // 关键：avatar 没传就不能出现在写入字段里，否则会把已有头像清掉
    expect(profilePatch).toHaveBeenCalledWith(7, { nickname: '李四' });
  });

  it('空串 = 清除该字段（写成 null）', async () => {
    const reply = makeReply();
    await handlers.adminSaveProfile({ state: { user: { uid: 'u-7' } }, body: { nickname: '' } }, reply);
    expect(profilePatch).toHaveBeenCalledWith(7, { nickname: null });
  });
});

describe('保存界面偏好', () => {
  it('与已有偏好合并（不覆盖未提交的键），并整份写回', async () => {
    profileFind.mockResolvedValue({ preferences: { accent: 'blue', mode: 'dark' } });
    const reply = makeReply();

    await handlers.adminSavePreferences({ state: { user: { uid: 'u-7' } }, body: { accent: 'teal' } }, reply);

    expect(profilePatch).toHaveBeenCalledWith(7, {
      preferences: expect.objectContaining({ accent: 'teal', mode: 'dark' })
    });
    expect(reply.last().data).toMatchObject({ accent: 'teal', mode: 'dark' });
  });
});
