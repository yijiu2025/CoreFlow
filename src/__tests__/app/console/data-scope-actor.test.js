/**
 * 写路径的数据范围判定（部门维度 + 应用维度）
 *
 * 背景：`data_scope` 原来只作用于读（列表 / 导出 / 日志 / 导入），写路径完全不看 ——
 * 于是"列表里看不见的人，直接调接口却改得到"。这里钉住三件事：
 *   1. `assertCanManageUser` 真的会用 `dataScope` 拦人；
 *   2. 拦的边界正确（同部门放行、跨部门拒绝、无部门 fail-closed）；
 *   3. 应用维度（`iam_role_app`）独立于部门档位生效。
 *
 * 只用纯函数 + 一个模型桩，不连库：规则本身不查库，查库只是它的输入。
 *
 * @author yijiu2025
 * @since 2026-11-18
 */
import { describe, expect, jest, beforeEach } from '@jest/globals';

/** RoleApp 模型桩 */
const roleAppFindAll = jest.fn();
jest.unstable_mockModule('../../../framework/persistence/db/index.js', () => ({
  getModel: name =>
    name === 'RoleApp'
      ? { findAll: roleAppFindAll }
      : name === 'User'
        ? { findByPk: jest.fn(async () => null) }
        : undefined
}));
jest.unstable_mockModule('../../../framework/support/log/index.js', () => ({
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

const { assertCanManageUser } = await import('../../../app/console/services/access-scope.service.js');
const { dataAppIdsOf, mergeAppScopes, DATA_SCOPE } =
  await import('../../../app/console/services/data-scope.service.js');

/**
 * 造一个用户画像（`getActorScope` / `getTargetScope` 的输出形状）
 *
 * @param {object} spec 覆盖项
 * @returns {object} 画像
 */
function person(spec = {}) {
  return {
    roleIds: [1],
    roles: new Map(),
    apps: new Set(['admin']),
    maxRank: 2,
    isSuper: false,
    crossApp: false,
    deptId: 10,
    ...spec
  };
}

/** 数据范围：本部门 10 */
const scopeDept10 = { mode: 'depts', deptIds: [10], actorDeptId: 10, appIds: null };

beforeEach(() => {
  roleAppFindAll.mockReset();
});

describe('部门维度：看得见的才管得到', () => {
  test('同部门、职级更低 → 放行', () => {
    const actor = person({ dataScope: scopeDept10 });
    const target = person({ maxRank: 1, deptId: 10 });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).not.toThrow();
  });

  test('跨部门、职级更低 → 拒绝（这是原来漏掉的那条）', () => {
    const actor = person({ dataScope: scopeDept10 });
    const target = person({ maxRank: 1, deptId: 20 });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).toThrow(/不在你的数据范围内/);
  });

  test('目标没有部门 → 拒绝（fail-closed，空部门只有超管能管）', () => {
    const actor = person({ dataScope: scopeDept10 });
    const target = person({ maxRank: 1, deptId: null });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '冻结' })).toThrow(/不在你的数据范围内/);
  });

  test('本部门及以下（deptIds 已展开子部门）→ 子部门也放行', () => {
    const actor = person({ dataScope: { mode: 'depts', deptIds: [10, 11, 12], actorDeptId: 10, appIds: null } });
    const target = person({ maxRank: 1, deptId: 11 });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).not.toThrow();
  });

  test('「全部」档不受部门限制', () => {
    const actor = person({ dataScope: { mode: 'all', deptIds: null, actorDeptId: 10, appIds: null } });
    const target = person({ maxRank: 1, deptId: 999 });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).not.toThrow();
  });

  test('「仅本人」档不能操作任何他人', () => {
    const actor = person({ dataScope: { mode: 'self', deptIds: null, actorDeptId: 10, appIds: null } });
    const target = person({ maxRank: 0, deptId: 10 });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).toThrow(/数据范围仅限本人/);
  });

  test('改自己不受数据范围影响（不拦自己）', () => {
    const actor = person({ dataScope: { mode: 'self', deptIds: null, actorDeptId: 10, appIds: null } });
    expect(() => assertCanManageUser(actor, actor, 1, 1, { action: '编辑' })).not.toThrow();
  });
});

describe('两个维度是「与」的关系，谁都不能单独放宽', () => {
  test('部门通过但应用不通过 → 拒绝', () => {
    const actor = person({
      dataScope: { mode: 'depts', deptIds: [10], actorDeptId: 10, appIds: ['posecraft'] }
    });
    const target = person({ maxRank: 1, deptId: 10, apps: new Set(['retroweb']) });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).toThrow(/不在你被授权的应用范围内/);
  });

  test('应用通过但部门不通过 → 拒绝', () => {
    const actor = person({
      dataScope: { mode: 'depts', deptIds: [10], actorDeptId: 10, appIds: ['admin'] }
    });
    const target = person({ maxRank: 1, deptId: 20, apps: new Set(['admin']) });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).toThrow(/不在你的数据范围内/);
  });

  test('两个都通过 → 放行', () => {
    const actor = person({
      dataScope: { mode: 'depts', deptIds: [10], actorDeptId: 10, appIds: ['admin'] }
    });
    const target = person({ maxRank: 1, deptId: 10, apps: new Set(['admin']) });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).not.toThrow();
  });

  test('应用范围为**空数组** = 一个应用都没授权（fail-closed）', () => {
    const actor = person({ dataScope: { mode: 'all', deptIds: null, actorDeptId: 10, appIds: [] } });
    const target = person({ maxRank: 1, deptId: 999, apps: new Set(['admin', 'retroweb']) });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).toThrow(/未授权任何应用/);
  });

  test('应用范围为 null（超管 / 表不可用）才表示不限', () => {
    const actor = person({ dataScope: { mode: 'all', deptIds: null, actorDeptId: 10, appIds: null } });
    const target = person({ maxRank: 1, deptId: 999, apps: new Set(['admin', 'retroweb']) });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).not.toThrow();
  });

  test('目标只有 GLOBAL 角色（apps 为空）且配了应用范围 → 拒绝', () => {
    const actor = person({ dataScope: { mode: 'all', deptIds: null, actorDeptId: 10, appIds: ['admin'] } });
    const target = person({ maxRank: 1, deptId: 10, apps: new Set() });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).toThrow(/应用范围/);
  });
});

describe('超管与职级闸的优先级', () => {
  test('超管不受数据范围限制（包括跨部门）', () => {
    const actor = person({
      isSuper: true,
      dataScope: { mode: 'self', deptIds: null, actorDeptId: 10, appIds: ['admin'] }
    });
    const target = person({ maxRank: 1, deptId: 999, apps: new Set(['retroweb']) });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).not.toThrow();
  });

  test('职级闸先于数据范围生效（自己的上司即便同部门也拦）', () => {
    const actor = person({ maxRank: 2, dataScope: scopeDept10 });
    const target = person({ maxRank: 3, deptId: 10 });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).toThrow(/同级或更高级/);
  });

  test('老调用方没传 dataScope 时行为不变（向后兼容）', () => {
    const actor = person({ dataScope: undefined });
    const target = person({ maxRank: 1, deptId: 999 });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).not.toThrow();
  });
});

describe('dataAppIdsOf → 应用维度解析', () => {
  test('多角色取并集并去重', async () => {
    roleAppFindAll.mockResolvedValue([
      { role_id: 1, app_id: 'admin' },
      { role_id: 2, app_id: 'posecraft' }
    ]);
    expect(await dataAppIdsOf([1, 2])).toEqual(['admin', 'posecraft']);
  });

  test('没有配置 → 空数组（fail-closed，不是"不限"）', async () => {
    roleAppFindAll.mockResolvedValue([]);
    expect(await dataAppIdsOf([1])).toEqual([]);
  });

  test('模型/表缺失时降级为 null，不锁死后台', async () => {
    roleAppFindAll.mockRejectedValue(new Error('表不存在'));
    expect(await dataAppIdsOf([1])).toBeNull();
  });

  test('空角色列表不查库', async () => {
    expect(await dataAppIdsOf([])).toBeNull();
    expect(roleAppFindAll).not.toHaveBeenCalled();
  });
});

describe('DATA_SCOPE 档位常量保持不变', () => {
  test('五档取值未被本次改动破坏', () => {
    expect(DATA_SCOPE).toEqual({ ALL: 1, CUSTOM: 2, DEPT: 3, DEPT_TREE: 4, SELF: 5 });
  });
});

describe('mergeAppScopes → 动作域与数据范围取交集', () => {
  test('一侧不限（null）→ 用另一侧', () => {
    expect(mergeAppScopes(null, ['posecraft'])).toEqual(['posecraft']);
    expect(mergeAppScopes(['admin'], null)).toEqual(['admin']);
  });

  test('两侧都限 → 取交集', () => {
    expect(mergeAppScopes(['admin', 'posecraft'], ['posecraft', 'retroweb'])).toEqual(['posecraft']);
  });

  test('交集为空 → 空数组（一条也看不到），不能退化成 null', () => {
    const merged = mergeAppScopes(['admin'], ['retroweb']);
    expect(merged).toEqual([]);
    expect(merged).not.toBeNull();
  });

  test('数据范围应用为空数组 = 一个都不授权（短路成空集）', () => {
    expect(mergeAppScopes(['admin'], [])).toEqual([]);
    expect(mergeAppScopes(null, [])).toEqual([]);
  });

  test('两侧都不限 → null', () => {
    expect(mergeAppScopes(null, null)).toBeNull();
  });
});

describe('GLOBAL 语义：只有全局角色的账号', () => {
  test('勾了 GLOBAL → 只有全局角色（apps 为空）的账号也归你管', () => {
    const actor = person({ dataScope: { mode: 'all', deptIds: null, actorDeptId: 10, appIds: ['GLOBAL'] } });
    const target = person({ maxRank: 1, deptId: 10, apps: new Set() });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).not.toThrow();
  });

  test('没勾 GLOBAL → 只有全局角色的账号仍然够不着', () => {
    const actor = person({ dataScope: { mode: 'all', deptIds: null, actorDeptId: 10, appIds: ['admin'] } });
    const target = person({ maxRank: 1, deptId: 10, apps: new Set() });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).toThrow(/应用范围/);
  });

  test('勾了 GLOBAL 也不能顺带管别家应用的账号', () => {
    const actor = person({ dataScope: { mode: 'all', deptIds: null, actorDeptId: 10, appIds: ['GLOBAL'] } });
    // 保留 admin 让「旧的应用域闸」先通过，确保拦下来的是数据范围这一层
    const target = person({ maxRank: 1, deptId: 10, apps: new Set(['admin', 'retroweb']) });
    expect(() => assertCanManageUser(actor, target, 9, 1, { action: '编辑' })).toThrow(/应用范围/);
  });
});

describe('mergeAppScopes 的 GLOBAL 追加', () => {
  test('GLOBAL 不参与和应用域取交集，永远保留', () => {
    expect(mergeAppScopes(['admin'], ['GLOBAL'])).toEqual(['GLOBAL']);
    expect(mergeAppScopes(['admin'], ['GLOBAL', 'admin'])).toEqual(['admin', 'GLOBAL']);
  });

  test('角色应用域为 null 时直接给出配置集合', () => {
    expect(mergeAppScopes(null, ['admin', 'GLOBAL'])).toEqual(['admin', 'GLOBAL']);
  });

  test('空集仍然短路（fail-closed 优先于 GLOBAL）', () => {
    expect(mergeAppScopes(['admin'], [])).toEqual([]);
  });
});
