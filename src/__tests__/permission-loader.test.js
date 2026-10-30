/**
 * 权限加载器（测试 `framework/auth/permission-loader.js` 真身）
 *
 * ⚠️ 为什么重写：本文件的前身把 `extractPermissions` **抄进了测试**，
 * 然后断言自己抄的那一份。生产文件里的策略解析、superadmin 扩展、
 * 过期角色过滤、内联策略合并——一条都没被约束。
 *
 * 现在用内存模型替换 DB 层，断言 `loadUserPermissions()` 的真实输出与它下发的
 * 查询条件。特别锁住两件曾经出事的事：
 *   - 过期 `expire_at` 的角色必须在**查询条件**里排除（不是取回来再过滤，
 *     否则一旦有人把过滤挪到 JS 侧，权限过期就会在缓存里继续生效）；
 *   - GLOBAL superadmin 必须自动拿到 `${appId}_admin` 的策略，否则"超管进不了
 *     自己的应用后台"这种问题又会以"权限不足"的形式出现。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-30 重写为真身测试（U18）
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Op } from 'sequelize';

/** 用例可改写的内存数据与捕获的查询条件 */
const db = {
  userRoles: [],
  adminRole: null,
  inlinePolicies: [],
  userRoleQuery: null,
  inlineQuery: null,
  adminQuery: null
};

jest.unstable_mockModule('../framework/db/index.js', () => ({
  getModel: name => {
    if (name === 'UserRole') {
      return {
        findAll: async args => {
          db.userRoleQuery = args;
          return db.userRoles;
        }
      };
    }
    if (name === 'Role') {
      return {
        findOne: async args => {
          db.adminQuery = args;
          return db.adminRole;
        }
      };
    }
    if (name === 'InlinePolicy') {
      return {
        findAll: async args => {
          db.inlineQuery = args;
          return db.inlinePolicies;
        }
      };
    }
    return null;
  }
}));

const { loadUserPermissions } = await import('../framework/auth/permission-loader.js');

/** 构造一条 UserRole（含 include 的 role） */
const userRole = (code, policy) => ({ role: { code, policy } });

beforeEach(() => {
  db.userRoles = [];
  db.adminRole = null;
  db.inlinePolicies = [];
  db.userRoleQuery = null;
  db.inlineQuery = null;
  db.adminQuery = null;
});

describe('loadUserPermissions：策略合并', () => {
  it('Statement 格式与直接格式的策略都会合并进 allows/denies', async () => {
    db.userRoles = [
      userRole('editor', { Statement: [{ Effect: 'Allow', Action: ['doc:read', 'doc:write'] }] }),
      userRole('auditor', { allows: ['audit:read'], denies: ['doc:delete'] })
    ];

    const { roles, permissions } = await loadUserPermissions(1, 'app1');

    expect(roles).toEqual(['editor', 'auditor']);
    expect(permissions.allows).toEqual(['doc:read', 'doc:write', 'audit:read']);
    expect(permissions.denies).toEqual(['doc:delete']);
  });

  it('policy 是 JSON 字符串时按解析后的内容合并（DB 里常以 TEXT 存）', async () => {
    db.userRoles = [userRole('r1', JSON.stringify({ Statement: [{ Effect: 'Deny', Action: 'user:delete' }] }))];

    const { permissions } = await loadUserPermissions(1, 'app1');
    // Action 为字符串（非数组）时也要能取到
    expect(permissions.denies).toEqual(['user:delete']);
  });

  it('policy 是坏 JSON 时跳过该条，不抛错（不能让一条脏数据锁死登录）', async () => {
    db.userRoles = [userRole('broken', '{not json'), userRole('ok', { allows: ['a'] })];

    const { permissions } = await loadUserPermissions(1, 'app1');
    expect(permissions.allows).toEqual(['a']);
  });

  it('无任何角色时返回空权限集（fail-closed 的空值，而不是 undefined）', async () => {
    const result = await loadUserPermissions(1, 'app1');
    expect(result).toEqual({ roles: [], permissions: { allows: [], denies: [] } });
  });
});

describe('loadUserPermissions：查询条件（过期角色必须在 SQL 层排除）', () => {
  it('只取当前应用 + GLOBAL 的角色，且排除软删除', async () => {
    await loadUserPermissions(7, 'app1');

    const where = db.userRoleQuery.where;
    expect(where.user_id).toBe(7);
    expect(where.app_id[Op.in]).toEqual(['app1', 'GLOBAL']);
    expect(where.delete_version).toBe(0);
    // include 的 Role 同样限定应用与软删除（避免跨应用角色串权限）
    expect(db.userRoleQuery.include[0].where.app_id[Op.in]).toEqual(['app1', 'GLOBAL']);
    expect(db.userRoleQuery.include[0].required).toBe(true);
  });

  it('expire_at 过期判断下推到查询条件（null 或未来时间才算有效）', async () => {
    await loadUserPermissions(7, 'app1');

    const or = db.userRoleQuery.where[Op.or];
    expect(or).toHaveLength(2);
    expect(or[0]).toEqual({ expire_at: null });
    expect(or[1].expire_at[Op.gt]).toBeInstanceOf(Date);
    // 必须是"晚于现在"，不能是任意值（写成 lt 就会把已过期的角色放进来）
    expect(or[1].expire_at[Op.gt].getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('内联策略同样限定 当前应用 + GLOBAL 且按 user_id 过滤', async () => {
    await loadUserPermissions(7, 'app1');
    expect(db.inlineQuery.where.user_id).toBe(7);
    expect(db.inlineQuery.where.app_id[Op.in]).toEqual(['app1', 'GLOBAL']);
  });
});

describe('loadUserPermissions：GLOBAL superadmin 扩展', () => {
  it('superadmin 在业务应用里自动获得 `${appId}_admin` 角色及其策略', async () => {
    db.userRoles = [userRole('superadmin', { allows: ['platform:all'] })];
    db.adminRole = { code: 'app1_admin', policy: { allows: ['app1:manage'] } };

    const { roles, permissions } = await loadUserPermissions(1, 'app1');

    expect(roles).toEqual(['superadmin', 'app1_admin']);
    expect(permissions.allows).toEqual(['platform:all', 'app1:manage']);
    // 查的确实是本应用的 admin 角色，且排除软删除
    expect(db.adminQuery.where).toMatchObject({ code: 'app1_admin', app_id: 'app1', delete_version: 0 });
  });

  it('已经持有 `${appId}_admin` 时不重复追加，也不重复查库', async () => {
    db.userRoles = [userRole('superadmin', { allows: [] }), userRole('app1_admin', { allows: ['app1:manage'] })];

    const { roles } = await loadUserPermissions(1, 'app1');
    expect(roles).toEqual(['superadmin', 'app1_admin']);
    expect(db.adminQuery).toBeNull();
  });

  it('appId=GLOBAL 时不扩展（GLOBAL 下 superadmin 本身就是最高权限）', async () => {
    db.userRoles = [userRole('superadmin', { allows: ['*'] })];

    const { roles } = await loadUserPermissions(1, 'GLOBAL');
    expect(roles).toEqual(['superadmin']);
    expect(db.adminQuery).toBeNull();
  });

  it('应用级 admin 角色不存在时只加角色名，不抛错', async () => {
    db.userRoles = [userRole('superadmin', { allows: [] })];
    db.adminRole = null;

    const { roles, permissions } = await loadUserPermissions(1, 'app1');
    expect(roles).toEqual(['superadmin', 'app1_admin']);
    expect(permissions.allows).toEqual([]);
  });
});
