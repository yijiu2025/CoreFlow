/**
 * 数据范围的「写」侧约束
 *
 * 读侧早就有 `userScopeWhere`（列表只能看自己部门），但写侧长期缺失：部门管理员
 * 可以往看不见的部门里建账号。批量导入把这件事放大到一次 500 行，所以把
 * `assertDeptWritable` 的判据钉在这里 —— 三档语义必须与 `userScopeWhere` 对齐，
 * 尤其是"不许用不填部门绕过"这一条（`dept_id IS NULL` 的账号谁都不管）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { describe, it, expect } from '@jest/globals';
import { assertDeptWritable } from '../../../app/console/services/data-scope.service.js';

const ALL = { mode: 'all', deptIds: null, actorDeptId: 5 };
const DEPTS = { mode: 'depts', deptIds: [7, 8, 9], actorDeptId: 7 };
const SELF = { mode: 'self', deptIds: null, actorDeptId: 7 };

describe('assertDeptWritable', () => {
  it('全部范围：任意部门、甚至不填部门都放行', () => {
    expect(() => assertDeptWritable(ALL, 1)).not.toThrow();
    expect(() => assertDeptWritable(ALL, null)).not.toThrow();
    expect(() => assertDeptWritable(undefined, 42)).not.toThrow(); // 缺 scope 视同不限制
  });

  it('部门范围：命中放行，越界拒绝', () => {
    expect(() => assertDeptWritable(DEPTS, 8)).not.toThrow();
    expect(() => assertDeptWritable(DEPTS, 10)).toThrow(/不在你的数据范围内/);
  });

  it('🔴 部门范围下必须指定部门（dept_id IS NULL 的账号无人可管）', () => {
    expect(() => assertDeptWritable(DEPTS, null)).toThrow(/请填写部门/);
    expect(() => assertDeptWritable(DEPTS, '')).toThrow(/请填写部门/);
    expect(() => assertDeptWritable(DEPTS, 'abc')).toThrow(/请填写部门/);
  });

  it('🔴 仅本人：直接拒绝，不管填哪个部门', () => {
    expect(() => assertDeptWritable(SELF, 7)).toThrow(/仅限本人/);
    expect(() => assertDeptWritable(SELF, null)).toThrow(/仅限本人/);
  });

  it('动作名会出现在提示里（导入 / 创建）', () => {
    expect(() => assertDeptWritable(DEPTS, 99, { action: '导入' })).toThrow(/该部门不在你的数据范围内/);
    expect(() => assertDeptWritable(SELF, 1, { action: '导入' })).toThrow(/不能导入他人账号/);
  });
});
