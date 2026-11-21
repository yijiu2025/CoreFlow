/**
 * 角色菜单授权的两个不变式（`menu.dao.setRoleMenus`）
 *
 * 真实故障：管理观察者在弹窗里取消「用户管理」页面 → 保存 → 刷新又勾上，而且权限
 * 实际没收回。原因有两条，缺一条都复现不了：
 *   1. 弹窗把"角色 policy 里没有对应权限码"的按钮隐藏了，这些节点在 `sys_role_menu`
 *      里仍是授权状态，取消父节点时前端只删掉了可见的那几个 id；
 *   2. 保存时"补齐祖先"看到子节点仍被授权，就把父节点原样加了回来。
 *
 * 所以这里钉两件事：**取消要向下级联**、**只授按钮要向上补祖先**，两者顺序不能反。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { describe, expect, jest, beforeEach } from '@jest/globals';

/** 菜单树：1 系统管理 → 3 用户管理 → 22/23/42 三个按钮（42 是"隐藏"的那个） */
const MENUS = [
  { id: 1, parent_id: 0 },
  { id: 3, parent_id: 1 },
  { id: 22, parent_id: 3 },
  { id: 23, parent_id: 3 },
  { id: 42, parent_id: 3 },
  { id: 50, parent_id: 1 }
];

/** 库里当前的授权（用例可改） */
let grantedIds = [];
/** 捕获 bulkCreate 的最终集合 */
const bulkCreate = jest.fn(async rows => rows);

jest.unstable_mockModule('../../../../framework/persistence/db/index.js', () => ({
  getModel: name => {
    if (name === 'console.SysMenu') return { findAll: async () => MENUS.map(row => ({ ...row })) };
    if (name === 'console.SysRoleMenu') {
      return {
        findAll: async () => grantedIds.map(id => ({ menu_id: id })),
        destroy: async () => undefined,
        bulkCreate,
        sequelize: { transaction: async fn => fn({}) }
      };
    }
    return { findAll: async () => [] };
  }
}));

jest.unstable_mockModule('../../../../framework/support/log/index.js', () => ({
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

const { default: menuDao } = await import('../../../../app/admin/console/dao/menu.dao.js');

/** 取最后一次保存的菜单 id 集合 */
function savedIds() {
  const rows = bulkCreate.mock.calls.at(-1)[0];
  return rows.map(row => Number(row.menu_id)).sort((a, b) => a - b);
}

beforeEach(() => {
  bulkCreate.mockClear();
});

describe('取消节点要向下级联', () => {
  test('取消「用户管理」时，隐藏的子按钮一并清掉，父节点不再被补回', async () => {
    grantedIds = [1, 3, 22, 23, 42, 50];
    // 前端只删掉了可见的 3，隐藏的 22/23/42 仍在提交集合里（正是线上现场）
    await menuDao.setRoleMenus(9, [1, 22, 23, 42, 50]);
    expect(savedIds()).toEqual([1, 50]);
  });

  test('取消叶子按钮只影响它自己', async () => {
    grantedIds = [1, 3, 22, 23, 42];
    await menuDao.setRoleMenus(9, [1, 3, 22, 42]);
    expect(savedIds()).toEqual([1, 3, 22, 42]);
  });

  test('清空全部授权时结果为 0 条（不因级联逻辑复活任何节点）', async () => {
    grantedIds = [1, 3, 22];
    await menuDao.setRoleMenus(9, []);
    expect(bulkCreate).not.toHaveBeenCalled();
  });
});

describe('只授按钮要向上补祖先', () => {
  test('只提交按钮 22 → 自动补上 3 与 1', async () => {
    grantedIds = [];
    await menuDao.setRoleMenus(9, [22]);
    expect(savedIds()).toEqual([1, 3, 22]);
  });

  test('原本就有的祖先不重复添加', async () => {
    grantedIds = [];
    await menuDao.setRoleMenus(9, [1, 3, 22]);
    expect(savedIds()).toEqual([1, 3, 22]);
  });
});

describe('无变化的保存不该被级联误删', () => {
  test('原样提交全部 4 条 → 输出仍是这 4 条', async () => {
    grantedIds = [1, 3, 22, 50];
    await menuDao.setRoleMenus(9, [1, 3, 22, 50]);
    expect(savedIds()).toEqual([1, 3, 22, 50]);
  });
});
