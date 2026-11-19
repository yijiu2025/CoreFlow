/**
 * 用户列表的职级遮蔽（`user.dao.page` 的 `actorMaxRank`）
 *
 * 真实缺口：详情接口早就拦"看不了职级比自己高的人"（`assertCanView`），
 * 列表却一条不过滤 —— 点不进去，但超管的账号 / 邮箱 / 部门在列表里一览无余。
 *
 * 两个容易写错的点，这里都钉住：
 *   1. 遮蔽要在**所有** where.id 条件之后应用（否则被后面的 IN 覆盖掉）；
 *   2. 剔除干净时要给空集 `[-1]`，不能退化成"不过滤"。
 *
 * @author yijiu2025
 * @since 2026-11-18
 */
import { describe, expect, jest, beforeEach } from '@jest/globals';

/** 用字符串当 Op 记号，断言时好认 */
const Op = { gt: 'gt', gte: 'gte', lt: 'lt', in: 'in', notIn: 'notIn', or: 'or', like: 'like' };

/** 持有高职级角色 99 的用户 */
const HIGH_RANK_USERS = [{ user_id: 7 }, { user_id: 8 }];
/** 在 appId=admin 下挂角色的用户 */
const APP_USERS = [{ user_id: 7 }, { user_id: 9 }];

const userFindAndCountAll = jest.fn();
const roleFindAll = jest.fn();
const userRoleFindAll = jest.fn();
const emptyFindAll = jest.fn(async () => []);

jest.unstable_mockModule('../../../app/console/dao/grant.dao.js', () => ({ default: {} }));

jest.unstable_mockModule('../../../framework/security/pbac/index.js', () => ({
  getDeclaredDefaultRole: () => null,
  NORMAL_RANK_MAX: 10
}));

jest.unstable_mockModule('../../../framework/security/auth/index.js', () => ({
  hashPassword: async () => 'x',
  validatePasswordStrength: () => ({ valid: true, errors: [] })
}));

jest.unstable_mockModule('../../../framework/support/log/index.js', () => ({
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

jest.unstable_mockModule('../../../framework/persistence/db/index.js', () => ({
  getModel: name => {
    if (name === 'User') {
      return {
        sequelize: { Sequelize: { Op }, fn: () => ({}), col: () => '' },
        findAndCountAll: userFindAndCountAll
      };
    }
    if (name === 'Role') return { findAll: roleFindAll };
    if (name === 'UserRole') return { findAll: userRoleFindAll };
    // SysDept / SysUserPost / SessionToken 等一律空
    return { findAll: emptyFindAll, findOne: async () => null };
  }
}));

const { default: userDao } = await import('../../../app/console/dao/user.dao.js');

/** 取最后一次 User.findAndCountAll 的 where */
function lastWhere() {
  return userFindAndCountAll.mock.calls.at(-1)[0].where;
}

beforeEach(() => {
  userFindAndCountAll.mockReset();
  userFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });

  // 角色查询分三支：高职级 / 按应用 / 超管角色
  roleFindAll.mockReset();
  roleFindAll.mockImplementation(async options => {
    const where = options?.where || {};
    if (where.rank_level) return [{ id: 99 }];
    if (where.app_id) return [{ id: 1 }];
    return [];
  });

  // 角色关联查询：99 = 高职级角色，[1] = appId 收窄出来的角色
  userRoleFindAll.mockReset();
  userRoleFindAll.mockImplementation(async options => {
    const roleId = options?.where?.role_id;
    if (roleId === 99 || (Array.isArray(roleId) && roleId.includes(99))) return HIGH_RANK_USERS;
    if (Array.isArray(roleId) && roleId.includes(1)) return APP_USERS;
    return [];
  });

  emptyFindAll.mockClear();
});

describe('传了 actorMaxRank', () => {
  test('按 rank_level > N 查「更高职级的角色」', async () => {
    await userDao.page({ pageNum: 1, pageSize: 10, actorMaxRank: 10 });
    const call = roleFindAll.mock.calls.find(entry => entry[0]?.where?.rank_level);
    expect(call).toBeTruthy();
    expect(call[0].where.rank_level[Op.gt]).toBe(10);
    expect(call[0].where.delete_version).toBe(0);
  });

  test('持有这些角色的用户被排除（无候选集时用 NOT IN）', async () => {
    await userDao.page({ pageNum: 1, pageSize: 10, actorMaxRank: 10 });
    expect(lastWhere().id).toEqual({ [Op.notIn]: [7, 8] });
  });

  test('已有 IN 候选集时在内存里剔除（两个条件叠加，不互相覆盖）', async () => {
    await userDao.page({ pageNum: 1, pageSize: 10, appId: 'admin', actorMaxRank: 10 });
    expect(lastWhere().id).toEqual({ [Op.in]: [9] });
  });

  test('候选集被剔除干净时给 [-1]，不退化成不过滤', async () => {
    userRoleFindAll.mockImplementation(async options => {
      const roleId = options?.where?.role_id;
      if (Array.isArray(roleId) && roleId.includes(1)) return [{ user_id: 7 }];
      if (roleId === 99 || (Array.isArray(roleId) && roleId.includes(99))) return [{ user_id: 7 }];
      return [];
    });
    await userDao.page({ pageNum: 1, pageSize: 10, appId: 'admin', actorMaxRank: 10 });
    expect(lastWhere().id).toEqual({ [Op.in]: [-1] });
  });

  test('没有更高职级的角色时不动 where.id', async () => {
    roleFindAll.mockImplementation(async () => []);
    await userDao.page({ pageNum: 1, pageSize: 10, actorMaxRank: 99 });
    expect(lastWhere().id).toBeUndefined();
  });
});

describe('不传 actorMaxRank（超管 / 脚本）', () => {
  test('不查高职级角色，也不排除任何人', async () => {
    await userDao.page({ pageNum: 1, pageSize: 10 });
    expect(roleFindAll.mock.calls.some(entry => entry[0]?.where?.rank_level)).toBe(false);
    expect(lastWhere().id).toBeUndefined();
  });
});
