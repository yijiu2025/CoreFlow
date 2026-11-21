/**
 * 菜单的应用域判据（`app/admin/console/services/menu-scope.service.js`）
 *
 * 判错的后果是提权：只要能在菜单管理里改别的应用的按钮节点，就能把按钮授权给
 * 自己的角色，再调那个应用的接口 —— 应用域限制形同虚设。所以逐条钉住。
 *
 * 依赖 `actionMetaRegistry` 的注册结果，所以先 import 相关应用的权限模块。
 *
 * 2026-11-21：`firewall` / `posecraft` 等第三方应用已移出本仓，用例改用仍在仓内的
 * 三个应用（admin / notice / oauth21）验证同一组语义：
 *   · 命名空间从注册表现取（oauth21 的前缀是 `oauth`，不是目录名）；
 *   · 跨应用管理员可以配置任意已注册应用；
 *   · 只有 A 应用权限的账号不能配置 B 应用。
 *
 * @author yijiu2025
 * @since 2026-11-14
 * @since 2026-11-21 取样应用改为 admin / notice / oauth21（第三方应用移出）
 */
import '../../../../app/admin/permission/index.js';
import '../../../../app/notice/permission/index.js';
import '../../../../app/oauth21/permission/index.js';
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
  test('从注册表取前缀（oauth21 的历史前缀是 oauth）', () => {
    expect(namespaceOf('admin')).toBe('admin');
    expect(namespaceOf('oauth21')).toBe('oauth');
    expect(namespaceOf('notice')).toBe('notice');
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
    expect(canConfigureApp(user(['notice:config:write']), a, 'notice')).toBe(true);
    expect(canConfigureApp(user(['oauth:client:read']), a, 'oauth21')).toBe(true);
  });

  test('跨应用管理员（* / admin:*）→ 可以配置任何应用', () => {
    const a = actor({ isSuper: true });
    expect(canConfigureApp(user(['*']), a, 'notice')).toBe(true);
    const cross = actor({ crossApp: true, apps: ['admin'] });
    expect(canConfigureApp(user(['admin:*']), cross, 'notice')).toBe(true);
  });

  test('🔴 只有管理后台菜单权限、没有该应用任何权限 → 不能配置（跨应用越权）', () => {
    const cross = actor({ crossApp: true, apps: ['admin'] });
    const viewer = user(['admin:dashboard:read', 'admin:user:read', 'admin:menu:update']);
    expect(canConfigureApp(viewer, cross, 'notice')).toBe(false);
    expect(canConfigureApp(viewer, cross, 'oauth21')).toBe(false);
  });

  test('🔴 应用域外（连角色都不属于该应用、也不是跨应用管理员）→ 不能配置', () => {
    const noticeOnly = actor({ apps: ['notice'] });
    expect(canConfigureApp(user(['notice:*']), noticeOnly, 'admin')).toBe(false);
    // 同一账号配自己的应用仍然可以
    expect(canConfigureApp(user(['notice:*']), noticeOnly, 'notice')).toBe(true);
  });

  test('应用未注册时即便有 admin:* 也拒绝（避免给不存在的应用建菜单）', () => {
    const cross = actor({ crossApp: true, apps: ['admin'] });
    expect(canConfigureApp(user(['admin:*']), cross, 'not-exists')).toBe(false);
  });
});

describe('menu-scope：权限集形态兼容', () => {
  test('permissions 为数组或 PBAC 对象都能判', () => {
    const cross = actor({ crossApp: true, apps: ['admin'] });
    expect(canConfigureApp({ permissions: ['notice:config:write'] }, cross, 'notice')).toBe(true);
    expect(toPermissionList({ allows: ['notice:config:write'], denies: [] })).toContain('notice:config:write');
  });
});
