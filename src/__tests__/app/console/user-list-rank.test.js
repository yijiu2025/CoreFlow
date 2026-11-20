/**
 * 用户列表的「可操作性标记」（`user.dao.page` 的 `actorRank`）
 *
 * 2026-11-19 起语义反转：**低职级不再看不到高职级**。看得见是管理台的常态
 * —— "搜不到人"比"看得到动不了"更让人困惑 —— 限制改到**操作**上。
 *
 * 所以这里钉住的是：
 *   1. 列表**不再**按职级过滤（不查高职级角色、不动 where.id）；
 *   2. 每行带 `manageable`，由「操作者职级 > 目标职级」决定；
 *   3. 超管（`actorRank = null`）全部可操作；
 *   4. 同职级不可操作 —— 与 `assertCanManageUser` 的 `>=` 判据同源。
 *
 * @author yijiu2025
 * @since 2026-11-18
 */
import { describe, expect, jest, beforeEach } from '@jest/globals';

/** 用字符串当 Op 记号，断言时好认 */
const Op = { gt: 'gt', gte: 'gte', lt: 'lt', in: 'in', notIn: 'notIn', or: 'or', like: 'like' };

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
    return { findAll: emptyFindAll, findOne: async () => null };
  }
}));

const { default: userDao } = await import('../../../app/console/dao/user.dao.js');

/** 取最后一次 User.findAndCountAll 的 where */
function lastWhere() {
  return userFindAndCountAll.mock.calls.at(-1)[0].where;
}

/**
 * 造一行用户（`page` 会对实例调 `get({ plain: true })`）
 *
 * @param {object} over 覆盖字段
 * @returns {object} 伪 Sequelize 实例
 */
function userRow(over = {}) {
  const plain = {
    id: 1,
    uid: 'u-1',
    username: '张三',
    email: 'a@b.c',
    avatar: null,
    status: 1,
    dept_id: null,
    rank_level: 5,
    created_at: new Date(),
    ...over
  };
  return { get: () => plain, ...plain };
}

beforeEach(() => {
  userFindAndCountAll.mockReset();
  userFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });
  roleFindAll.mockReset().mockResolvedValue([]);
  userRoleFindAll.mockReset().mockResolvedValue([]);
  emptyFindAll.mockClear();
});

describe('列表不再按职级过滤', () => {
  test('传 actorRank 也不去查「更高职级的角色」', async () => {
    await userDao.page({ pageNum: 1, pageSize: 10, actorRank: 10 });
    const askedRank = roleFindAll.mock.calls.some(entry => entry[0]?.where?.rank_level);
    expect(askedRank).toBe(false);
  });

  test('where.id 不被职级条件写入（无其它筛选项时压根没有 id 条件）', async () => {
    await userDao.page({ pageNum: 1, pageSize: 10, actorRank: 10 });
    expect(lastWhere().id).toBeUndefined();
  });

  test('高职级账号照样在结果里（只是 manageable=false）', async () => {
    userFindAndCountAll.mockResolvedValue({
      rows: [userRow({ id: 7, username: '超管', rank_level: 99 }), userRow({ id: 9, username: '同事', rank_level: 3 })],
      count: 2
    });

    const { rows } = await userDao.page({ pageNum: 1, pageSize: 10, actorRank: 10 });

    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.username)).toEqual(['超管', '同事']);
    expect(rows.find(r => r.username === '超管').manageable).toBe(false);
  });
});

describe('manageable 由「操作者职级 > 目标职级」决定', () => {
  test('低于自己的可操作，等于 / 高于自己的不可操作', async () => {
    userFindAndCountAll.mockResolvedValue({
      rows: [
        userRow({ id: 1, username: '低', rank_level: 3 }),
        userRow({ id: 2, username: '同级', rank_level: 10 }),
        userRow({ id: 3, username: '更高', rank_level: 80 })
      ],
      count: 3
    });

    const { rows } = await userDao.page({ pageNum: 1, pageSize: 10, actorRank: 10 });

    expect(rows.find(r => r.username === '低').manageable).toBe(true);
    expect(rows.find(r => r.username === '同级').manageable).toBe(false);
    expect(rows.find(r => r.username === '更高').manageable).toBe(false);
  });

  test('超管（不传 actorRank）全部可操作', async () => {
    userFindAndCountAll.mockResolvedValue({
      rows: [userRow({ id: 1, rank_level: 99 }), userRow({ id: 2, rank_level: 0 })],
      count: 2
    });

    const { rows } = await userDao.page({ pageNum: 1, pageSize: 10 });
    expect(rows.every(r => r.manageable)).toBe(true);
  });

  test('行里带上 rank_level（前端要显示职级，也要据此判断按钮态）', async () => {
    userFindAndCountAll.mockResolvedValue({ rows: [userRow({ id: 1, rank_level: 42 })], count: 1 });

    const { rows } = await userDao.page({ pageNum: 1, pageSize: 10, actorRank: 50 });
    expect(rows[0].rank_level).toBe(42);
  });

  test('自己那行恒可操作（改自己的资料不该被职级挡住）', async () => {
    userFindAndCountAll.mockResolvedValue({
      rows: [userRow({ id: 5, username: '我', rank_level: 10 }), userRow({ id: 6, username: '同级', rank_level: 10 })],
      count: 2
    });

    // 操作者自己就是 5 号、职级 10：与自己同级 → 严格大于不成立，但自己是例外
    const { rows } = await userDao.page({ pageNum: 1, pageSize: 10, actorRank: 10, operatorId: 5 });

    expect(rows.find(r => r.id === 5).manageable).toBe(true);
    expect(rows.find(r => r.id === 6).manageable).toBe(false);
  });

  test('职级缺省按 0 处理（未回填的历史行不会变成"高不可攀"）', async () => {
    userFindAndCountAll.mockResolvedValue({
      rows: [userRow({ id: 1, rank_level: undefined })],
      count: 1
    });

    const { rows } = await userDao.page({ pageNum: 1, pageSize: 10, actorRank: 1 });
    expect(rows[0].rank_level).toBe(0);
    expect(rows[0].manageable).toBe(true);
  });
});
