/**
 * 批量导入的角色解析
 *
 * 这条路径最容易出的不是"报错"，而是**静默授错角色**：三个应用的普通角色都叫
 * 「普通用户」（posecraft_user / retroweb_user / user_normal），旧实现按名称建
 * Map 后写覆盖前写，于是 CSV 里写「普通用户」会随机命中其中一个应用 —— 导入成功、
 * 流水正常，用户却在目标应用里没有权限。所以这里的判据是"重名必须失败"。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { describe, it, expect } from '@jest/globals';
import {
  buildRoleLookup,
  resolveImportRoles,
  importFingerprint
} from '../../../../app/admin/console/services/import-roles.service.js';

/** 贴近真实库的角色表（name 重复是现实，不是构造） */
const ROLES = [
  { id: 1, code: 'user_normal', name: '普通用户' },
  { id: 2, code: 'posecraft_user', name: '普通用户' },
  { id: 3, code: 'retroweb_user', name: '普通用户' },
  { id: 4, code: 'posecraft_admin', name: '管理员' },
  { id: 5, code: 'admin_viewer', name: '观察者' },
  { id: 6, code: 'superadmin', name: '超级管理员' }
];

/** 单一应用、名称不重名的正常场景 */
const UNIQUE = [
  { id: 1, code: 'posecraft_user', name: 'PoseCraft 普通用户' },
  { id: 2, code: 'posecraft_vip', name: 'VIP 会员' }
];

describe('buildRoleLookup / resolveImportRoles', () => {
  it('编码与名称都能命中（大小写、首尾空白不敏感）', () => {
    const lookup = buildRoleLookup(UNIQUE);

    expect(resolveImportRoles(lookup, ['posecraft_user']).roleIds).toEqual([1]);
    expect(resolveImportRoles(lookup, ['  POSECRAFT_VIP ']).roleIds).toEqual([2]);
    expect(resolveImportRoles(lookup, ['vip 会员']).roleIds).toEqual([2]);
  });

  it('🔴 名称重名 → 判为歧义，绝不猜（旧实现后写覆盖前写，会静默授错应用）', () => {
    const lookup = buildRoleLookup(ROLES);

    const result = resolveImportRoles(lookup, ['普通用户']);

    expect(result.ambiguous).toEqual(['普通用户']);
    expect(result.roleIds).toEqual([]);
    // 编码仍然是确定的
    expect(resolveImportRoles(lookup, ['posecraft_user']).roleIds).toEqual([2]);
  });

  it('未知角色只回原样，不塞进去一个不存在的 id', () => {
    const lookup = buildRoleLookup(ROLES);

    expect(resolveImportRoles(lookup, ['不存在的角色']).unknown).toEqual(['不存在的角色']);
    expect(resolveImportRoles(lookup, ['不存在的角色']).roleIds).toEqual([]);
  });

  it('同一行重复写同一个角色（编码 + 名称）只授一次', () => {
    const lookup = buildRoleLookup(UNIQUE);

    expect(resolveImportRoles(lookup, ['posecraft_user', 'POSEcraft_user', 'PoseCraft 普通用户']).roleIds).toEqual([1]);
  });

  it('空数组 / 空串 / undefined 不产生任何解析结果', () => {
    const lookup = buildRoleLookup(UNIQUE);

    expect(resolveImportRoles(lookup, [])).toEqual({ roleIds: [], unknown: [], ambiguous: [] });
    expect(resolveImportRoles(lookup, ['', '   '])).toEqual({ roleIds: [], unknown: [], ambiguous: [] });
    expect(resolveImportRoles(lookup, undefined)).toEqual({ roleIds: [], unknown: [], ambiguous: [] });
  });

  it('code 与 name 互为同一个角色时不误判成歧义', () => {
    const lookup = buildRoleLookup([{ id: 9, code: 'demo_user', name: 'demo_user' }]);

    expect(lookup.ambiguous.size).toBe(0);
    expect(resolveImportRoles(lookup, ['demo_user']).roleIds).toEqual([9]);
  });
});

/*
 * 指纹是二次验证的 `targetKey`：它一旦能被"换个内容复用同一张凭据"，二次验证就
 * 只剩形式。所以这里钉两件事：稳定性（同样内容必须同值、与角色顺序无关）与敏感性
 * （动任何一个有意义的字段都变）。
 */
describe('importFingerprint', () => {
  const rows = () => [
    {
      username: 'zhangsan',
      email: 'Zs@Example.com',
      password: 'Passw0rd!',
      dept: '技术部',
      roles: ['普通用户', 'vip']
    },
    { username: 'lisi', email: '', password: 'Passw0rd!', dept: '市场部', roles: [] }
  ];

  it('同样的内容 → 同样的指纹（大小写/首尾空白/角色顺序都不影响）', () => {
    const base = importFingerprint(rows());
    const shuffled = rows().map(row => ({
      ...row,
      username: ` ${row.username} `,
      email: row.email.toLowerCase(),
      roles: [...row.roles].reverse()
    }));

    expect(importFingerprint(shuffled)).toBe(base);
    expect(base).toMatch(/^[0-9a-f]{32}$/);
  });

  it('🔴 改动任何一个字段（账号 / 邮箱 / 部门 / 角色）都会变', () => {
    const base = importFingerprint(rows());

    expect(importFingerprint([{ ...rows()[0], username: 'zhangsan2' }, rows()[1]])).not.toBe(base);
    expect(importFingerprint([{ ...rows()[0], email: 'other@example.com' }, rows()[1]])).not.toBe(base);
    expect(importFingerprint([{ ...rows()[0], dept: '财务部' }, rows()[1]])).not.toBe(base);
    expect(importFingerprint([{ ...rows()[0], roles: ['普通用户'] }, rows()[1]])).not.toBe(base);
    // 少一行同样算"换了内容"
    expect(importFingerprint([rows()[0]])).not.toBe(base);
  });

  it('密码不参与指纹（改密码不扩大破坏半径，也不该逼用户重新验证）', () => {
    const base = importFingerprint(rows());
    const changed = rows().map(row => ({ ...row, password: 'Another1!' }));

    expect(importFingerprint(changed)).toBe(base);
  });

  it('空输入得到稳定值（不是随机串）', () => {
    expect(importFingerprint([])).toBe(importFingerprint(undefined));
    expect(importFingerprint([])).toMatch(/^[0-9a-f]{32}$/);
  });
});
