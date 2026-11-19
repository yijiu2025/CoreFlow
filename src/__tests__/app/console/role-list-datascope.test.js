/**
 * 角色列表必须回填数据范围（`role.dao.page`）
 *
 * 真实故障：列表查询用了 attributes 白名单却没带 `data_scope`，于是
 * `Number(r.data_scope || 1)` 恒为 1 —— 编辑弹窗每次都显示「全部数据」，
 * 之前配的部门/应用范围也一并看不见（`dept_ids` 的开关同样依赖这个值）。
 *
 * 这条测试钉两件事：查询必须取 `data_scope`；返回值就是库里的值，不是兜底 1。
 *
 * @author yijiu2025
 * @since 2026-11-18
 */
import { describe, expect, jest, beforeEach } from '@jest/globals';

/** 各关联表的桩 */
const userRoleFindAll = jest.fn(async () => []);
const roleMenuFindAll = jest.fn(async () => []);
const roleDeptFindAll = jest.fn(async () => []);
const roleAppFindAll = jest.fn(async () => []);
/** 角色主表桩：记录 findAndCountAll 的入参 */
const findAndCountAll = jest.fn();
/** 当前"库里的角色行"，用例可替换 */
let dbRows = [];

jest.unstable_mockModule('../../../app/console/dao/grant.dao.js', () => ({ default: {} }));

// role.dao 只用到这两个（其余导出按需补，缺一个都会在链接期报错）
jest.unstable_mockModule('../../../framework/security/pbac/index.js', () => ({
  roleRegistry: [],
  actionMetaRegistry: []
}));

jest.unstable_mockModule('../../../framework/persistence/db/index.js', () => ({
  getModel: name => {
    if (name === 'Role') {
      return {
        sequelize: {
          Sequelize: { Op: { or: 'or', like: 'like' } },
          fn: (fnName, ...args) => ({ fnName, args }),
          col: colName => colName
        },
        findAndCountAll
      };
    }
    if (name === 'UserRole') return { findAll: userRoleFindAll };
    if (name === 'console.SysRoleMenu') return { findAll: roleMenuFindAll };
    if (name === 'RoleDept') return { findAll: roleDeptFindAll };
    if (name === 'RoleApp') return { findAll: roleAppFindAll };
    return undefined;
  }
}));

jest.unstable_mockModule('../../../framework/support/log/index.js', () => ({
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

const { default: roleDao } = await import('../../../app/console/dao/role.dao.js');

beforeEach(() => {
  userRoleFindAll.mockResolvedValue([]);
  roleMenuFindAll.mockResolvedValue([]);
  roleDeptFindAll.mockResolvedValue([]);
  roleAppFindAll.mockResolvedValue([]);
  findAndCountAll.mockReset();
  findAndCountAll.mockImplementation(async () => ({
    rows: dbRows.map(row => ({ get: ({ plain } = {}) => (plain ? { ...row } : row) })),
    count: dbRows.length
  }));
});

describe('查询字段', () => {
  test('attributes 必须包含 data_scope（回填的唯一来源）', async () => {
    await roleDao.page({ pageNum: 1, pageSize: 10 });
    const args = findAndCountAll.mock.calls[0][0];
    expect(args.attributes).toContain('data_scope');
  });

  test('attributes 仍保留渲染所需的其余字段（防顺手删掉）', async () => {
    await roleDao.page({ pageNum: 1, pageSize: 10 });
    const args = findAndCountAll.mock.calls[0][0];
    for (const field of ['id', 'app_id', 'code', 'name', 'rank_level', 'policy', 'created_at']) {
      expect(args.attributes).toContain(field);
    }
  });
});

describe('回填值', () => {
  test('库里是「本部门」(3) → 返回 3，不是兜底 1', async () => {
    dbRows = [
      { id: 5, app_id: 'admin', code: 'x_admin', name: 'X 管理员', rank_level: 2, data_scope: 3, policy: null }
    ];
    const { rows } = await roleDao.page({ pageNum: 1, pageSize: 10 });
    expect(rows[0].data_scope).toBe(3);
  });

  test('缺失 data_scope 时才兜底为 1（历史数据）', async () => {
    dbRows = [{ id: 6, app_id: 'admin', code: 'y_admin', name: 'Y', rank_level: 2, policy: null }];
    const { rows } = await roleDao.page({ pageNum: 1, pageSize: 10 });
    expect(rows[0].data_scope).toBe(1);
  });

  test('自定义档(2) 时回填部门集合；其它档位给空数组', async () => {
    dbRows = [
      { id: 7, app_id: 'admin', code: 'a_admin', name: 'A', rank_level: 2, data_scope: 2, policy: null },
      { id: 8, app_id: 'admin', code: 'b_admin', name: 'B', rank_level: 2, data_scope: 3, policy: null }
    ];
    roleDeptFindAll.mockResolvedValue([{ role_id: 7, dept_id: 101 }]);
    const { rows } = await roleDao.page({ pageNum: 1, pageSize: 10 });
    const a = rows.find(row => row.id === 7);
    const b = rows.find(row => row.id === 8);
    expect(a?.dept_ids).toEqual([101]);
    expect(b?.dept_ids).toEqual([]);
  });

  test('应用维度与档位无关，始终回填', async () => {
    dbRows = [{ id: 9, app_id: 'admin', code: 'c_admin', name: 'C', rank_level: 2, data_scope: 1, policy: null }];
    roleAppFindAll.mockResolvedValue([{ role_id: 9, app_id: 'posecraft' }]);
    const { rows } = await roleDao.page({ pageNum: 1, pageSize: 10 });
    expect(rows[0].app_ids).toEqual(['posecraft']);
  });
});
