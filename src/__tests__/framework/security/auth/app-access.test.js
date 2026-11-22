/**
 * 应用准入闸门的匹配语义（`framework/security/auth/permission/app-access.js`）
 *
 * 这些用例守的是**判定方向**，不是"配置有没有写"：
 *   · 授予 `admin:user:read` 必须能通过 `admin:*` 的准入（命名空间方向）；
 *   · 授予 `admin:*` 也必须能通过（守卫同款的前缀通配方向）；
 *   · 两个方向任一缺失，表现都是"所有非超管账号进不来"或"任何人都能进"——
 *     两种都很难在生产中发现（一个表现为 403 满天飞，一个表现为静默敞开）。
 *
 * 不覆盖"调数据库读权限"的部分：那属于 `getPermissions` 的职责，已有
 * `perm-cache-contract.test.js` 守护；这里只测策略语义与注册表映射。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  permissionCovers,
  checkAppAccess,
  getAccessPolicy,
  matchesAccessPolicy
} from '../../../../framework/security/auth/permission/app-access.js';
import { registerAppConfig, resolvePermissionAppId } from '../../../../framework/config/app-registry.js';

describe('应用准入：权限模式匹配', () => {
  test('授予具体码 + 所需命名空间通配 → 命中（本模块专有的方向）', () => {
    expect(permissionCovers('admin:user:read', 'admin:*')).toBe(true);
    expect(permissionCovers('admin:role:update', 'admin:*')).toBe(true);
  });

  test('授予命名空间通配 + 所需具体码 → 命中（与路由守卫同款方向）', () => {
    expect(permissionCovers('admin:*', 'admin:user:read')).toBe(true);
  });

  test('`*` 覆盖一切', () => {
    expect(permissionCovers('*', 'admin:*')).toBe(true);
    expect(permissionCovers('fw:admin:*', '*')).toBe(true);
  });

  test('不同命名空间不互相通配（防火墙权限不能进后台）', () => {
    expect(permissionCovers('fw:admin:read', 'admin:*')).toBe(false);
    expect(permissionCovers('admin:user:read', 'fw:*')).toBe(false);
  });

  test('空值不匹配（防止策略写空串变成"人人放行"）', () => {
    expect(permissionCovers('', 'admin:*')).toBe(false);
    expect(permissionCovers('admin:user:read', '')).toBe(false);
  });
});

describe('应用准入：策略解析', () => {
  beforeEach(() => {
    // 每个用例只登记自己需要的应用，避免相互污染（注册表是模块级单例）
    registerAppConfig({ app_id: 'console', permission_app_id: 'admin' });
  });

  test('未声明 access 的应用不限制（其它应用行为不变）', async () => {
    registerAppConfig({ app_id: 'fw-test' });
    await expect(checkAppAccess('fw-test', 1)).resolves.toEqual({ allowed: true });
  });

  test('既无权限也无角色的应用：直接放行，且不触发数据库读取', async () => {
    registerAppConfig({ app_id: 'open-test', access: { anyPermission: [], anyRole: [] } });
    // 若这里去查库会因测试环境无 Redis/DB 连接而抛错，用例会失败 —— 正是要守的不变量
    await expect(checkAppAccess('open-test', 1)).resolves.toEqual({ allowed: true });
  });

  test('未登记的 appId 视为无策略（loader 未跑的单测场景）', async () => {
    await expect(checkAppAccess('never-registered', 1)).resolves.toEqual({ allowed: true });
  });

  test('声明了策略但缺 userId → 拒绝并给文案', async () => {
    registerAppConfig({
      app_id: 'gated-test',
      access: { anyPermission: ['admin:*'], denyMessage: '没有权限' }
    });
    const res = await checkAppAccess('gated-test', null);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('NO_USER');
    expect(res.message).toBe('没有权限');
  });

  test('permission_app_id 决定权限命名空间（console → admin）', () => {
    expect(resolvePermissionAppId('console')).toBe('admin');
    // 没声明的应用必须原样返回：否则 firewall / posecraft 会查到别人的角色
    expect(resolvePermissionAppId('fw-test')).toBe('fw-test');
    expect(resolvePermissionAppId('never-registered')).toBe('never-registered');
  });
});

describe('应用准入：自助区（selfService）', () => {
  /*
   * 这组用例守的是「个人设置对每个登录用户都成立，但不顺带把后台敞开」。
   * 判据是两条的**组合**：`selfService === true` 且 `authenticated`。
   * 任一条写漏都不是小问题：
   *   · 漏 `authenticated` → 匿名请求也能过闸（闸门等于没有）；
   *   · 漏 `selfService` 闭 → 配置开了也不生效，只在"没有管理角色的账号"上复现。
   */
  const policy = extra => ({ anyPermission: ['admin:*'], anyRole: ['superadmin'], denyMessage: '无权限', ...extra });

  test('默认（未声明 selfService）：没有管理能力就拒绝', () => {
    const res = matchesAccessPolicy(policy(), { codes: [], roles: [], authenticated: true });
    expect(res).toEqual({ allowed: false, reason: 'NO_CAPABILITY' });
  });

  test('selfService 开启 + 已登录：放行，且标明是靠自助区进来的', () => {
    const res = matchesAccessPolicy(policy({ selfService: true }), { codes: [], roles: [], authenticated: true });
    expect(res).toEqual({ allowed: true, reason: 'SELF_SERVICE' });
  });

  test('selfService 开启但未登录：仍然拒绝（闸门不能对匿名打开）', () => {
    const res = matchesAccessPolicy(policy({ selfService: true }), { codes: [], roles: [], authenticated: false });
    expect(res).toEqual({ allowed: false, reason: 'NO_CAPABILITY' });
  });

  test('显式拒绝压过自助区：封禁账号登录了也进不来', () => {
    const res = matchesAccessPolicy(policy({ selfService: true }), {
      codes: [],
      roles: [],
      denies: ['admin:*'],
      authenticated: true
    });
    expect(res).toEqual({ allowed: false, reason: 'DENIED_BY_POLICY' });
  });

  test('有管理能力时不给自助区理由（排查时能区分两种来路）', () => {
    const res = matchesAccessPolicy(policy({ selfService: true }), { codes: ['admin:user:read'], authenticated: true });
    expect(res).toEqual({ allowed: true });
  });

  test('`selfService` 只认严格 true：字符串 / 数字一律当关闭', () => {
    for (const bad of ['true', 1, 'yes', {}]) {
      registerAppConfig({ app_id: 'lenient-test', access: { anyPermission: ['admin:*'], selfService: bad } });
      // 若这里按真值判断，下面的判定会变成 allowed —— 配置写错一个引号就敞开后台
      expect(getAccessPolicy('lenient-test').selfService).toBe(false);
      expect(matchesAccessPolicy(getAccessPolicy('lenient-test'), { authenticated: true }).allowed).toBe(false);
    }
  });

  test('策略透出 selfService（会话接口与登录闸门读同一份）', () => {
    registerAppConfig({ app_id: 'self-test', access: { anyPermission: ['admin:*'], selfService: true } });
    const parsed = getAccessPolicy('self-test');
    expect(parsed.selfService).toBe(true);
    expect(parsed.anyPermission).toEqual(['admin:*']);
    expect(parsed.denyMessage).toBeTruthy();
  });
});
