/**
 * 权限系统（测试真实实现：StpUtil + IamDao 等级压制）
 *
 * ⚠️ 为什么重写：本文件的前身把「角色层次」「超管继承」「权限合并」「通配符匹配」
 * 全部**手写了一遍**再断言自己，生产代码里 `StpUtil._isMatch` / `hasPermission`
 * 的 deny 优先、`IamDao` 的 rank_level 压制一条都没被约束。
 * 最典型的是"通配符匹配"：测试自己实现的 `endsWith(':*')` 与生产用的正则
 * `^user:.*:read$` 根本不是同一套语义（一个只认尾部通配，一个中间也认）。
 *
 * 现在直接对真身断言：
 *   1. `StpUtil`：通配符、Deny 优先、AND/OR 组合、角色校验、未登录语义；
 *   2. `IamDao`：`rank_level` 取最高职级（按 role 排序，不是按 role_id）、
 *      以及"不能委派 ≥ 自己等级的角色 / 不能管理 ≥ 自己等级的用户"这两条提权护栏。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-30 重写为真身测试（U18）
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Op } from 'sequelize';

import { requestContext } from '../framework/auth/request-context.js';
import StpUtil from '../framework/auth/stp-util.js';

/** 在"请求上下文"里跑断言：StpUtil 通过 ALS 取 request */
const withUser = (user, fn) => requestContext.run({ state: { user } }, fn);

describe('StpUtil：通配符与 Deny 优先', () => {
  it('精确匹配；不含 * 的模式不匹配其它值', () => {
    expect(StpUtil._isMatch('fw:config:read', 'fw:config:read')).toBe(true);
    expect(StpUtil._isMatch('fw:config:read', 'fw:config:write')).toBe(false);
  });

  it('尾部通配符覆盖同前缀', () => {
    expect(StpUtil._isMatch('fw:config:*', 'fw:config:read')).toBe(true);
    expect(StpUtil._isMatch('fw:config:*', 'fw:block:read')).toBe(false);
  });

  it('中间通配符也生效（生产用正则，不是简单的 endsWith）', () => {
    expect(StpUtil._isMatch('user:*:read', 'user:42:read')).toBe(true);
    expect(StpUtil._isMatch('user:*:read', 'user:42:write')).toBe(false);
  });

  it('全局 * 匹配任意权限', () => {
    expect(StpUtil._isMatch('*', 'anything:here')).toBe(true);
  });

  it('Deny 优先：deny 通配命中时即使 allow 精确命中也不放行', () => {
    withUser({ permissions: { allows: ['fw:config:read'], denies: ['fw:config:*'] } }, () => {
      expect(StpUtil.hasPermission('fw:config:read')).toBe(false);
    });
  });

  it('allow 通配命中即放行；都不命中则拒绝', () => {
    withUser({ permissions: { allows: ['fw:*'], denies: [] } }, () => {
      expect(StpUtil.hasPermission('fw:block:read')).toBe(true);
      expect(StpUtil.hasPermission('user:read')).toBe(false);
    });
  });

  it('权限集缺失时按空集处理（fail-closed，不是"没配置就放行"）', () => {
    withUser({}, () => {
      expect(StpUtil.hasPermission('user:read')).toBe(false);
    });
  });
});

describe('StpUtil：校验方法的异常契约', () => {
  it('checkPermission 不足时抛 NotPermissionException(code=403)，消息带权限名', () => {
    withUser({ permissions: { allows: [], denies: [] } }, () => {
      let err;
      try {
        StpUtil.checkPermission('user:delete');
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.name).toBe('NotPermissionException');
      expect(err.code).toBe(403);
      expect(err.message).toContain('user:delete');
    });
  });

  it('checkPermissionAnd：全部满足才通过，缺一项即抛', () => {
    withUser({ permissions: { allows: ['a', 'b'] } }, () => {
      expect(() => StpUtil.checkPermissionAnd('a', 'b')).not.toThrow();
      expect(() => StpUtil.checkPermissionAnd('a', 'c')).toThrow(/无此权限/);
    });
  });

  it('checkPermissionOr：任一满足即通过，全不满足才抛', () => {
    withUser({ permissions: { allows: ['a'] } }, () => {
      expect(() => StpUtil.checkPermissionOr('x', 'a')).not.toThrow();
      expect(() => StpUtil.checkPermissionOr('x', 'y')).toThrow(/OR/);
    });
  });

  it('checkRole：拥有该角色通过，否则 403', () => {
    withUser({ roles: ['fw_admin'] }, () => {
      expect(() => StpUtil.checkRole('fw_admin')).not.toThrow();
      expect(() => StpUtil.checkRole('superadmin')).toThrow(/需要角色 superadmin/);
    });
  });

  it('未登录时 check() 抛 401（不是静默返回 undefined）', () => {
    requestContext.run({ state: {} }, () => {
      let err;
      try {
        StpUtil.check();
      } catch (e) {
        err = e;
      }
      expect(err?.statusCode).toBe(401);
    });
  });

  it('getLoginId 优先取 sub，回退 uid', () => {
    withUser({ sub: 'sub-id' }, () => expect(StpUtil.getLoginId()).toBe('sub-id'));
    withUser({ uid: 'uuid-1' }, () => expect(StpUtil.getLoginId()).toBe('uuid-1'));
  });

  it('非请求上下文调用给出明确错误（而不是 Cannot read properties of undefined）', () => {
    expect(() => StpUtil.check()).toThrow(/必须在 HTTP 请求上下文中调用/);
  });
});

// ── IamDao：等级压制（提权护栏） ──

/** 内存用户/角色数据 */
const iam = {
  users: new Map(), // uid → { id, uid, username }
  levels: new Map(), // uid → rank_level
  role: null, // findByPk 返回的角色
  userRoleQuery: null
};

jest.unstable_mockModule('../framework/db/index.js', () => ({
  default: { Sequelize: { Op }, query: async () => [] },
  getModel: name => {
    if (name === 'User') {
      return {
        findOne: async ({ where }) => iam.users.get(where.uid) || null
      };
    }
    if (name === 'UserRole') {
      return {
        findOne: async args => {
          iam.userRoleQuery = args;
          // getMemberLevel 是"先查 User 拿 id，再用 user_id 查 UserRole"，
          // 这里按内部 id 反查用例预设的等级（setupLevels 两种键都登记了）
          const level = iam.levels.get(String(args.where.user_id)) ?? 0;
          return level ? { role: { rank_level: level } } : null;
        }
      };
    }
    if (name === 'Role') {
      return {
        findByPk: async () => iam.role
      };
    }
    return null;
  }
}));

jest.unstable_mockModule('../framework/auth/perm-cache.js', () => ({
  invalidatePermCache: async () => {}
}));

const iamDao = (await import('../app/admin/dao/iam.dao.js')).default;

/**
 * 让 getMemberLevel 能按 uid 返回不同等级：
 * 该实现内部先查 User 拿 id，再用 user_id 查 UserRole，此时已拿不到 uid，
 * 所以按 user.id 反查 uid（数据量小，直接线性找）。
 */
function setupLevels(map) {
  iam.users.clear();
  iam.levels.clear();
  let id = 1;
  for (const [uid, level] of Object.entries(map)) {
    const user = { id: id++, uid, username: uid };
    iam.users.set(uid, user);
    iam.levels.set(uid, level);
    iam.levels.set(String(user.id), level); // 供 user_id 反查
  }
}

beforeEach(() => {
  iam.role = null;
  iam.userRoleQuery = null;
  iam.users.clear();
  iam.levels.clear();
});

describe('IamDao：rank_level 取最高职级', () => {
  it('用户不存在时返回 0', async () => {
    expect(await iamDao.getMemberLevel('ghost', 'firewall')).toBe(0);
  });

  it('按角色 rank_level 取最高职级（排序依据是 role，不是 role_id）', async () => {
    setupLevels({ 'uid-high': 90 });
    expect(await iamDao.getMemberLevel('uid-high', 'firewall')).toBe(90);

    // 历史上这里按 role_id DESC 排序 → 取到"最新分配"的低权角色，导致管理员等级被算低，
    // 进而可以越权委派高权角色。断言排序键即可锁住这个回归。
    const order = iam.userRoleQuery.order[0];
    expect(order[0]).toEqual({ model: expect.anything(), as: 'role' });
    expect(order[1]).toBe('rank_level');
    expect(order[2]).toBe('DESC');
    expect(iam.userRoleQuery.where.app_id).toEqual(['firewall', 'GLOBAL']);
  });
});

describe('IamDao.assignRole：提权护栏', () => {
  it('不能委派等级 ≥ 自己的角色', async () => {
    setupLevels({ 'uid-admin': 50, 'uid-target': 10 });
    iam.role = { id: 7, rank_level: 50 };

    await expect(iamDao.assignRole('uid-admin', 'uid-target', 7, 'firewall')).rejects.toThrow(
      /无法委派等级高于或等于自己的角色/
    );
  });

  it('不能操作等级 ≥ 自己的用户（同级也不允许）', async () => {
    setupLevels({ 'uid-admin': 50, 'uid-peer': 50 });
    iam.role = { id: 8, rank_level: 10 };

    await expect(iamDao.assignRole('uid-admin', 'uid-peer', 8, 'firewall')).rejects.toThrow(
      /无法对等级高于或等于自己的用户进行操作/
    );
  });

  it('目标角色不存在时明确报 ROLE_NOT_FOUND', async () => {
    setupLevels({ 'uid-admin': 50, 'uid-target': 10 });
    iam.role = null;

    await expect(iamDao.assignRole('uid-admin', 'uid-target', 9, 'firewall')).rejects.toThrow(/ROLE_NOT_FOUND/);
  });
});
