/**
 * 菜单可见性规则（写侧校验）
 *
 * 钉住两条：
 * 1. 页面菜单没有权限码 → 拒写（否则会以"没授权所以看不见"为假象留在库里，
 *    等裁剪判据一放宽就变全员可见）；
 * 2. 自助区 `/settings/*` 是**显式白名单**，不是"没写码就放行"。
 *
 * 读侧（`/session/routes` 的默认拒绝）在
 * `src/__tests__/app/admin/console/session-routes.test.js` 里钉。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { describe, expect, test } from '@jest/globals';
import {
  SELF_SERVICE_PREFIX,
  isSelfServicePath,
  assertMenuDeclaresPermission
} from '../../../../app/admin/console/services/menu-visibility.service.js';

describe('isSelfServicePath', () => {
  test('只认 /settings/ 前缀（带斜杠，避免 /settings-evil 混进来）', () => {
    expect(isSelfServicePath('/settings/profile')).toBe(true);
    expect(isSelfServicePath('/settings/')).toBe(true);
    expect(isSelfServicePath('/settings')).toBe(false);
    expect(isSelfServicePath('/settings-evil/x')).toBe(false);
    expect(isSelfServicePath('/system/settings/x')).toBe(false);
    expect(isSelfServicePath(undefined)).toBe(false);
    expect(isSelfServicePath(null)).toBe(false);
  });

  test('前缀本身是保留命名空间，改动要同步改路由与文档', () => {
    expect(SELF_SERVICE_PREFIX).toBe('/settings/');
  });
});

describe('assertMenuDeclaresPermission', () => {
  test('🔴 页面菜单没有权限码 → 拒写', () => {
    expect(() => assertMenuDeclaresPermission({ type: 'menu', permission: null, path: '/system/app' })).toThrow(
      /必须填写权限码/
    );
  });

  test('空串与 undefined 同样拒（表单清空权限码不能蒙混过关）', () => {
    expect(() => assertMenuDeclaresPermission({ type: 'menu', permission: '', path: '/system/app' })).toThrow(
      /必须填写权限码/
    );
    expect(() => assertMenuDeclaresPermission({ type: 'menu', path: '/system/app' })).toThrow(/必须填写权限码/);
  });

  test('有权限码的页面放行', () => {
    expect(() =>
      assertMenuDeclaresPermission({ type: 'menu', permission: 'admin:app:read', path: '/system/app' })
    ).not.toThrow();
  });

  test('自助区页面可以不填码', () => {
    for (const path of ['/settings/profile', '/settings/notice', '/settings/theme', '/settings/center']) {
      expect(() => assertMenuDeclaresPermission({ type: 'menu', permission: null, path })).not.toThrow();
    }
  });

  test('目录不参与校验（容器本身不进路由）', () => {
    expect(() => assertMenuDeclaresPermission({ type: 'dir', permission: null, path: null })).not.toThrow();
  });

  test('部分更新（没带 type）不校验，避免改个排序被拦', () => {
    expect(() => assertMenuDeclaresPermission({ sort: 10 })).not.toThrow();
  });
});
