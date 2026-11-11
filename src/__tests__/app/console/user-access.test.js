/**
 * 权限码模块折叠（`groupPermissions`）
 *
 * 折叠是展示层的事，但模块中文名来自**权限元数据**（`definePermissionMeta` 注册的
 * `admin:user:*` = "用户管理通配"），所以判据要钉在这里：新增权限码时，弹窗里应当
 * 自动出现模块名，而不是把 `admin:user:read` 裸着摊开。
 *
 * 单测直接 import `app/admin/permission/index.js` 触发元数据注册 —— 这是真实注册
 * 路径（与启动期同一份文件），不是手写的假元数据。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import '../../../app/admin/permission/index.js';
import { groupPermissions } from '../../../app/console/services/user-access.service.js';

describe('groupPermissions —— 权限码按模块折叠', () => {
  test('三段码按前两段折叠，模块名取通配码元数据（"用户管理通配" → "用户管理"）', () => {
    const groups = groupPermissions(['admin:user:read', 'admin:user:create', 'admin:user:*']);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('admin:user');
    expect(groups[0].label).toBe('用户管理');
    expect(groups[0].codes.map(item => item.code)).toEqual(['admin:user:read', 'admin:user:create', 'admin:user:*']);
  });

  test('模块内权限码带中文名（来自元数据），前端不必再猜', () => {
    const [group] = groupPermissions(['admin:user:read']);
    expect(group.codes[0].label).toBe('查看用户');
    expect(group.domainName).toBe('管理后台');
  });

  test('通配 `*` 单独成组且排最前（它压过一切其它权限）', () => {
    const groups = groupPermissions(['admin:user:read', '*']);
    expect(groups[0].key).toBe('*');
    expect(groups[0].label).toBe('全部权限');
    expect(groups.map(group => group.key)).toContain('admin:user');
  });

  test('两段码按首段折叠，未知码不丢（退回自身作为模块名）', () => {
    const groups = groupPermissions(['x:y:z', 'plain']);
    const keys = groups.map(group => group.key);
    expect(keys).toContain('x:y');
    expect(keys).toContain('plain');
  });

  test('同一模块的不同动作归到一组，不跨模块混', () => {
    const groups = groupPermissions(['admin:user:read', 'admin:role:read', 'admin:user:update']);
    const byKey = new Map(groups.map(group => [group.key, group.codes.length]));
    expect(byKey.get('admin:user')).toBe(2);
    expect(byKey.get('admin:role')).toBe(1);
  });
});
