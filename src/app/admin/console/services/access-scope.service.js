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
 *   4. 提权闸：新增角色的**授予门槛**（`iam_role.rank_level`）必须低于自己的职级
 *      （超管例外），防止用"授予"绕过 1/2。门槛是角色的属性，不是持有者的层级
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
import { getModel } from '../../../../framework/persistence/db/index.js';
import { listAppConfigs } from '../../../../framework/config/app-registry.js';
import { isWildcardMatch } from '../../../../framework/security/auth/permission/wildcard-match.js';
import { resolveDataScope } from './data-scope.service.js';

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
 * 🔴 **职级来自人，不来自角色**（2026-11-19 拆分）：
 *    - `User.rank_level`：这个人能管多高的人（组织层级）；
 *    - `Role.rank_level`：这个角色值多少级，只用于**授予检查**（`assertGrantable`）。
 *    此前两者共用一个字段，导致"授一个高角色"等于顺手给人升职 —— 副作用不可见。
 *
 * 兼容兜底：用户职级为 0 但持有角色时，回落到"角色最高 rank"。
 * 这是给尚未回填的历史数据留的（`migrations/user/20261119000001`），
 * 回填完成后两者相等，兜底自然失效 —— 否则升级当天所有人会突然"谁都管不了"。
 *
 * @param {number[]} roleIds 角色 ID
 * @param {number|null} [userId] 用户 ID（不传则无法读到人员职级，回落角色最高值）
 * @returns {Promise<object>} 画像
 */
async function describe(roleIds, userId = null) {
  const roles = await loadRoles(roleIds);
  const list = [...roles.values()];
  const apps = new Set(list.map(r => r.appId).filter(app => app !== GLOBAL_APP));
  const roleMaxRank = list.reduce((max, r) => Math.max(max, r.rank), 0);

  let rankLevel = 0;
  if (userId) {
    // 直接读模型而不是走 userDao：判据层要保持依赖轻（userDao 会拖进 auth / grant 一整条链，
    // 单测里一 mock 就崩）。这类"判据自身的读取"在边界守卫里是允许保留的。
    const row = await getModel('User').findByPk(Number(userId), {
      attributes: ['rank_level'],
      raw: true
    });
    rankLevel = Number(row?.rank_level) || 0;
  }
  const maxRank = rankLevel > 0 ? rankLevel : roleMaxRank;

  return {
    roleIds: list.map(r => r.id),
    roles,
    apps,
    /** 人员职级（权威值；未回填时为 0） */
    rankLevel,
    /** 角色集合里的最高权重（只用于诊断与兜底） */
    roleMaxRank,
    /** 判定用的职级：优先人员职级，历史数据回落到角色最高值 */
    maxRank,
    isSuper: list.some(r => r.isSuper),
    // 持有管理后台角色 = 跨应用管理员（见文件头）
    crossApp: list.some(r => r.appId === ADMIN_APP)
  };
}

/**
 * 操作者的可管理范围
 *
 * `dataScope` 一并解析出来：读路径（列表 / 导出 / 日志）用它过滤行，
 * 写路径（编辑 / 冻结 / 删除）也必须用同一份判据 —— 否则会出现
 * "列表里看不见、直接调接口却改得到"的越权链。
 *
 * @param {number} operatorId 操作者用户 ID
 * @returns {Promise<object>} 角色画像 + `dataScope`
 */
async function getActorScope(operatorId) {
  const scope = await describe(await activeRoleIds(operatorId), operatorId);
  scope.dataScope = await resolveDataScope(operatorId);
  return scope;
}

/**
 * 目标用户的当前状态
 *
 * `deptId` 供数据范围判定使用：`describe()` 只算角色画像（apps / maxRank），
 * 不含部门 —— 而"能不能碰这个部门的人"必须看目标自己的部门。
 *
 * @param {number} userId 目标用户 ID
 * @returns {Promise<object>} 角色画像 + `deptId`
 */
async function getTargetScope(userId) {
  const scope = await describe(await activeRoleIds(userId), userId);
  try {
    const row = await getModel('User').findByPk(Number(userId), { attributes: ['dept_id'], raw: true });
    scope.deptId = row?.dept_id ? Number(row.dept_id) : null;
  } catch (err) {
    // 查不到部门时按"无部门"处理：数据范围判定会 fail-closed，不会因此放宽
    scope.deptId = null;
    void err;
  }
  return scope;
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
   * 给它设一个"管不了的人"只会把风险推到改库上。
   *
   * 🔴 防自锁改由「不能修改自己账号的角色」兜底（见 `users.js` 的编辑接口）：
   *    超管可以改别人的角色，但改不了自己的，所以不存在"把自己摘空"的路径。
   */
  if (actor.isSuper) return;

  if (target.maxRank >= actor.maxRank) {
    const label = target.isSuper ? '超级管理员' : `同级或更高级管理员（职级 ${target.maxRank}）`;
    throw new Error(`FORBIDDEN:不能${action}${label}，管理员之间不能互相修改`);
  }

  /*
   * 数据范围（行级）：看得见的才管得到
   *
   * 读路径（列表 / 导出 / 日志）早就按 `dataScope` 过滤了，写路径原来完全不看 ——
   * 于是"列表里看不见的人，直接调接口却改得到"。这里把**同一份判据**接到写路径：
   *   · `self`（仅本人）  → 不允许操作任何他人账号；
   *   · `depts`（本部门 / 及以下 / 自定义）→ 目标部门必须落在范围内；
   *   · `appIds`（应用维度，独立于档位）→ 目标必须在被授权的应用下**有角色**。
   *
   * 目标没有部门按 fail-closed 处理：空部门的人不属于任何人的范围，
   * 只有超管（上面已 return）能管。应用维度同理，`apps` 不含 GLOBAL。
   */
  const scope = actor.dataScope;
  if (scope) {
    if (scope.mode === 'self') {
      throw new Error(`FORBIDDEN:你的数据范围仅限本人，不能${action}他人账号`);
    }
    if (scope.mode === 'depts') {
      const allowed = new Set((scope.deptIds ?? []).map(Number));
      if (!target.deptId || !allowed.has(Number(target.deptId))) {
        throw new Error(`FORBIDDEN:该用户不在你的数据范围内，不能${action}`);
      }
    }
    /*
     * 🔴 空数组**也要拦**（fail-closed）：角色一条 `iam_role_app` 都没配 =
     *    "没有授权任何应用的数据"，不是"不限应用"。只有 `null`（超管 / 表不可用）
     *    才跳过这一段 —— 这一行是 fail-closed 与"默认放开"的分水岭。
     */
    if (Array.isArray(scope.appIds)) {
      if (scope.appIds.length === 0) {
        throw new Error(`FORBIDDEN:你的数据范围未授权任何应用，不能${action}他人账号`);
      }
      const apps = new Set(scope.appIds.map(String));
      // `target.apps` 已排除 GLOBAL（见 describe），所以"apps 为空"= 只有全局角色
      const targetApps = [...(target.apps ?? [])].map(String);
      const hit =
        targetApps.some(app => apps.has(app)) ||
        // 勾了 GLOBAL ⇒ 这类账号也归你管；没勾就仍然够不着
        (targetApps.length === 0 && apps.has(GLOBAL_APP));
      if (!hit) {
        throw new Error(`FORBIDDEN:该用户不在你被授权的应用范围内，不能${action}`);
      }
    }
  }

  if (!actor.crossApp) {
    const mine = [...actor.apps];
    const targetApps = [...(target.apps ?? [])];
    /*
     * 只有全局角色的账号**没有应用归属**，这里不该按"别家应用"处理 ——
     * 能不能碰已经由上面数据范围的 GLOBAL 开关判过了（勾了才走得到这里）。
     * 不豁免的话，勾了 GLOBAL 也照样被这一条拦死。
     */
    const globalOnly = targetApps.length === 0;
    const overlapped = targetApps.some(app => actor.apps.has(app));
    if (!globalOnly && mine.length > 0 && !overlapped) {
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

  // 2. 提权闸：新增角色的授予门槛必须严格低于自己的职级（超管不受限）
  if (!actor.isSuper) {
    for (const role of submittedRoles.values()) {
      if (before.has(role.id)) continue;
      if (role.rank >= actor.maxRank) {
        throw new Error(
          `FORBIDDEN:不能授予「${role.name}」—— 该角色的授予门槛是 ${role.rank}，不低于你的职级（${actor.maxRank}）`
        );
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
/**
 * 校验「能不能给人设这个职级」
 *
 * 规则与「能不能管这个人」同一条线：**职级必须严格低于自己**。
 * 否则会出现"我把自己人提到和我同级，从此谁也管不了谁"的空洞。
 *
 * 超管例外：99 是他的天然上限，再往上没有意义，也不需要拦。
 *
 * @param {object} actor 操作者画像（用 `maxRank`）
 * @param {number} nextRank 要设置的人员职级
 * @param {object} [options] 选项
 * @param {string} [options.action='设置职级'] 动作名（拼进错误文案）
 * @throws {Error} `INVALID_PARAM:` / `FORBIDDEN:`
 */
function assertCanSetRank(actor, nextRank, { action = '设置职级' } = {}) {
  const target = Number(nextRank);
  if (!Number.isInteger(target) || target < 0 || target > 99) {
    throw new Error('INVALID_PARAM:职级必须是 0-99 的整数');
  }
  if (actor?.isSuper) return;
  const mine = Number(actor?.maxRank ?? 0);
  if (target >= mine) {
    throw new Error(`FORBIDDEN:不能${action}为 ${target} —— 不能设置为不低于你自己的职级（${mine}）`);
  }
}

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
      throw new Error(
        `FORBIDDEN:不能授予「${role.name}」—— 该角色的授予门槛是 ${role.rank}，不低于你的职级（${actor.maxRank}）`
      );
    }
  }
}

/**
 * 角色为什么不能被当前操作者管理（空串 = 可以管理）
 *
 * 四条闸，顺序即提示优先级：
 *   ① 超级管理员角色 —— 固定全权限，**谁都不需要也不应该编辑它**（含超管自己）。
 *      policy 是 `*`、菜单是整棵树，界面改出来的任何差异都会被下次启动的
 *      `defineRoles` 覆盖，或者干脆改出一个人人可提权的漏洞。
 *   ② 自己所属的角色 —— 自己改自己等于自我提权 / 自我削权，必须由职级更高的人操作。
 *   ③ 应用域：只能管自己应用（或 GLOBAL）的角色。
 *   ④ 职级：必须**严格低于**操作者，同级也不行。
 *
 * 列表的 `manageable` 与写接口的 `assertCanManageRole` 都从这里出结论 ——
 * 一处判据，避免"界面能点、接口 403"或反之。
 *
 * @param {object} actor 操作者画像（`getActorScope`）
 * @param {object} role 角色摘要（`id` / `isSuper` / `appId` / `rank`）
 * @returns {string} 不能管理的原因；空串表示可管理
 */
function roleManageBlock(actor, role) {
  if (role.isSuper) return '超级管理员角色固定为全部权限，无需编辑';
  const selfIds = new Set((actor?.roleIds || []).map(Number));
  if (role.id != null && selfIds.has(Number(role.id))) {
    return '不能修改自己所属的角色，请让职级更高的管理员操作';
  }
  if (!canWriteApp(actor, role.appId)) return `不在你的应用域（${appLabel(role.appId)}）`;
  if (!actor.isSuper && Number(role.rank) >= Number(actor.maxRank)) {
    return `该角色职级（${role.rank}）不低于你的职级（${actor.maxRank}）`;
  }
  return '';
}

/**
 * 当前操作者能否管理该角色（列表/按钮置灰用）
 *
 * @param {object} actor 操作者画像
 * @param {object} role 角色摘要
 * @returns {boolean} 是否可管理
 */
function isRoleManageable(actor, role) {
  return roleManageBlock(actor, role) === '';
}

/**
 * 校验「能不能改这个角色本身」（角色管理页）
 *
 * 判据与列表的 `manageable` 同一个函数（`roleManageBlock`），所以界面上灰掉的按钮，
 * 接口也确实调不通。
 *
 * @param {object} actor 操作者画像
 * @param {object} role 角色摘要（`id` / `isSuper` / `appId` / `rank`）
 * @param {string} [action='编辑'] 动作名
 * @throws {Error} `FORBIDDEN:xxx`
 */
function assertCanManageRole(actor, role, action = '编辑') {
  const reason = roleManageBlock(actor, role);
  if (reason) throw new Error(`FORBIDDEN:不能${action}该角色 —— ${reason}`);
}

/**
 * 校验「新职级能不能这么填」——必须**严格低于**操作者自己的最高职级
 *
 * 与 `assertCanManageRole` 是同一根线：职级是"能不能动谁"的闸。原来的写接口只判
 * `> 自己`，于是可以把一个角色设成**与自己同级**；而同级的角色在列表里是
 * `manageable: false`（不许我编辑）、在授予侧也是 `rank >= maxRank` 直接拒 ——
 * 唯独"填表时"漏成 `>`，结果是能造出一个**谁也管不到**的角色，只能超管来收拾。
 *
 * 超管不豁免：99 是**代码声明角色的位置**（`superadmin`、posecraft 的 poseadmin 都在 99），
 * 它们随应用启动由 `defineRoles` 落库，不经过这条接口。若允许超管从界面再立一个 99，
 * 等于凭空多出一个和它们平级的角色，而这类角色没人管得动 —— 只能连数据库收拾。
 *
 * 非数值入参直接放过：形状由路由 schema 管，这里不重复校验，免得两处报错不一致。
 *
 * @param {number|string} nextRank 待写入的职级
 * @param {object} actor 操作者画像（用 `maxRank`）
 * @param {string} [action='设置'] 动作名（"设置"/"调整"）
 * @throws {Error} `FORBIDDEN:xxx`
 */
function assertRankBelowActor(nextRank, actor, action = '设置') {
  const next = Number(nextRank);
  if (!Number.isFinite(next)) return;
  const mine = Number(actor?.maxRank ?? 0);
  if (next < mine) return;
  throw new Error(`FORBIDDEN:不能把职级${action}为 ${next} —— 必须低于你自己的最高职级 ${mine}`);
}

/**
 * 编辑角色时的职级校验：只在**值真的变了**的时候判
 *
 * 为什么不让路由自己写 `if (next !== current)`：这条豁免很容易被"顺手简化"掉 ——
 * 一旦每次保存都判 `>=`，编辑弹窗（会连未改字段一起回传）连"改个名字"都会被拒，
 * 表现为"点保存没反应，只弹一句职级不够"。把判定收在这里，路由只剩一行调用，
 * 想改也只能改这一处，且下面有测试钉着。
 *
 * @param {number|undefined} nextRank 提交的职级（未提交 = undefined）
 * @param {number} currentRank 角色当前职级
 * @param {object} actor 操作者画像
 * @throws {Error} `FORBIDDEN:xxx`
 */
function assertRankChangeAllowed(nextRank, currentRank, actor) {
  if (nextRank === undefined || nextRank === null) return;
  if (Number(nextRank) === Number(currentRank)) return;
  assertRankBelowActor(nextRank, actor, '调整');
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
 * 某个权限码是否被操作者自己的策略**显式拒绝**
 *
 * 单独抽出来是为了让"deny 优先"能用在 `coversPermissionCode` 之外的地方：
 * 例如"能不能看见某个应用"这种判据，除了看 allows 还要看有没有被 deny 压过 ——
 * 而 `isUnrestrictedGranter` 只回答"是不是最高授权方"，不回答"这个码是否被禁"。
 *
 * @param {{allows?: string[], denies?: string[]}} permissions PBAC 权限集
 * @param {string} code 待判定权限码
 * @returns {boolean} 是否被显式拒绝
 */
function isCodeDenied(permissions, code) {
  const denies = Array.isArray(permissions?.denies) ? permissions.denies : [];
  return denies.some(pattern => isWildcardMatch(pattern, code));
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
  assertCanSetRank,
  planRoleChange,
  planRoleChangeWithRoles,
  assertGrantable,
  assertGrantableRoles,
  assertCanManageRole,
  roleManageBlock,
  isRoleManageable,
  assertRankBelowActor,
  assertRankChangeAllowed,
  assertCanGrantCodes,
  coversPermissionCode,
  isCodeDenied,
  isUnrestrictedGranter
};
