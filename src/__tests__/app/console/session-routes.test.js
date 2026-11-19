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

jest.unstable_mockModule('../../../api/guard.js', () => ({
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
jest.unstable_mockModule('../../../app/console/dao/user.dao.js', () => ({
  default: { findByUid, findPasswordIdentity, updatePasswordIdentity }
}));

const findIdsByCodes = jest.fn();
jest.unstable_mockModule('../../../app/console/dao/role.dao.js', () => ({
  default: { findIdsByCodes }
}));

const deptFindById = jest.fn();
jest.unstable_mockModule('../../../app/console/dao/dept.dao.js', () => ({
  default: { findById: deptFindById }
}));

const profileFind = jest.fn();
const profilePatch = jest.fn();
jest.unstable_mockModule('../../../app/console/dao/profile.dao.js', () => ({
  default: { find: profileFind, patch: profilePatch }
}));

const menuTree = jest.fn();
const getRoleMenuIds = jest.fn();
jest.unstable_mockModule('../../../app/console/dao/menu.dao.js', () => ({
  default: { tree: menuTree, getRoleMenuIds }
}));

jest.unstable_mockModule('../../../app/console/services/button-grant.service.js', () => ({
  isSuperViewer: user => (user?.roles || []).includes('superadmin'),
  effectiveCodes: async () => []
}));

jest.unstable_mockModule('../../../framework/security/auth/index.js', () => ({
  clearAuthCookies: jest.fn(async () => undefined),
  hashPassword: jest.fn(async () => 'hashed:new'),
  verifyPassword: jest.fn(async () => true),
  validatePasswordStrength: () => ({ valid: true, errors: [] })
}));

jest.unstable_mockModule('../../../app/console/services/avatar.service.js', () => ({
  default: { saveAvatar: jest.fn(async () => ({ url: '/console/u/1/a.png' })) }
}));

/** 进栈前收集 handler */
const { default: registerSessionRoutes } = await import('../../../api/admin/console/v1/session.js');
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

describe('角色编码 → 菜单裁剪', () => {
  it('只授菜单给角色真的持有的人；角色为空时不查任何菜单', async () => {
    findIdsByCodes.mockResolvedValue([]);
    menuTree.mockResolvedValue([{ id: 1, name: '工作台', visible: 1, children: [] }]);

    const reply = makeReply();
    await handlers.consoleRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    expect(findIdsByCodes).toHaveBeenCalledWith(['admin_viewer']);
    // 角色编码一个都没匹配上 ⇒ 没有 id 去查授权 ⇒ 树被整枝剪空
    expect(getRoleMenuIds).not.toHaveBeenCalled();
    expect(reply.last().data).toEqual([]);
  });

  it('命中角色时按授权集合裁剪，未授权的父节点整枝丢弃', async () => {
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
    await handlers.consoleRoutes({ state: { user: { roles: ['admin_viewer'] } } }, reply);

    // 1 未授权 ⇒ 整枝（含已授权的 2）都不出现
    expect(reply.last().data).toEqual([]);
  });

  it('超管直接拿整棵树，不查角色也不再裁剪', async () => {
    menuTree.mockResolvedValue([{ id: 1, name: '工作台', visible: 1, children: [] }]);

    const reply = makeReply();
    await handlers.consoleRoutes({ state: { user: { roles: ['superadmin'] } } }, reply);

    expect(findIdsByCodes).not.toHaveBeenCalled();
    expect(reply.last().data).toEqual([{ id: 1, name: '工作台', visible: 1, children: [] }]);
  });
});

describe('修改本人密码', () => {
  it('读凭证 + 写新哈希都走 DAO', async () => {
    const reply = makeReply();
    await handlers.consoleChangePassword(
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

    await handlers.consoleChangePassword(
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

    await handlers.consoleSaveProfile({ state: { user: { uid: 'u-7' } }, body: { nickname: '李四' } }, reply);

    expect(findByUid).toHaveBeenCalledWith('u-7', ['id']);
    // 关键：avatar 没传就不能出现在写入字段里，否则会把已有头像清掉
    expect(profilePatch).toHaveBeenCalledWith(7, { nickname: '李四' });
  });

  it('空串 = 清除该字段（写成 null）', async () => {
    const reply = makeReply();
    await handlers.consoleSaveProfile({ state: { user: { uid: 'u-7' } }, body: { nickname: '' } }, reply);
    expect(profilePatch).toHaveBeenCalledWith(7, { nickname: null });
  });
});

describe('保存界面偏好', () => {
  it('与已有偏好合并（不覆盖未提交的键），并整份写回', async () => {
    profileFind.mockResolvedValue({ preferences: { accent: 'blue', mode: 'dark' } });
    const reply = makeReply();

    await handlers.consoleSavePreferences({ state: { user: { uid: 'u-7' } }, body: { accent: 'teal' } }, reply);

    expect(profilePatch).toHaveBeenCalledWith(7, {
      preferences: expect.objectContaining({ accent: 'teal', mode: 'dark' })
    });
    expect(reply.last().data).toMatchObject({ accent: 'teal', mode: 'dark' });
  });
});
