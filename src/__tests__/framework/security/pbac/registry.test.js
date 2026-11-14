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
  resetPbacRegistryForTesting,
  NORMAL_RANK_MAX,
  getDeclaredDefaultRole,
  listDeclaredDefaultRoles
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
  /** 合法角色的基线：只覆盖被测字段，其余给能过校验的最小值 */
  const role = overrides => ({
    app_id: 'demo',
    name: '角色',
    rank_level: 10,
    policy: { Version: 'test', Statement: [] },
    ...overrides
  });
  const define = list => defineRoles((Array.isArray(list) ? list : [list]).map(item => role(item)));

  it('接受单个角色或数组', () => {
    define({ code: 'demo_user' });
    define([{ code: 'demo_admin' }, { code: 'demo_vip' }]);

    expect(roleRegistry.map(r => r.code)).toEqual(['demo_user', 'demo_admin', 'demo_vip']);
  });

  it('🔴 角色 code 重复 → 抛错（loader 以 code upsert，重复会互相覆盖 policy）', () => {
    define({ code: 'demo_admin', policy: { Version: 'v1', Statement: [] } });

    expect(() => define({ code: 'demo_admin', policy: { Version: 'v2', Statement: [] } })).toThrow(
      /角色 code 重复注册/
    );
    expect(roleRegistry).toHaveLength(1);
  });

  it('缺少 code → 抛错，且整批都不注册', () => {
    expect(() => defineRoles([role({ code: 'ok_role' }), role({ name: '没有 code' })])).toThrow(/缺少非空的 code/);
    expect(roleRegistry).toHaveLength(0);
  });

  /*
   * 下面几条针对的是"漏字段不会报错、只会静默跑偏"的历史事故：
   *   · 漏 app_id → 模型默认 'GLOBAL'，业务角色被当成所有应用通用的角色；
   *   · 漏 rank_level → 模型默认 1，等于小黑屋档，被旧逻辑当成默认角色发出去；
   *   · 漏 policy.Statement → 角色授了但一条权限都没有，界面正常、接口全 403。
   */
  it('🔴 缺 app_id → 抛错（缺省会被模型写成 GLOBAL，权限范围凭空放大）', () => {
    expect(() => defineRoles({ code: 'demo_user', rank_level: 10, policy: { Statement: [] } })).toThrow(
      /缺少非空的 app_id/
    );
  });

  it('🔴 缺 name → 抛错（NOT NULL 列，空库首插会失败）', () => {
    expect(() => defineRoles({ code: 'demo_user', app_id: 'demo', rank_level: 10, policy: { Statement: [] } })).toThrow(
      /缺少非空的 name/
    );
  });

  it('🔴 rank_level 必填且必须是 0~99 的整数', () => {
    expect(() => define({ code: 'no_rank', rank_level: undefined })).toThrow(/rank_level 必须是整数/);
    expect(() => define({ code: 'float_rank', rank_level: 10.5 })).toThrow(/rank_level 必须是整数/);
    expect(() => define({ code: 'too_high', rank_level: 100 })).toThrow(/越界/);
    expect(() => define({ code: 'negative', rank_level: -1 })).toThrow(/越界/);
  });

  it('🔴 policy 缺失或 Statement 不是数组 → 抛错（授了角色但零权限是静默失效）', () => {
    expect(() => defineRoles({ code: 'no_policy', app_id: 'demo', name: '无策略', rank_level: 10 })).toThrow(
      /缺少 policy 对象/
    );
    expect(() => define({ code: 'bad_stmt', policy: { Version: 'x' } })).toThrow(/Statement 必须是数组/);
  });

  it('is_default 必须是布尔值', () => {
    expect(() => define({ code: 'demo_x', is_default: 'yes' })).toThrow(/is_default 必须是布尔值/);
  });

  describe('默认角色标记（is_default）', () => {
    it('注册后可被解析链读到；reset 会一起清空', () => {
      define({ code: 'demo_user', is_default: true });

      expect(getDeclaredDefaultRole('demo')).toBe('demo_user');
      expect(listDeclaredDefaultRoles()).toEqual([{ appId: 'demo', code: 'demo_user' }]);

      resetPbacRegistryForTesting();
      expect(getDeclaredDefaultRole('demo')).toBeNull();
    });

    it('🔴 同一应用两个 is_default → 抛错（同批与跨批都要拦，否则授谁取决于代码顺序）', () => {
      expect(() =>
        define([
          { code: 'a', is_default: true },
          { code: 'b', is_default: true }
        ])
      ).toThrow(/声明了多个默认角色/);
      expect(roleRegistry).toHaveLength(0);

      define({ code: 'a', is_default: true });
      expect(() => define({ code: 'b', is_default: true })).toThrow(/声明了多个默认角色/);
    });

    it('🔴 默认角色的职级不能超过普通档（否则等于给每个授权者发管理员）', () => {
      expect(() => define({ code: 'demo_admin', rank_level: NORMAL_RANK_MAX + 1, is_default: true })).toThrow(
        /超过普通档上限/
      );
      // 边界值本身合法
      expect(() => define({ code: 'demo_ok', rank_level: NORMAL_RANK_MAX, is_default: true })).not.toThrow();
    });

    it('不同应用各有一个默认角色是合法的', () => {
      define({ code: 'a_user', app_id: 'a', is_default: true });
      define({ code: 'b_user', app_id: 'b', is_default: true });

      expect(getDeclaredDefaultRole('a')).toBe('a_user');
      expect(getDeclaredDefaultRole('b')).toBe('b_user');
    });
  });
});

describe('definePermissionMeta', () => {
  it('缺 domain / actions 形状不对 → 抛错', () => {
    expect(() => definePermissionMeta({ actions: [] })).toThrow(/非空的 domain/);
    expect(() => definePermissionMeta({ domain: 'demo' })).toThrow(/actions 必须是数组/);
  });
});

describe('resetPbacRegistryForTesting', () => {
  const minimal = { code: 'demo_admin', app_id: 'demo', name: '演示管理员', rank_level: 10, policy: { Statement: [] } };

  it('清空后可以重新注册同一批 code（测试隔离的前提）', () => {
    defineRoles(minimal);
    createPermissionRegistry('demo', '演示', { A: { X: { code: 'demo:a:x', label: 'x' } } });

    resetPbacRegistryForTesting();
    expect(roleRegistry).toHaveLength(0);
    expect(actionMetaRegistry).toHaveLength(0);

    expect(() => defineRoles(minimal)).not.toThrow();
    expect(() =>
      createPermissionRegistry('demo', '演示', { A: { X: { code: 'demo:a:x', label: 'x' } } })
    ).not.toThrow();
  });
});
