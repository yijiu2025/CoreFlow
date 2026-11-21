/**
 * 应用总览服务（应用管理页的数据装配）
 *
 * 三条容易写错的性质：
 *   ① 角色/菜单/权限码按**权限命名空间**统计，不是按 appId（console → admin）；
 *   ② 访问策略归一：没声明 / 两个数组都空 ⇒ null（前端显示"不限"）；声明了就三项俱在；
 *   ③ OAuth 客户端按 client_id 是否等于 appId 判有/无，而不是数行数。
 *
 * 不连库：DAO 用 `unstable_mockModule` 替换（路径必须钉到具体文件 —— mock 门面不生效）。
 * 被测的是真实 service，不手抄逻辑。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { describe, it, expect, beforeAll, jest } from '@jest/globals';

const roleCounts = new Map([
  ['admin', 3],
  ['posecraft', 2]
]);
const menuCounts = new Map([['admin', 35]]);
const clientIds = new Set(['posecraft']);

jest.unstable_mockModule('../../../app/console/dao/app-overview.dao.js', () => ({
  default: {
    roleCounts: async () => roleCounts,
    menuCounts: async () => menuCounts,
    oauthClientIds: async () => clientIds
  }
}));

let mod;
let registerAppConfig;
let actionMetaRegistry;

beforeAll(async () => {
  mod = await import('../../../app/console/services/app-overview.service.js');
  ({ registerAppConfig } = await import('../../../framework/config/app-registry.js'));
  ({ actionMetaRegistry } = await import('../../../framework/security/pbac/index.js'));

  /* 两个应用：console 的权限命名空间是 admin（映射关系是本页最容易踩的坑） */
  registerAppConfig({
    app_id: 'console',
    name: '管理后台',
    description: '控制台',
    permission_app_id: 'admin',
    default_role: 'admin_viewer',
    access: { anyPermission: ['admin:*'], anyRole: [], denyMessage: '无权限' },
    hosts: ['console.example.com']
  });
  registerAppConfig({
    app_id: 'posecraft',
    name: 'PoseCraft',
    description: '',
    default_role: '',
    access: { anyPermission: [], anyRole: [] }
  });
  /* 权限码数量来自各应用注册的元数据；这里塞一条替身，验证聚合口径 */
  actionMetaRegistry.push({ domain: 'posecraft', actions: [{ code: 'a' }, { code: 'b' }] });

  /*
   * `admin` 只作为 console 的权限命名空间存在（与线上一致）：它有自己的 config，
   * 但没有 OAuth 客户端、不承载登录。清单里不该单独成行。
   */
  registerAppConfig({ app_id: 'admin', name: '管理后台', description: 'IAM 权限管理' });
});

describe('normalizeAccess', () => {
  it('未声明 / 两个数组都空 ⇒ null（= 不限制）', () => {
    expect(mod.normalizeAccess(undefined)).toBeNull();
    expect(mod.normalizeAccess(null)).toBeNull();
    expect(mod.normalizeAccess({ anyPermission: [], anyRole: [] })).toBeNull();
  });

  it('声明了就三项俱在（缺的补空，避免前端出现 undefined 分支）', () => {
    expect(mod.normalizeAccess({ anyRole: ['superadmin'] })).toEqual({
      anyPermission: [],
      anyRole: ['superadmin'],
      denyMessage: ''
    });
  });
});

describe('listAppsOverview', () => {
  it('只作为命名空间的应用不单独成行（否则会出现两行同名、同一组数字）', async () => {
    const apps = await mod.listAppsOverview();
    expect(apps.some(a => a.appId === 'admin')).toBe(false);
    expect(apps.some(a => a.appId === 'console')).toBe(true);
  });

  it('统计按权限命名空间归并：console 显示的是 admin 的角色/菜单数', async () => {
    const apps = await mod.listAppsOverview();
    const consoleApp = apps.find(a => a.appId === 'console');
    expect(consoleApp.permissionAppId).toBe('admin');
    expect(consoleApp.counts.roles).toBe(3);
    expect(consoleApp.counts.menus).toBe(35);
    /* console 自己没注册 OAuth 客户端 */
    expect(consoleApp.counts.oauthClients).toBe(0);
  });

  it('OAuth 客户端按 client_id 判定，权限码数按 domain 聚合', async () => {
    const apps = await mod.listAppsOverview();
    const posecraft = apps.find(a => a.appId === 'posecraft');
    expect(posecraft.counts.oauthClients).toBe(1);
    expect(posecraft.counts.permissionCodes).toBeGreaterThanOrEqual(2);
  });

  it('按 appId 升序，保证刷新时行序稳定', async () => {
    const apps = await mod.listAppsOverview();
    const ids = apps.map(a => a.appId);
    expect(ids).toEqual([...ids].sort());
  });

  it('hosts / defaultRole 缺失时给空值而不是 undefined', async () => {
    const apps = await mod.listAppsOverview();
    const posecraft = apps.find(a => a.appId === 'posecraft');
    expect(posecraft.hosts).toEqual([]);
    expect(posecraft.defaultRole).toBe('');
    expect(posecraft.access).toBeNull();
  });
});
