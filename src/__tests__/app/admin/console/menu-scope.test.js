/**
 * 菜单的应用域判据（`app/console/services/menu-scope.service.js`）
 *
 * 判错的后果是提权：只要能在菜单管理里改别的应用的按钮节点，就能把按钮授权给
 * 自己的角色，再调那个应用的接口 —— 应用域限制形同虚设。所以逐条钉住。
 *
 * 依赖 `actionMetaRegistry` 的注册结果，所以先 import 相关应用的权限模块。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import '../../../../app/admin/permission/index.js';
import '../../../../app/firewall/permission/index.js';
import '../../../../app/posecraft/permission/index.js';
import { canConfigureApp, namespaceOf } from '../../../../app/admin/console/services/menu-scope.service.js';
import { toPermissionList } from '../../../../app/admin/console/utils/permissions.js';

/**
 * 造操作者画像（`getActorScope` 的输出形状）
 *
 * @param {object} spec 规格
 * @returns {object} 画像
 */
function actor({ isSuper = false, crossApp = false, apps = [] } = {}) {
  return { isSuper, crossApp, apps: new Set(apps), maxRank: 10, roleIds: [] };
}

/**
 * 造用户（权限集用 PBAC 的对象形态，`toPermissionList` 会归一化）
 *
 * @param {string[]} allows 允许的码
 * @returns {object} user
 */
function user(allows) {
  return { permissions: { allows, denies: [] } };
}

describe('menu-scope：应用对应的权限命名空间', () => {
  test('从注册表取前缀（firewall 的历史前缀是 fw）', () => {
    expect(namespaceOf('admin')).toBe('admin');
    expect(namespaceOf('firewall')).toBe('fw');
    expect(namespaceOf('posecraft')).toBe('posecraft');
  });

  test('未注册的应用返回空串（调用方据此拒绝）', () => {
    expect(namespaceOf('not-exists')).toBe('');
  });
});

describe('menu-scope：跨应用配置权限', () => {
  test('admin 应用只看路由上的 admin:menu:*（命名空间不再重复判）', () => {
    const a = actor({ crossApp: true, apps: ['admin'] });
    expect(canConfigureApp(user(['admin:menu:update']), a, 'admin')).toBe(true);
  });

  test('持有所选应用的码 → 可以配置', () => {
    const a = actor({ crossApp: true, apps: ['admin'] });
    expect(canConfigureApp(user(['fw:config:write']), a, 'firewall')).toBe(true);
    expect(canConfigureApp(user(['posecraft:work:read']), a, 'posecraft')).toBe(true);
  });

  test('跨应用管理员（* / admin:*）→ 可以配置任何应用', () => {
    const a = actor({ isSuper: true });
    expect(canConfigureApp(user(['*']), a, 'firewall')).toBe(true);
    const cross = actor({ crossApp: true, apps: ['admin'] });
    expect(canConfigureApp(user(['admin:*']), cross, 'firewall')).toBe(true);
  });

  test('🔴 只有管理后台菜单权限、没有该应用任何权限 → 不能配置（跨应用越权）', () => {
    const cross = actor({ crossApp: true, apps: ['admin'] });
    const viewer = user(['admin:dashboard:read', 'admin:user:read', 'admin:menu:update']);
    expect(canConfigureApp(viewer, cross, 'firewall')).toBe(false);
    expect(canConfigureApp(viewer, cross, 'posecraft')).toBe(false);
  });

  test('🔴 应用域外（连角色都不属于该应用、也不是跨应用管理员）→ 不能配置', () => {
    const fwOnly = actor({ apps: ['firewall'] });
    expect(canConfigureApp(user(['fw:*']), fwOnly, 'posecraft')).toBe(false);
    // 同一账号配自己的应用仍然可以
    expect(canConfigureApp(user(['fw:*']), fwOnly, 'firewall')).toBe(true);
  });

  test('应用未注册时即便有 admin:* 也拒绝（避免给不存在的应用建菜单）', () => {
    const cross = actor({ crossApp: true, apps: ['admin'] });
    expect(canConfigureApp(user(['admin:*']), cross, 'not-exists')).toBe(false);
  });
});

describe('menu-scope：权限集形态兼容', () => {
  test('permissions 为数组或 PBAC 对象都能判', () => {
    const cross = actor({ crossApp: true, apps: ['admin'] });
    expect(canConfigureApp({ permissions: ['fw:config:write'] }, cross, 'firewall')).toBe(true);
    expect(toPermissionList({ allows: ['fw:config:write'], denies: [] })).toContain('fw:config:write');
  });
});
