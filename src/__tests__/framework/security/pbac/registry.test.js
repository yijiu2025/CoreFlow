/**
 * PBAC 注册中心的注册期约束
 *
 * 为什么值得单独钉：注册发生在各 app 的 `permission/index.js` **import 期**，
 * 一旦重复/缺字段，后果不是"报错"，而是三种静默错误 ——
 *   · 权限码重复 → `hasPermission` 命中的是哪一份取决于加载顺序；
 *   · 业务域重复 → 管理端的权限字典接口返回两份同名域，复选框渲染两次；
 *   · 角色 code 重复 → loader 以 code 为键 upsert，后注册的 policy 覆盖前一个。
 * 这三种都查不到日志。所以判据放在注册时抛错（启动期失败，比运行期鉴权漂移便宜）。
 *
 * @author yijiu2025
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  roleRegistry,
  actionMetaRegistry,
  defineRoles,
  definePermissionMeta,
  createPermissionRegistry,
  resetPbacRegistryForTesting
} from '../../../../framework/security/pbac/index.js';

beforeEach(() => {
  resetPbacRegistryForTesting();
});

describe('createPermissionRegistry', () => {
  it('一次声明同时产出常量与元数据（后端取值 / 前端渲染复选框）', () => {
    const PERM = createPermissionRegistry('demo', '演示', {
      WORK: {
        READ: { code: 'demo:work:read', label: '查看', type: 'read' },
        DELETE: { code: 'demo:work:delete', label: '删除', type: 'high_risk' }
      }
    });

    expect(PERM.WORK.READ).toBe('demo:work:read');
    expect(PERM.WORK.DELETE).toBe('demo:work:delete');
    expect(actionMetaRegistry).toHaveLength(1);
    expect(actionMetaRegistry[0].domain).toBe('demo');
    expect(actionMetaRegistry[0].actions.map(a => a.code)).toEqual(['demo:work:read', 'demo:work:delete']);
  });

  it('返回的常量被冻结：写入不会让常量与注册表分叉', () => {
    const PERM = createPermissionRegistry('demo', '演示', {
      WORK: { READ: { code: 'demo:work:read', label: '查看', type: 'read' } }
    });

    expect(Object.isFrozen(PERM)).toBe(true);
    expect(Object.isFrozen(PERM.WORK)).toBe(true);
    expect(() => {
      PERM.WORK.READ = 'demo:work:evil';
    }).toThrow(TypeError);
    expect(PERM.WORK.READ).toBe('demo:work:read');
  });

  it('🔴 权限码重复注册 → 抛错（不是覆盖、不是忽略）', () => {
    createPermissionRegistry('demo', '演示', { WORK: { READ: { code: 'shared:read', label: 'a' } } });

    expect(() =>
      createPermissionRegistry('other', '另一个', { WORK: { READ: { code: 'shared:read', label: 'b' } } })
    ).toThrow(/权限码重复注册/);
  });

  it('🔴 同一业务域注册两次 → 抛错（否则字典接口出现两份同名域）', () => {
    createPermissionRegistry('demo', '演示', { A: { X: { code: 'demo:a:x', label: 'x' } } });

    expect(() => createPermissionRegistry('demo', '演示', { B: { Y: { code: 'demo:b:y', label: 'y' } } })).toThrow(
      /权限域重复注册/
    );
  });

  it('缺少 code / code 为空 → 抛错，且不留下半截注册状态', () => {
    expect(() =>
      createPermissionRegistry('demo', '演示', {
        WORK: { OK: { code: 'demo:work:ok', label: 'ok' }, BAD: { label: '没有 code' } }
      })
    ).toThrow(/缺少非空的 code/);

    // 先校验后落表：整份定义被拒，一个码都不该进注册表
    expect(actionMetaRegistry).toHaveLength(0);
  });
});

describe('defineRoles', () => {
  it('接受单个角色或数组', () => {
    defineRoles({ code: 'demo_user' });
    defineRoles([{ code: 'demo_admin' }, { code: 'demo_vip' }]);

    expect(roleRegistry.map(r => r.code)).toEqual(['demo_user', 'demo_admin', 'demo_vip']);
  });

  it('🔴 角色 code 重复 → 抛错（loader 以 code upsert，重复会互相覆盖 policy）', () => {
    defineRoles({ code: 'demo_admin', policy: { v: 1 } });

    expect(() => defineRoles({ code: 'demo_admin', policy: { v: 2 } })).toThrow(/角色 code 重复注册/);
    expect(roleRegistry).toHaveLength(1);
  });

  it('缺少 code → 抛错，且整批都不注册', () => {
    expect(() => defineRoles([{ code: 'ok_role' }, { name: '没有 code' }])).toThrow(/缺少非空的 code/);
    expect(roleRegistry).toHaveLength(0);
  });
});

describe('definePermissionMeta', () => {
  it('缺 domain / actions 形状不对 → 抛错', () => {
    expect(() => definePermissionMeta({ actions: [] })).toThrow(/非空的 domain/);
    expect(() => definePermissionMeta({ domain: 'demo' })).toThrow(/actions 必须是数组/);
  });
});

describe('resetPbacRegistryForTesting', () => {
  it('清空后可以重新注册同一批 code（测试隔离的前提）', () => {
    defineRoles({ code: 'demo_admin' });
    createPermissionRegistry('demo', '演示', { A: { X: { code: 'demo:a:x', label: 'x' } } });

    resetPbacRegistryForTesting();
    expect(roleRegistry).toHaveLength(0);
    expect(actionMetaRegistry).toHaveLength(0);

    expect(() => defineRoles({ code: 'demo_admin' })).not.toThrow();
    expect(() =>
      createPermissionRegistry('demo', '演示', { A: { X: { code: 'demo:a:x', label: 'x' } } })
    ).not.toThrow();
  });
});
