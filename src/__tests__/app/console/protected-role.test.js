/**
 * 「受保护角色」判据（`app/console/dao/role.dao.js`）
 *
 * 这一个判据同时决定四件事：
 * 1. 列表里**要不要出现「删除」按钮**；
 * 2. 编辑弹窗里**权限码能不能勾**（内置角色只读）；
 * 3. 列表上**要不要打「内置」标签**；
 * 4. 后端删角色 / 改权限码时**放不放行**。
 *
 * 🔴 这里曾经有过两套判据：路由层（`api/admin/console/v1/roles.js`）自己拼了一份
 *    `BUILTIN_CODES = registry ∪ {superadmin}`，而列表返回给前端的 `builtin` 只按
 *    `roleRegistry` 算（**没有** superadmin）。后果是界面在骗人：超管那一行显示
 *    「删除」按钮、点进编辑还能勾权限码，真按下去才被后端以 `BUILTIN_PROTECTED` 拒。
 *
 * 🔴 `superadmin` 必须单独补进判据：它由 `scripts/setup-superadmin.js` 直接落库，
 *    不在 `roleRegistry` 里；`iam_role` 表也**没有** builtin 列（这是刻意的 ——
 *    靠代码声明而不是靠数据，否则改一行库就能让系统角色变成可删）。
 *
 * 只用纯函数，不查库。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { isProtectedRoleCode, protectedRoleCodes } from '../../../app/console/dao/role.dao.js';
import { roleRegistry } from '../../../framework/security/pbac/index.js';

/*
 * 触发静态声明。
 *
 * `defineRoles` 是在**模块被 import 时**执行的（没有显式 init），所以不在这里加载，
 * `roleRegistry` 就是空集 —— 那样本测试会「全绿但什么都没测」。
 * 只需加载两个 app 即可覆盖三类样本：admin 角色、user 内置角色、超管。
 */
import '../../../app/admin/permission/roles.js';
import '../../../app/user/permission/roles.js';

describe('受保护角色判据', () => {
  test('超管一定受保护', () => {
    expect(isProtectedRoleCode('superadmin')).toBe(true);
    expect(protectedRoleCodes().has('superadmin')).toBe(true);
  });

  test('代码声明的角色也受保护（不能被"修超管"顺手改坏）', () => {
    expect(roleRegistry.length).toBeGreaterThan(0);
    for (const role of roleRegistry) {
      expect(isProtectedRoleCode(role.code)).toBe(true);
    }
  });

  test('集合规模 = 声明角色数 + 超管 1 个', () => {
    /*
     * 这条是防「又长出第二套判据」的哨兵：
     * 谁要是再写一份只按 registry 算的集合，规模就会对不上。
     */
    expect(protectedRoleCodes().size).toBe(roleRegistry.length + 1);
  });

  test('未声明的码不算受保护', () => {
    expect(isProtectedRoleCode('my_custom_role')).toBe(false);
    expect(isProtectedRoleCode('')).toBe(false);
    expect(isProtectedRoleCode(null)).toBe(false);
    expect(isProtectedRoleCode(undefined)).toBe(false);
  });
});
