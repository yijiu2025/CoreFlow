/**
 * 默认角色解析链与启动期审计
 *
 * 这块代码的价值全在"出错时能说出来"：默认角色一旦配错，运行时表现是
 * **静默**的（授了别的角色 / 什么都没授），不会抛错、不会 500，只会在很久以后
 * 有人问"为什么这个人有管理员"时才被发现。所以这里的测试重点不是 happy path，
 * 而是每种失效形态能不能被 `auditDefaultRoles` 指出来。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { describe, it, expect } from '@jest/globals';
import {
  NORMAL_RANK_MAX,
  defaultRoleCandidates,
  pickLowestRole,
  isNormalRank,
  auditDefaultRoles,
  registerDeclaredDefaultRole,
  resetDeclaredDefaultRolesForTesting
} from '../../../../framework/security/pbac/default-role.js';

/** 造一个角色定义（只填审计关心的字段） */
const role = (code, rank, appId = 'demo') => ({ code, app_id: appId, rank_level: rank });

/** 审计结果的便捷视图 */
const levels = issues => issues.map(issue => issue.level);
const messages = issues => issues.map(issue => issue.message).join('\n');

describe('defaultRoleCandidates', () => {
  it('config 在前、代码声明在后（config 主口径）', () => {
    expect(defaultRoleCandidates({ configDefaultRole: 'a', codeDefaultRole: 'b' })).toEqual([
      { code: 'a', source: 'config' },
      { code: 'b', source: 'role' }
    ]);
  });

  it('同一个 code 在两处声明时只保留一条', () => {
    expect(defaultRoleCandidates({ configDefaultRole: 'a', codeDefaultRole: 'a' })).toEqual([
      { code: 'a', source: 'config' }
    ]);
  });

  it('空值/空白不产生候选', () => {
    expect(defaultRoleCandidates({})).toEqual([]);
    expect(defaultRoleCandidates({ configDefaultRole: '  ', codeDefaultRole: null })).toEqual([]);
    expect(defaultRoleCandidates()).toEqual([]);
  });
});

describe('pickLowestRole / isNormalRank', () => {
  it('取职级最低者，同职级取先定义的', () => {
    expect(pickLowestRole([role('a', 50), role('b', 1), role('c', 10)])).toEqual(role('b', 1));
    expect(pickLowestRole([role('a', 10), role('b', 10)])).toEqual(role('a', 10));
    expect(pickLowestRole([])).toBeNull();
    expect(pickLowestRole(undefined)).toBeNull();
  });

  it('普通档边界是 NORMAL_RANK_MAX（含）', () => {
    expect(isNormalRank(NORMAL_RANK_MAX)).toBe(true);
    expect(isNormalRank(NORMAL_RANK_MAX + 1)).toBe(false);
    expect(isNormalRank(1)).toBe(true);
    expect(isNormalRank(undefined)).toBe(false);
  });
});

describe('auditDefaultRoles', () => {
  it('两处声明一致 → 无任何问题', () => {
    resetDeclaredDefaultRolesForTesting();
    registerDeclaredDefaultRole('demo', 'demo_user');

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'demo', default_role: 'demo_user' }],
      roleDefs: [role('demo_user', 10), role('demo_admin', 90)]
    });

    expect(issues).toEqual([]);
  });

  it('🔴 config 声明的 code 不存在 → error（否则静默回落到最低职级）', () => {
    resetDeclaredDefaultRolesForTesting();

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'demo', default_role: 'demo_usre' }], // 拼错
      roleDefs: [role('demo_user', 10)]
    });

    expect(levels(issues)).toEqual(['error']);
    expect(messages(issues)).toMatch(/没有这个 code/);
    expect(messages(issues)).toMatch(/demo_usre/);
  });

  it('🔴 config 把管理档角色当默认 → error', () => {
    resetDeclaredDefaultRolesForTesting();

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'demo', default_role: 'demo_admin' }],
      roleDefs: [role('demo_user', 10), role('demo_admin', 90)]
    });

    expect(levels(issues)).toEqual(['error']);
    expect(messages(issues)).toMatch(/超过普通档上限/);
  });

  it('两处声明不一致 → warn，并说明以 config 为准', () => {
    resetDeclaredDefaultRolesForTesting();
    registerDeclaredDefaultRole('demo', 'demo_vip');

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'demo', default_role: 'demo_user' }],
      roleDefs: [role('demo_user', 10), role('demo_vip', 30)]
    });

    expect(levels(issues)).toEqual(['warn']);
    expect(messages(issues)).toMatch(/以 config 为准/);
  });

  it('什么都没声明但最低职级是普通档 → warn（能跑，但建议显式）', () => {
    resetDeclaredDefaultRolesForTesting();

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'demo' }],
      roleDefs: [role('demo_user', 10), role('demo_admin', 90)]
    });

    expect(levels(issues)).toEqual(['warn']);
    expect(messages(issues)).toMatch(/回落为最低职级 "demo_user"/);
  });

  it('🔴 什么都没声明且最低职级超限 → error（授权时不会授予任何角色）', () => {
    resetDeclaredDefaultRolesForTesting();

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'notice' }],
      roleDefs: [role('notice_admin', 60, 'notice')]
    });

    expect(levels(issues)).toEqual(['error']);
    expect(messages(issues)).toMatch(/不会授予任何角色/);
  });

  it('config 显式 null → 有意不授予：无配置声明时不报"未声明"', () => {
    resetDeclaredDefaultRolesForTesting();

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'notice', default_role: null }],
      roleDefs: [role('notice_admin', 60, 'notice')]
    });

    expect(issues).toEqual([]);
  });

  it('config 显式 null 但代码标了 is_default → warn（标记不会生效）', () => {
    resetDeclaredDefaultRolesForTesting();
    registerDeclaredDefaultRole('notice', 'notice_admin');

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'notice', default_role: null }],
      roleDefs: [role('notice_admin', 60, 'notice')]
    });

    expect(levels(issues)).toEqual(['warn']);
    expect(messages(issues)).toMatch(/不会生效/);
  });

  it('console → admin 的命名空间映射：按 permission_app_id 也能反查到 config', () => {
    resetDeclaredDefaultRolesForTesting();
    registerDeclaredDefaultRole('admin', 'admin_viewer');

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'console', permission_app_id: 'admin', default_role: 'admin_viewer' }],
      roleDefs: [role('admin_viewer', 10, 'admin')]
    });

    // 反查失败的表现是"未声明默认角色"的 warn —— 这条断言就是在钉反查
    expect(issues).toEqual([]);
  });

  it('config 声明了 default_role，但该命名空间没有角色定义 → error', () => {
    resetDeclaredDefaultRolesForTesting();

    const issues = auditDefaultRoles({
      configs: [{ app_id: 'ghost', default_role: 'ghost_user' }],
      roleDefs: []
    });

    expect(levels(issues)).toEqual(['error']);
    expect(messages(issues)).toMatch(/没有任何角色定义/);
  });

  it('GLOBAL 域只需要代码声明（没有对应的 app config）', () => {
    resetDeclaredDefaultRolesForTesting();
    registerDeclaredDefaultRole('GLOBAL', 'user_normal');

    const issues = auditDefaultRoles({
      configs: [],
      roleDefs: [role('user_normal', 10, 'GLOBAL'), role('user_banned', 1, 'GLOBAL')]
    });

    expect(issues).toEqual([]);
  });
});
