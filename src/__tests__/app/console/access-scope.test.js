/**
 * 授权范围规则（`app/console/services/access-scope.service.js`）
 *
 * 这套规则是「谁能改谁的哪些角色」的唯一判定点，判错的后果不是难用，是提权：
 * 一个 admin_operator 如果能改超管，等于给自己加超管。所以这里把每一条都钉住。
 *
 * 🔴 只用**纯函数**（`assertCanManageUser` / `planRoleChangeWithRoles` /
 *    `assertGrantableRoles`）：规则本身不查库，查库只是它的输入，因此单测不需要
 *    数据库，也不会因为库里角色数据被人改过而假绿/假红。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import {
  assertCanManageUser,
  assertCanManageRole,
  planRoleChangeWithRoles,
  assertGrantableRoles,
  canWriteApp
} from '../../../app/console/services/access-scope.service.js';

/**
 * 造一个角色摘要（与 `loadRoles` 输出同形）
 *
 * @param {object} spec 规格
 * @returns {object} 角色摘要
 */
function role({ id, app = 'GLOBAL', rank = 10, code = `r${id}`, name = `角色${id}` }) {
  return { id, appId: app, code, name, rank, isSuper: code === 'superadmin' };
}

/**
 * 造一个「画像」（与 `describe` 输出同形）
 *
 * @param {object[]} roles 角色摘要
 * @returns {object} 画像
 */
function persona(roles) {
  const apps = new Set(roles.map(r => r.appId).filter(a => a !== 'GLOBAL'));
  return {
    roleIds: roles.map(r => r.id),
    roles: new Map(roles.map(r => [r.id, r])),
    apps,
    maxRank: roles.reduce((max, r) => Math.max(max, r.rank), 0),
    isSuper: roles.some(r => r.isSuper),
    crossApp: roles.some(r => r.appId === 'admin')
  };
}

/** 各角色（id 固定，便于断言最终集合） */
const superRole = role({ id: 1, code: 'superadmin', rank: 99 });
const adminAdmin = role({ id: 2, app: 'admin', code: 'admin_admin', rank: 80 });
const adminOperator = role({ id: 3, app: 'admin', code: 'admin_operator', rank: 50 });
const fwAdmin = role({ id: 4, app: 'firewall', code: 'fw_admin', rank: 95 });
const fwViewer = role({ id: 5, app: 'firewall', code: 'fw_viewer', rank: 10 });
const fwOperator = role({ id: 6, app: 'firewall', code: 'fw_operator', rank: 50 });
const retroMember = role({ id: 7, app: 'retroweb', code: 'retroweb_member', rank: 20 });
const normalUser = role({ id: 8, code: 'user_normal', rank: 10 });

describe('assertCanManageUser —— 谁能动这个账号', () => {
  const actorSuper = persona([superRole]);
  const actorAdminAdmin = persona([adminAdmin]);
  const actorAdminOperator = persona([adminOperator]);
  const actorFwAdmin = persona([fwAdmin]);

  test('非超管不能动超管账号', () => {
    expect(() => assertCanManageUser(actorAdminAdmin, persona([superRole]), 9, 2)).toThrow(/只有超级管理员/);
  });

  test('超管可以动超管（否则顶级互相锁死，只能改库）', () => {
    expect(() => assertCanManageUser(actorSuper, persona([superRole]), 9, 1)).not.toThrow();
  });

  test('同级管理员互不可动（不同管理员互相也不能编辑）', () => {
    expect(() => assertCanManageUser(actorAdminAdmin, persona([adminAdmin]), 9, 2)).toThrow(/同级或更高级/);
  });

  test('不能动职级更高的管理员', () => {
    expect(() => assertCanManageUser(actorAdminOperator, persona([adminAdmin]), 9, 3)).toThrow(/同级或更高级/);
  });

  test('可以动职级更低 / 无管理角色的用户', () => {
    expect(() => assertCanManageUser(actorAdminAdmin, persona([normalUser]), 9, 2)).not.toThrow();
    expect(() => assertCanManageUser(actorAdminOperator, persona([fwViewer]), 9, 3)).not.toThrow();
  });

  test('改自己不受"同级"限制（自锁另有闸：不能摘掉自己全部管理权限）', () => {
    expect(() => assertCanManageUser(actorAdminAdmin, persona([adminAdmin]), 2, 2)).not.toThrow();
  });

  test('应用域：防火墙管理员不能动只在 RetroWeb 注册的用户', () => {
    expect(() => assertCanManageUser(actorFwAdmin, persona([retroMember]), 9, 4)).toThrow(/没有账号|不在你管理/);
  });

  test('应用域：防火墙管理员可以动有防火墙角色的用户（哪怕他还有别的应用）', () => {
    expect(() => assertCanManageUser(actorFwAdmin, persona([fwViewer, retroMember]), 9, 4)).not.toThrow();
  });

  test('应用域：持管理后台角色的人跨应用（否则后台把自己锁在门外）', () => {
    expect(() => assertCanManageUser(actorAdminAdmin, persona([retroMember]), 9, 2)).not.toThrow();
  });
});

describe('planRoleChangeWithRoles —— 改哪部分、留哪部分', () => {
  const actorFwAdmin = persona([fwAdmin]);
  const target = persona([fwViewer, retroMember]);

  const rolesOf = (...list) => new Map(list.map(r => [r.id, r]));

  test('只覆盖本应用：其它应用的角色原样保留', () => {
    const plan = planRoleChangeWithRoles({
      actor: actorFwAdmin,
      target,
      submittedRoleIds: [fwOperator.id],
      submittedRoles: rolesOf(fwOperator)
    });
    expect(plan.finalRoleIds).toEqual([retroMember.id, fwOperator.id]);
    expect(plan.finalRoleIds).not.toContain(fwViewer.id); // 本应用的被替换掉了
  });

  test('提交其它应用的角色直接拒绝（不是静默忽略）', () => {
    expect(() =>
      planRoleChangeWithRoles({
        actor: actorFwAdmin,
        target,
        submittedRoleIds: [retroMember.id],
        submittedRoles: rolesOf(retroMember)
      })
    ).toThrow(/不能修改/);
  });

  test('不能借"授予"提权：新增角色职级不得 ≥ 自己', () => {
    expect(() =>
      planRoleChangeWithRoles({
        actor: persona([adminOperator]),
        target: persona([normalUser]),
        submittedRoleIds: [normalUser.id, fwAdmin.id],
        submittedRoles: rolesOf(normalUser, fwAdmin)
      })
    ).toThrow(/职级不低于/);
  });

  test('超管不受职级限制（可以授予超管角色）', () => {
    const plan = planRoleChangeWithRoles({
      actor: persona([superRole]),
      target: persona([normalUser]),
      submittedRoleIds: [normalUser.id, superRole.id],
      submittedRoles: rolesOf(normalUser, superRole)
    });
    expect(plan.finalRoleIds).toEqual(expect.arrayContaining([normalUser.id, superRole.id]));
  });

  test('保留已有的同级角色不算"授予"（换表单不该被判提权）', () => {
    // 目标本来就有 fw_admin(95)，操作者是 admin_admin(80)，跨应用管理员可写，但职级不够
    const highTarget = persona([fwAdmin]);
    const plan = planRoleChangeWithRoles({
      actor: persona([adminAdmin]),
      target: highTarget,
      submittedRoleIds: [fwAdmin.id],
      submittedRoles: rolesOf(fwAdmin)
    });
    expect(plan.finalRoleIds).toEqual([fwAdmin.id]);
  });
});

describe('assertGrantableRoles —— 新建用户 / 批量追加时能授予什么', () => {
  test('不能授予其它应用的角色', () => {
    expect(() => assertGrantableRoles(persona([fwAdmin]), new Map([[retroMember.id, retroMember]]))).toThrow(
      /无权授予其它应用/
    );
  });

  test('不能授予不低于自己职级的角色', () => {
    expect(() => assertGrantableRoles(persona([adminOperator]), new Map([[fwAdmin.id, fwAdmin]]))).toThrow(
      /职级不低于/
    );
  });

  test('超管可授予任意角色', () => {
    expect(() => assertGrantableRoles(persona([superRole]), new Map([[adminAdmin.id, adminAdmin]]))).not.toThrow();
  });
});

describe('assertCanManageRole / canWriteApp —— 角色本身的维护边界', () => {
  const actorFwAdmin = persona([fwAdmin]);

  test('非跨应用管理员不能编辑 / 删除其它应用的角色', () => {
    expect(() => assertCanManageRole(actorFwAdmin, adminAdmin)).toThrow(/其它应用/);
    expect(canWriteApp(actorFwAdmin, 'firewall')).toBe(true);
    expect(canWriteApp(actorFwAdmin, 'GLOBAL')).toBe(true);
  });

  test('不能编辑职级不低于自己的角色', () => {
    expect(() => assertCanManageRole(actorFwAdmin, fwAdmin)).toThrow(/职级/);
  });

  test('只有超管能改超管角色', () => {
    expect(() => assertCanManageRole(persona([adminAdmin]), superRole)).toThrow(/超级管理员/);
    expect(() => assertCanManageRole(persona([superRole]), superRole)).not.toThrow();
  });
});
