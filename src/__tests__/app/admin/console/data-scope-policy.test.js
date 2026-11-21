/**
 * 数据范围的档位策略：只有管理员 / 审核员 / 观察者能配非「仅本人」
 *
 * 这条规则是"建个角色顺手勾全部数据"那条越权路径的唯一闸口，
 * 判断错一个编码就等于没设防，所以逐条钉住。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import {
  isScopeConfigurable,
  assertScopeConfigurable
} from '../../../../app/admin/console/services/data-scope.service.js';

describe('isScopeConfigurable：哪些角色能配数据范围', () => {
  test('管理员 / 审核员 / 观察者（含超管）可配', () => {
    expect(isScopeConfigurable('superadmin')).toBe(true);
    expect(isScopeConfigurable('admin_admin')).toBe(true);
    expect(isScopeConfigurable('admin_operator')).toBe(true);
    expect(isScopeConfigurable('admin_viewer')).toBe(true);
    expect(isScopeConfigurable('posecraft_admin')).toBe(true);
    expect(isScopeConfigurable('posecraft_operator')).toBe(true);
    expect(isScopeConfigurable('fw_viewer')).toBe(true);
  });

  test('普通用户 / VIP / 创作者 / 默认角色一律不可配', () => {
    expect(isScopeConfigurable('user_normal')).toBe(false);
    expect(isScopeConfigurable('user_vip')).toBe(false);
    expect(isScopeConfigurable('user_banned')).toBe(false);
    expect(isScopeConfigurable('posecraft_vip_creator')).toBe(false);
    expect(isScopeConfigurable('retroweb_member')).toBe(false);
    expect(isScopeConfigurable('posecraft_creator')).toBe(false);
    expect(isScopeConfigurable('')).toBe(false);
  });

  test('名字里带 admin 但不在尾部的编码不算（避免误放行）', () => {
    expect(isScopeConfigurable('admin_user')).toBe(false);
    expect(isScopeConfigurable('superadmin_readonly')).toBe(false);
    expect(isScopeConfigurable('not_an_admin_x')).toBe(false);
  });
});

describe('assertScopeConfigurable：写入口的硬闸', () => {
  test('普通角色提交非「仅本人」→ 拒绝', () => {
    for (const scope of [1, 2, 3, 4]) {
      expect(() => assertScopeConfigurable('user_normal', scope)).toThrow(/只能.*仅本人/);
    }
  });

  test('普通角色提交「仅本人」或没提交 → 放行', () => {
    expect(() => assertScopeConfigurable('user_normal', 5)).not.toThrow();
    expect(() => assertScopeConfigurable('user_normal', undefined)).not.toThrow();
    expect(() => assertScopeConfigurable('user_normal', null)).not.toThrow();
  });

  test('管理员 / 审核员 / 观察者提交任意档位 → 放行', () => {
    for (const code of ['superadmin', 'admin_admin', 'admin_operator', 'admin_viewer']) {
      for (const scope of [1, 2, 3, 4, 5]) {
        expect(() => assertScopeConfigurable(code, scope)).not.toThrow();
      }
    }
  });
});
