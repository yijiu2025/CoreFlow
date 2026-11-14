/**
 * 授权范围（谁可以改谁的哪些角色）
 *
 * 后台只有一套用户与角色表，但**管理员不等于全能**：防火墙管理员不该能改别人的
 * RetroWeb 权限，更不该能接管一个比自己级别更高的管理员账号。这些判断原先散落在
 * 各处、且大部分根本没有 —— 结果是任何拿到 `admin:user:update` 的人都能给超管改
 * 角色、也能给任何应用的人授权。本模块是这四个问题的**单一判定点**：
 *
 *   1. 超管保护：只有超管能改超管（否则一个 admin_operator 就能给自己/别人加超管）
 *   2. 职级压制：只能改**严格低于**自己最高职级的用户 —— 同级管理员互不可改
 *   3. 应用域：非后台管理员只能管「在自己应用里有角色」的用户，且只能改自己应用的
 *      那部分角色（跨应用的变更既不显示、也不接受）
 *   4. 提权闸：新增的角色职级必须低于自己（超管例外），防止用"授予"绕过 1/2
 *
 * === 应用域的口径（刻意如此，改动前先读这段）===
 * 持有 `admin` 命名空间角色的人（管理后台自身的角色）视为**跨应用管理员**：这个后台
 * 就是各应用的管理入口，若把 admin_admin 也限制在 `admin` 这一个"应用"内，他会连
 * 一个普通用户都管不了（普通用户只有 GLOBAL 角色）—— 后台等于把自己锁在门外。
 * 防火墙 / RetroWeb 等业务应用的管理员则只在自己应用内生效。
 *
 * `GLOBAL` 角色（会员等级一类）不归属任何应用，**不进入应用域计算**：它们既不能
 * 让某个管理员"跨"到别家应用，也不会因此被谁改掉（除非其职级低于操作者）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { listAppConfigs } from '../../../framework/config/app-registry.js';
import { isWildcardMatch } from '../../../framework/security/auth/permission/wildcard-match.js';

/** 公共角色所属的伪应用标识 */
const GLOBAL_APP = 'GLOBAL';

/** 管理后台的权限命名空间：持有它的管理员天然跨应用（见文件头） */
const ADMIN_APP = 'admin';

/** 超管角色编码（初始化脚本创建，rank_level 99） */
const SUPER_ROLE_CODE = 'superadmin';

/**
 * 应用显示名
 *
 * 优先查启动期注册的应用配置（`app_id` 或 `permission_app_id` 命中），否则回退标识本身。
 * `GLOBAL` 不是应用，单独给中文名。
 *
 * @param {string} appId 应用标识（角色上的 `app_id`）
 * @returns {string} 可读名称
 */
function appLabel(appId) {
  if (!appId) return '未知';
  if (appId === GLOBAL_APP) return '全局';
  for (const cfg of listAppConfigs()) {
    if (cfg.app_id === appId || cfg.permission_app_id === appId) return cfg.name || appId;
  }
  return appId;
}

/**
 * 角色 id → 角色摘要
 *
 * @param {number[]} roleIds 角色 ID
 * @returns {Promise<Map<number, {id: number, appId: string, code: string, name: string, rank: number, isSuper: boolean}>>}
 */
async function loadRoles(roleIds) {
  const ids = Array.from(new Set((roleIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
  if (ids.length === 0) return new Map();
  const rows = await getModel('Role').findAll({
    where: { id: ids },
    attributes: ['id', 'app_id', 'code', 'name', 'rank_level', 'policy'],
    raw: true
  });
  const map = new Map();
  for (const r of rows) {
    map.set(Number(r.id), {
      id: Number(r.id),
      appId: r.app_id || GLOBAL_APP,
      code: r.code,
      name: r.name,
      rank: Number(r.rank_level) || 0,
      // 超管判定用角色编码，不用 policy：`admin:*` 是"后台管理员"，不等于超管
      isSuper: r.code === SUPER_ROLE_CODE
    });
  }
  return map;
}

/**
 * 某用户当前生效的角色 ID
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<number[]>} 角色 ID（未分配时为空数组）
 */
async function activeRoleIds(userId) {
  if (!userId) return [];
  const rows = await getModel('UserRole').findAll({
    where: { user_id: Number(userId), delete_version: 0 },
    attributes: ['role_id'],
    raw: true
  });
  return rows.map(r => Number(r.role_id));
}

/**
 * 汇总一组角色的"可管理画像"
 *
 * @param {number[]} roleIds 角色 ID
 * @returns {Promise<object>} 画像
 */
async function describe(roleIds) {
  const roles = await loadRoles(roleIds);
  const list = [...roles.values()];
  const apps = new Set(list.map(r => r.appId).filter(app => app !== GLOBAL_APP));
  const maxRank = list.reduce((max, r) => Math.max(max, r.rank), 0);
  return {
    roleIds: list.map(r => r.id),
    roles,
    apps,
    maxRank,
    isSuper: list.some(r => r.isSuper),
    // 持有管理后台角色 = 跨应用管理员（见文件头）
    crossApp: list.some(r => r.appId === ADMIN_APP)
  };
}

/**
 * 操作者的可管理范围
 *
 * @param {number} operatorId 操作者用户 ID
 * @returns {Promise<{roleIds: number[], apps: Set<string>, maxRank: number, isSuper: boolean, crossApp: boolean}>}
 */
async function getActorScope(operatorId) {
  return describe(await activeRoleIds(operatorId));
}

/**
 * 目标用户的当前状态
 *
 * @param {number} userId 目标用户 ID
 * @returns {Promise<{roleIds: number[], apps: Set<string>, maxRank: number, isSuper: boolean}>}
 */
async function getTargetScope(userId) {
  return describe(await activeRoleIds(userId));
}

/**
 * 角色是否在操作者可写的应用域内
 *
 * 超管与跨应用管理员（持 admin 角色）可写全部；其余只看自己拥有的应用 + GLOBAL。
 *
 * @param {object} actor 操作者画像
 * @param {string} appId 角色所属应用
 * @returns {boolean} 是否可写
 */
function canWriteApp(actor, appId) {
  if (actor.isSuper || actor.crossApp) return true;
  if (!appId || appId === GLOBAL_APP) return true; // 公共角色不归属应用
  return actor.apps.has(appId);
}

/**
 * 校验「能不能对这个用户动手」
 *
 * 用于一切改动他人账号的动作（改资料 / 改角色 / 改状态 / 重置密码 / 删除）：
 * 只要有一条不通过，后面的接口就不该执行 —— 否则重置密码就能接管超管账号，
 * 前面拦得再严也白搭。
 *
 * @param {object} actor 操作者画像
 * @param {object} target 目标画像
 * @param {number} targetUserId 目标用户 ID（判断"改自己"）
 * @param {number} operatorId 操作者用户 ID
 * @param {object} [labels] 提示文案用的上下文
 * @param {string} [labels.action='操作'] 动作名（"编辑"/"重置密码"…）
 * @throws {Error} `FORBIDDEN:xxx`（由 withFail 翻译成 403）
 */
function assertCanManageUser(actor, target, targetUserId, operatorId, { action = '操作' } = {}) {
  if (Number(targetUserId) === Number(operatorId)) return;

  if (target.isSuper && !actor.isSuper) {
    throw new Error(`FORBIDDEN:只有超级管理员可以${action}超级管理员账号`);
  }

  /*
   * 超管不再受职级与应用域限制 —— 包括**超管之间互相管理**。
   *
   * "严格大于"在这里会把顶级也锁死：两个超管职级都是 99，谁都改不了谁，一旦有账号
   * 需要降权（离职、泄露），除了直连数据库没有任何出路。超管是系统的最高权威，
   * 给它设一个"管不了的人"只会把风险推到改库上。超管自己的"防自锁"仍由
   * `hasAdminCapability` 那道闸负责。
   */
  if (actor.isSuper) return;

  if (target.maxRank >= actor.maxRank) {
    const label = target.isSuper ? '超级管理员' : `同级或更高级管理员（职级 ${target.maxRank}）`;
    throw new Error(`FORBIDDEN:不能${action}${label}，管理员之间不能互相修改`);
  }

  if (!actor.crossApp) {
    const mine = [...actor.apps];
    const overlapped = [...target.apps].some(app => actor.apps.has(app));
    if (mine.length > 0 && !overlapped) {
      const appName = mine.map(appLabel).join(' / ');
      throw new Error(`FORBIDDEN:该用户在${appName}没有账号，你只能管理本应用的用户`);
    }
  }
}

/**
 * 规划一次角色变更：算出「最终应该是什么」，并拦住越权项
 *
 * 关键点：**只覆盖可写应用内的角色**。范围外的角色原样保留 ——
 * 否则一个应用管理员保存一次表单，就会把别人在其它应用的角色连带删光
 * （`replaceRoles` 是全量覆盖语义）。
 *
 * @param {object} params 参数
 * @param {object} params.actor 操作者画像
 * @param {object} params.target 目标画像
 * @param {number[]} params.submittedRoleIds 提交的角色 ID（前端表单值）
 * @returns {Promise<{finalRoleIds: number[], ignored: number[]}>} 最终角色集合与因越权被去掉的项
 * @throws {Error} `FORBIDDEN:xxx`
 */
async function planRoleChange({ actor, target, submittedRoleIds }) {
  const submitted = Array.from(new Set((submittedRoleIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
  // 🔴 提交里可能有目标当前没有的角色，必须单独查：只用 target.roles 会漏掉
  //    "新增越权角色"这条最需要拦的路径（校验读到 undefined，静默放行）
  const submittedRoles = await loadRoles(submitted);
  // 已删除 / 不存在的角色 id 直接拒：不拦就会写进关联表（本仓没有外键，脏关联不会报错），
  // 之后表现为"用户有一个查不到名字的角色"
  if (submittedRoles.size !== submitted.length) {
    throw new Error('INVALID_PARAM:提交的角色不存在或已被删除');
  }
  return planRoleChangeWithRoles({ actor, target, submittedRoleIds: submitted, submittedRoles });
}

/**
 * 规划角色变更（纯函数版：角色已查好）
 *
 * 拆出来是为了能被单测直接驱动 —— 规则本身不查库，查库只是它的输入。
 *
 * @param {object} params 参数
 * @param {object} params.actor 操作者画像
 * @param {object} params.target 目标画像
 * @param {number[]} params.submittedRoleIds 提交的角色 ID
 * @param {Map<number, object>} params.submittedRoles 提交角色 id → 角色摘要
 * @returns {{finalRoleIds: number[], ignored: number[]}} 最终角色集合与被去掉的项
 * @throws {Error} `FORBIDDEN:xxx`
 */
function planRoleChangeWithRoles({ actor, target, submittedRoleIds, submittedRoles }) {
  const submitted = submittedRoleIds;
  const before = new Set(target.roleIds);

  // 1. 越权应用：直接拒绝而不是静默忽略 —— 静默会让人以为"改成功了"
  for (const role of submittedRoles.values()) {
    if (!canWriteApp(actor, role.appId)) {
      throw new Error(`FORBIDDEN:不能修改${appLabel(role.appId)}的角色「${role.name}」`);
    }
  }

  // 2. 提权闸：新增的角色职级必须严格低于自己（超管不受限）
  if (!actor.isSuper) {
    for (const role of submittedRoles.values()) {
      if (before.has(role.id)) continue;
      if (role.rank >= actor.maxRank) {
        throw new Error(`FORBIDDEN:不能授予「${role.name}」—— 该角色职级不低于你自己`);
      }
    }
  }

  // 3. 应用域内覆盖、域外保留
  const kept = target.roleIds.filter(id => {
    const role = target.roles.get(id);
    return role ? !canWriteApp(actor, role.appId) : false;
  });
  const finalRoleIds = Array.from(new Set([...kept, ...submitted]));
  const ignored = target.roleIds.filter(id => !finalRoleIds.includes(id));
  return { finalRoleIds, ignored };
}

/**
 * 校验一批「要授予的角色」是否在操作者权限内（新建用户 / 批量授权用）
 *
 * @param {object} actor 操作者画像
 * @param {number[]} roleIds 角色 ID
 * @throws {Error} `FORBIDDEN:xxx`
 */
async function assertGrantable(actor, roleIds) {
  const ids = Array.from(new Set((roleIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
  if (ids.length === 0) return;
  const roles = await loadRoles(ids);
  if (roles.size !== ids.length) throw new Error('INVALID_PARAM:提交的角色不存在或已被删除');
  assertGrantableRoles(actor, roles);
}

/**
 * 校验一批「要授予的角色」（纯函数版：角色已查好）
 *
 * @param {object} actor 操作者画像
 * @param {Map<number, object>} roles 角色 id → 角色摘要
 * @throws {Error} `FORBIDDEN:xxx`
 */
function assertGrantableRoles(actor, roles) {
  for (const role of roles.values()) {
    if (!canWriteApp(actor, role.appId)) {
      throw new Error(`FORBIDDEN:无权授予其它应用的角色「${role.name}」`);
    }
    if (!actor.isSuper && role.rank >= actor.maxRank) {
      throw new Error(`FORBIDDEN:不能授予「${role.name}」—— 该角色职级不低于你自己`);
    }
  }
}

/**
 * 校验「能不能改这个角色本身」（角色管理页）
 *
 * @param {object} actor 操作者画像
 * @param {object} role 角色摘要
 * @param {string} [action='编辑'] 动作名
 * @throws {Error} `FORBIDDEN:xxx`
 */
function assertCanManageRole(actor, role, action = '编辑') {
  if (role.isSuper && !actor.isSuper) {
    throw new Error(`FORBIDDEN:只有超级管理员可以${action}超级管理员角色`);
  }
  if (!canWriteApp(actor, role.appId)) {
    throw new Error(`FORBIDDEN:不能${action}其它应用（${appLabel(role.appId)}）的角色`);
  }
  if (!actor.isSuper && role.rank >= actor.maxRank) {
    throw new Error(`FORBIDDEN:不能${action}职级不低于你自己的角色`);
  }
}

/**
 * 操作者是否**覆盖**某个权限码（自己持有，且没被自己的 deny 压住）
 *
 * 与接口鉴权同一套判据（`allows` 命中 + `denies` 优先），并复用共享的通配匹配
 * （`wildcard-match.js` 是单一来源）—— 这里再写一份前缀比较就会出现
 * "授权时算有、调接口时算没有"的错位。
 *
 * @param {{allows?: string[], denies?: string[]}} permissions PBAC 权限集
 * @param {string} code 待判定权限码
 * @returns {boolean} 是否覆盖
 */
function coversPermissionCode(permissions, code) {
  const allows = Array.isArray(permissions?.allows) ? permissions.allows : [];
  const denies = Array.isArray(permissions?.denies) ? permissions.denies : [];
  // deny 优先：被自己策略压过的码不算"持有"，否则等于允许他把受限能力转授出去
  if (denies.some(pattern => isWildcardMatch(pattern, code))) return false;
  return allows.some(pattern => isWildcardMatch(pattern, code));
}

/**
 * 操作者是否不受「授予上限」约束
 *
 * 超管与 `admin:*` / `*` 持有者是后台的最高授权方：他们本来就能改任意应用的角色，
 * 若也要求"只能授自己有的码"，admin_admin 会因为不持有 `posecraft:*` 而无法维护
 * 其它应用的业务角色 —— 那是把现有能力收紧成故障，不是安全加固。
 * 真正要挡的是 `admin_operator` 这类"能改角色、但只持有部分码"的账号：他们今天
 * 可以建一个 rank 更低的角色、往里写 `admin:*`，再授给自己。
 *
 * @param {object} user request.state.user
 * @returns {boolean} 是否免检
 */
function isUnrestrictedGranter(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes(SUPER_ROLE_CODE)) return true;
  const allows = Array.isArray(user?.permissions?.allows) ? user.permissions.allows : [];
  return allows.includes('*') || allows.includes(`${ADMIN_APP}:*`);
}

/**
 * 这批权限码里，哪些是操作者自己没有的
 *
 * @param {object} user request.state.user
 * @param {string[]} codes 待写入的权限码
 * @returns {string[]} 越界的码（空数组 = 全部在范围内）
 */
function codesBeyondActor(user, codes) {
  const list = Array.from(
    new Set((Array.isArray(codes) ? codes : []).filter(code => typeof code === 'string' && code.trim()))
  );
  if (isUnrestrictedGranter(user)) return [];
  return list.filter(code => !coversPermissionCode(user?.permissions, code));
}

/**
 * 授予上限：非超管只能写自己持有的码（含通配覆盖），否则 403
 *
 * 🔴 只约束**新增**的码。修改角色时表单会连原有码一起提交，若对整份清单判，
 *    "改个名字"也会因为角色里本来就有自己没持有的码而 403 —— 那是把护栏做成了路障。
 *    调用方负责先算 `新增 = 提交 − 原有`，再把差额交给这里。
 *
 * @param {object} user request.state.user（含 permissions.allows/denies 与 roles）
 * @param {string[]} codes 本次**新增**的权限码
 * @param {object} [options] 选项
 * @param {string} [options.action='授予'] 动作名，用于错误文案（"授予" / "创建"）
 * @throws {Error} `FORBIDDEN:xxx`（由 withFail 翻译成 403）
 */
function assertCanGrantCodes(user, codes, { action = '授予' } = {}) {
  const beyond = codesBeyondActor(user, codes);
  if (beyond.length === 0) return;
  const shown = beyond.slice(0, 5).join('、');
  const more = beyond.length > 5 ? ` 等 ${beyond.length} 个` : '';
  throw new Error(`FORBIDDEN:不能${action}自己没有的权限码（${shown}${more}）`);
}

export {
  GLOBAL_APP,
  SUPER_ROLE_CODE,
  appLabel,
  loadRoles,
  activeRoleIds,
  getActorScope,
  getTargetScope,
  canWriteApp,
  assertCanManageUser,
  planRoleChange,
  planRoleChangeWithRoles,
  assertGrantable,
  assertGrantableRoles,
  assertCanManageRole,
  assertCanGrantCodes
};
