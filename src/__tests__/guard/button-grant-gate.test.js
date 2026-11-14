/**
 * 按钮授权闸（菜单授权 → 接口鉴权）的守卫单元测试
 *
 * 背景：`sys_role_menu` 里的按钮节点此前只影响前端 —— 取消勾选只是"按钮不见了"，
 * 拿 token 直接打接口照样能改。`checkPermission` 加了第二道闸：
 * **按钮码必须在菜单授权里被勾上**，否则 403。这份测试钉住那条判据。
 *
 * 只驱动 `checkGuardBase`（纯函数，不碰库、不建 app），所以这些用例不会因为库里
 * 菜单数据被改过而假绿/假红。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { describe, it, expect, jest } from '@jest/globals';

// 与 guard-unit.test.js 同样的理由：guard.js 的 import 链会摸到守卫配置 DAO
jest.unstable_mockModule('../../app/guard/dao/guard-config.dao.js', () => ({
  default: {
    loadFromDB: async () => ({ configs: {}, version: 0, versions: {} }),
    saveToDB: async () => ({ maxVersion: 1, updated: [], versions: {} })
  }
}));

const { __test__checkGuardBase } = await import('../../api/guard.js');

/**
 * 造一个登录用户
 *
 * @param {object} [overrides] 覆盖字段
 * @returns {object} user
 */
function user(overrides = {}) {
  return {
    sub: 'uid-1',
    userId: 7,
    roles: ['custom_role'],
    permissions: { allows: [], denies: [] },
    ...overrides
  };
}

/** 节点配置：只声明一个权限码 */
const need = code => ({ enabled: true, requireLogin: true, requirePermission: code });

describe('按钮授权闸 —— 按钮码必须被菜单授权覆盖', () => {
  it('不是按钮码：只看 policy，有没有 menuPerms 都一样', () => {
    // admin:user:read 是页面级码（不在 buttonCodes 里）
    const u = user({ permissions: { allows: ['admin:user:read'], denies: [] }, buttonCodes: [], menuPerms: [] });
    expect(__test__checkGuardBase(need('admin:user:read'), u, '127.0.0.1').passed).toBe(true);
  });

  it('按钮码 + 已授权：放行', () => {
    const u = user({
      permissions: { allows: ['admin:user:create'], denies: [] },
      buttonCodes: ['admin:user:create'],
      menuPerms: ['admin:user:create']
    });
    expect(__test__checkGuardBase(need('admin:user:create'), u, '127.0.0.1').passed).toBe(true);
  });

  it('按钮码 + 菜单未授权：403 —— 这就是"取消勾选后不能操作"', () => {
    const u = user({
      permissions: { allows: ['admin:user:create'], denies: [] },
      buttonCodes: ['admin:user:create'],
      menuPerms: []
    });
    const result = __test__checkGuardBase(need('admin:user:create'), u, '127.0.0.1');
    expect(result.passed).toBe(false);
    expect(result.status).toBe(4003);
    expect(result.message).toContain('admin:user:create');
  });

  it('按钮被停用/下架（不在 menuPerms）同样 403，即使 policy 还留着', () => {
    const u = user({
      permissions: { allows: ['admin:log:remove'], denies: [] },
      buttonCodes: ['admin:log:remove'],
      menuPerms: []
    });
    expect(__test__checkGuardBase(need('admin:log:remove'), u, '127.0.0.1').passed).toBe(false);
  });

  it('超管（menuPerms 全量由提供方给出）不受影响', () => {
    const u = user({
      permissions: { allows: ['admin:*'], denies: [] },
      buttonCodes: ['admin:user:create'],
      menuPerms: ['admin:user:create']
    });
    expect(__test__checkGuardBase(need('admin:user:create'), u, '127.0.0.1').passed).toBe(true);
  });

  it('deny 依然优先于一切（包括已授权的按钮码）', () => {
    const u = user({
      permissions: { allows: ['admin:user:create'], denies: ['admin:user:create'] },
      buttonCodes: ['admin:user:create'],
      menuPerms: ['admin:user:create']
    });
    expect(__test__checkGuardBase(need('admin:user:create'), u, '127.0.0.1').passed).toBe(false);
  });

  it('{ any } / { all } 表单同样过这道闸', () => {
    const u = user({
      permissions: { allows: ['admin:user:create', 'admin:user:update'], denies: [] },
      buttonCodes: ['admin:user:create', 'admin:user:update'],
      menuPerms: ['admin:user:create']
    });
    // any：有一个已授权就够
    expect(
      __test__checkGuardBase(need({ any: ['admin:user:update', 'admin:user:create'] }), u, '127.0.0.1').passed
    ).toBe(true);
    // all：两个都授权才过
    expect(
      __test__checkGuardBase(need({ all: ['admin:user:create', 'admin:user:update'] }), u, '127.0.0.1').passed
    ).toBe(false);
  });

  it('没有按钮数据（未注册提供方 / 其它应用）时行为与改造前一致', () => {
    const u = user({ permissions: { allows: ['admin:user:create'], denies: [] } });
    expect(__test__checkGuardBase(need('admin:user:create'), u, '127.0.0.1').passed).toBe(true);
  });

  it('关 → 开 同一个账号：403 变 200（授权是可撤销的减项）', () => {
    const base = user({
      permissions: { allows: ['admin:user:create'], denies: [] },
      buttonCodes: ['admin:user:create']
    });

    // 矩阵里取消勾选
    const closed = { ...base, menuPerms: [] };
    expect(__test__checkGuardBase(need('admin:user:create'), closed, '127.0.0.1').passed).toBe(false);

    // policy 一直没动过 —— 重新勾上就恢复，不需要"去编辑用户的权限"
    const reopened = { ...base, menuPerms: ['admin:user:create'] };
    expect(__test__checkGuardBase(need('admin:user:create'), reopened, '127.0.0.1').passed).toBe(true);
  });
});
