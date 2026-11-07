/**
 * 守卫运行时字段的方向判定
 *
 * 这组用例的重点不是"函数能跑"，而是把三条容易弄反的语义钉死：
 *   1. `[]` 表示不限制，因此"清空"是放宽；
 *   2. 一次 patch 同时增删时按放宽处理（否则夹带删除即可绕过认证）；
 *   3. 稳定序列化与键顺序无关（签名与摘要都依赖它）。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { describe, it, expect } from '@jest/globals';
import { diffPatch, diffNode, canonicalJson, pickRuntimeFields } from '../../app/guard/services/direction.js';

describe('diffPatch：单字段方向', () => {
  it('enabled 由开到关是收紧', () => {
    const { direction } = diffPatch({ enabled: true }, { enabled: false });
    expect(direction).toBe('tighten');
  });

  it('enabled 由关到开是放宽', () => {
    const { direction } = diffPatch({ enabled: false }, { enabled: true });
    expect(direction).toBe('relax');
  });

  it('requireLogin 由 false 到 true 是收紧', () => {
    const { direction } = diffPatch({ requireLogin: false }, { requireLogin: true });
    expect(direction).toBe('tighten');
  });

  it('requireLogin 由 true 到 false 是放宽', () => {
    const { direction } = diffPatch({ requireLogin: true }, { requireLogin: false });
    expect(direction).toBe('relax');
  });

  it('allowRoles 追加角色是收紧', () => {
    const { direction, changes } = diffPatch({ allowRoles: ['a'] }, { allowRoles: ['a', 'b'] });
    expect(direction).toBe('tighten');
    expect(changes[0].field).toBe('allowRoles');
  });

  it('allowRoles 从 [] 变为有值是收紧（[] 表示不限角色）', () => {
    const { direction } = diffPatch({ allowRoles: [] }, { allowRoles: ['admin_operator'] });
    expect(direction).toBe('tighten');
  });

  it('allowRoles 清空是放宽（[] 表示不限角色）', () => {
    const { direction } = diffPatch({ allowRoles: ['admin_operator'] }, { allowRoles: [] });
    expect(direction).toBe('relax');
  });

  it('allowIps 清空是放宽', () => {
    const { direction } = diffPatch({ allowIps: ['10.0.0.0/8'] }, { allowIps: [] });
    expect(direction).toBe('relax');
  });

  it('同时增删按放宽处理，不能被"加一个删一个"绕过', () => {
    const { direction, changes } = diffPatch({ allowRoles: ['a', 'b'] }, { allowRoles: ['a', 'c'] });
    expect(changes[0].direction).toBe('mixed');
    expect(direction).toBe('relax');
  });

  it('没有实际变化时是 neutral', () => {
    const { direction, changes } = diffPatch({ allowRoles: ['a'] }, { allowRoles: ['a'] });
    expect(direction).toBe('neutral');
    expect(changes).toHaveLength(0);
  });

  it('patch 里未声明的字段不参与判定', () => {
    const { direction } = diffPatch({ allowRoles: ['a'], enabled: true }, { description: '改个说明' });
    expect(direction).toBe('neutral');
  });

  it('多个字段时，最危险的一项决定整体方向', () => {
    const { direction } = diffPatch(
      { enabled: true, requireLogin: true, allowRoles: ['a'] },
      { enabled: false, requireLogin: false, allowRoles: ['a'] }
    );
    // enabled 收紧、requireLogin 放宽 → 整体必须要求认证
    expect(direction).toBe('relax');
  });
});

describe('diffNode：对照基线', () => {
  it('DB 相对基线删角色是放宽', () => {
    const { direction } = diffNode({ allowRoles: ['superadmin'] }, { allowRoles: [] });
    expect(direction).toBe('relax');
  });

  it('DB 与基线一致时是 neutral', () => {
    const baseline = { enabled: true, requireLogin: true, allowIps: [], allowRoles: ['a'] };
    const { direction } = diffNode(baseline, { ...baseline });
    expect(direction).toBe('neutral');
  });

  it('基线缺失字段时按 undefined 参与比较，不能被"少写一个键"绕过', () => {
    // 基线要求登录，DB 里整个 requireLogin 键被删掉 → 视为放宽
    const { direction } = diffNode({ requireLogin: true }, {});
    expect(direction).toBe('relax');
  });
});

describe('canonicalJson：稳定序列化', () => {
  it('键顺序不同但语义相同时摘要一致', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('数组顺序不同视为不同值（角色顺序不应被忽略）', () => {
    expect(canonicalJson(['a', 'b'])).not.toBe(canonicalJson(['b', 'a']));
  });

  it('undefined 字段被剔除，不产生 "key":null', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('嵌套对象同样排序', () => {
    expect(canonicalJson({ x: { d: 1, c: 2 } })).toBe('{"x":{"c":2,"d":1}}');
  });
});

describe('pickRuntimeFields', () => {
  it('只保留运行时字段，剔除结构与时间字段', () => {
    const picked = pickRuntimeFields({
      id: 'a1',
      url: '/x',
      updatedAt: '2026-11-07',
      enabled: true,
      allowRoles: ['a']
    });
    expect(picked).toEqual({ enabled: true, allowRoles: ['a'] });
  });
});
