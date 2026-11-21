/**
 * 行级数据范围（数据权限）解析与应用
 *
 * 与 PBAC policy 的分工必须说清，否则会写出"看着安全其实没有"的代码：
 * - **policy**：能不能调这个接口（动作级）；
 * - **data scope**：调通之后，能看到哪些**行**（数据级）。
 *
 * 五档语义（与参考实现一致，便于运维迁移心智）：
 *   1 全部 / 2 自定义（`iam_role_dept`）/ 3 本部门 / 4 本部门及以下 / 5 仅本人
 *
 * 🔴 多角色取**并集**，且"全部"一票通过 —— 但"没有角色"取 **SELF** 而不是全部：
 *    无角色账号本来就不该看到任何别人的数据，默认放宽是最危险的方向。
 *
 * 🔴 过滤必须在 SQL 层做（`where` 注入），不能只在前端隐藏入口 ——
 *    前端隐藏挡不住直接调接口。
 *
 * 🔴 除部门外还有**应用维度**（`iam_role_app`）："只看某个应用的账号"不可能用
 *    dept_id 表达，也不是角色所属 app（那是动作域）。两个维度同时存在时取交集。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { getModel } from '../../../../framework/persistence/db/index.js';
import Logger from '../../../../framework/support/log/index.js';

/** 公共角色的伪应用标识（`UserRole.app_id = 'GLOBAL'`） */
const GLOBAL_APP = 'GLOBAL';

/** 超管角色编码（应用维度豁免） */
const SUPER_ROLE_CODE = 'superadmin';

/** 数据范围取值 */
const DATA_SCOPE = { ALL: 1, CUSTOM: 2, DEPT: 3, DEPT_TREE: 4, SELF: 5 };

/**
 * 取用户当前生效的角色 ID
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<number[]>} 角色 ID 列表
 */
async function activeRoleIds(userId) {
  const rows = await getModel('UserRole').findAll({
    where: { user_id: Number(userId), delete_version: 0 },
    attributes: ['role_id'],
    raw: true
  });
  return rows.map(row => Number(row.role_id)).filter(id => id > 0);
}

/**
 * 部门子树（含自身）
 *
 * @param {Set<number>} seeds 起始部门
 * @returns {Promise<number[]>} 部门 ID 列表
 */
async function subtreeOf(seeds) {
  if (seeds.size === 0) return [];
  const rows = await getModel('SysDept').findAll({ attributes: ['id', 'parent_id'], raw: true });
  const children = new Map();
  for (const row of rows) {
    const parent = Number(row.parent_id || 0);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(Number(row.id));
  }
  const out = new Set();
  const stack = [...seeds];
  while (stack.length > 0) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return [...out];
}

/**
 * 角色配置的数据可见应用（应用维度）
 *
 * 🔴 **fail-closed**：角色一条 `iam_role_app` 都没配时返回**空数组**，
 * 意思是"没有授权任何应用的数据" —— 不是"不限应用"。这是刻意的：
 * 数据范围是收敛项，默认放开（旧行为）等于给每个新角色发了一张全量通行证，
 * 而管理员往往意识不到自己"没配"就等于"全都能看"。
 *
 * 三种返回值：
 *   · `string[]` 有值 → 只能用这些应用的数据（可能与角色应用域取交集后更小）；
 *   · `[]`        没配 → 一个应用都不许看（fail-closed）；
 *   · `null`      仅用于**表/模型不可用**的降级（漏迁移时不该把全站锁死）。
 *
 * 多角色取并集 —— 与部门档的"并集"语义一致。
 *
 * @param {number[]} roleIds 角色的角色 ID
 * @returns {Promise<string[]|null>} 应用标识集合
 */
async function dataAppIdsOf(roleIds) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) return null;
  try {
    const RoleApp = getModel('RoleApp');
    if (!RoleApp) return null;
    const rows = await RoleApp.findAll({
      where: { role_id: roleIds },
      attributes: ['app_id'],
      raw: true
    });
    // 去重后原样返回：空数组就是空数组（fail-closed），不要兜成 null
    return [...new Set(rows.map(row => String(row.app_id || '').trim()).filter(Boolean))];
  } catch (err) {
    // 表还没迁移 / 模型没注册：降级为"不限"，否则一次漏迁移就把所有人锁在门外
    Logger.warn(`[DataScope] 应用范围读取失败，按不限处理: ${err?.message}`);
    return null;
  }
}

/**
 * 解析某用户的数据范围
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<{mode: 'all'|'depts'|'self', deptIds: number[]|null}>}
 *   `all` 不过滤；`depts` 按部门集合过滤；`self` 只能看自己
 */
async function resolveDataScope(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return { mode: 'self', deptIds: null, actorDeptId: null, appIds: null };

  const roleIds = await activeRoleIds(id);
  if (roleIds.length === 0) return { mode: 'self', deptIds: null, actorDeptId: null, appIds: null };

  // 应用维度与部门维度并列：先算一次，后面每个分支都带上（读/写共用同一份判据）
  const appIds = await dataAppIdsOf(roleIds);

  const Role = getModel('Role');
  const roles = await Role.findAll({
    where: { id: roleIds, delete_version: 0 },
    attributes: ['id', 'data_scope', 'code'],
    raw: true
  });
  /*
   * 超管豁免应用维度：`role_app` 没配时超管会被空集一并挡在门外（列表直接空），
   * 而他恰恰是唯一能把配置改回来的人 —— 这里必须给 `null`（不限）。
   */
  if (roles.some(role => String(role.code) === SUPER_ROLE_CODE)) {
    return { mode: 'all', deptIds: null, actorDeptId: null, appIds: null };
  }
  const scopes = roles.map(role => Number(role.data_scope || DATA_SCOPE.ALL));
  if (scopes.length === 0) return { mode: 'self', deptIds: null, actorDeptId: null, appIds };
  if (scopes.includes(DATA_SCOPE.ALL)) return { mode: 'all', deptIds: null, actorDeptId: null, appIds };

  // 自己的部门：本部门 / 本部门及以下都从它出发
  const me = await getModel('User').findByPk(id, { attributes: ['id', 'dept_id'], raw: true });
  const myDeptId = Number(me?.dept_id || 0);

  const allowed = new Set();
  // 自定义：取角色关联的部门，并向下展开 —— "能看这个部门"必然意味着"能看它的子部门"，
  // 否则部门树会出现"父节点可见、子节点消失"的断枝。
  const customRoles = roles.filter(role => Number(role.data_scope) === DATA_SCOPE.CUSTOM).map(role => Number(role.id));
  if (customRoles.length > 0) {
    const rows = await getModel('RoleDept').findAll({
      where: { role_id: customRoles },
      attributes: ['dept_id'],
      raw: true
    });
    for (const deptId of await subtreeOf(new Set(rows.map(row => Number(row.dept_id)).filter(n => n > 0)))) {
      allowed.add(deptId);
    }
  }
  if (myDeptId > 0) {
    if (scopes.includes(DATA_SCOPE.DEPT)) allowed.add(myDeptId);
    if (scopes.includes(DATA_SCOPE.DEPT_TREE)) {
      for (const deptId of await subtreeOf(new Set([myDeptId]))) allowed.add(deptId);
    }
  }

  if (allowed.size === 0) return { mode: 'self', deptIds: null, actorDeptId: myDeptId || null, appIds };
  return { mode: 'depts', deptIds: [...allowed], actorDeptId: myDeptId || null, appIds };
}

/**
 * 合并「角色应用域」与「数据范围应用维度」
 *
 * 两个来源语义不同，但落到查询上是同一件事：目标用户必须在这些应用下**有角色**。
 * 都配了就取交集（更严者胜），任一侧为 `null` 表示该侧不限。
 *
 * 返回 `null` = 不过滤；返回数组（**可能是空数组**）= 按它过滤。
 *
 * 🔴 空数组 = "一条也看不到"，绝不等于"不参与"：fail-closed 的整个语义都压在这一行上。
 *    `dataAppIds = []`（角色没配应用）必须收敛成空集，不能被当成"这一侧不限制"。
 *    只有 `null`（表不可用 / 超管）才表示"这一侧不参与"。
 *
 * @param {string[]|null} scopeAppIds 角色应用域（null = 不限）
 * @param {string[]|null} dataAppIds 数据范围的应用维度（null / 空数组 = 不限）
 * @returns {string[]|null} 合并结果
 */
function mergeAppScopes(scopeAppIds, dataAppIds) {
  const data = Array.isArray(dataAppIds) ? dataAppIds.map(String).filter(Boolean) : null;
  // 不参与（表不可用 / 超管）：完全听角色应用域
  if (!data) return Array.isArray(scopeAppIds) ? scopeAppIds : null;
  // fail-closed：角色没配应用 → 一个都不许看，直接短路，不和应用域取交集
  if (data.length === 0) return [];

  /*
   * `GLOBAL` 是**追加项**，不参与和应用域取交集。
   *
   * 它代表"只有全局角色的账号"（会员等级一类，`Role.app_id = 'GLOBAL'`），
   * 这类账号挂在任何具体应用下都搜不到，必须单独放行。
   * 拿它去和 `actor.apps`（只含具体应用）取交集的话，永远被过滤成空 ——
   * 那等于这个选项勾了没用。
   */
  const wantsGlobal = data.includes(GLOBAL_APP);
  const concrete = data.filter(app => app !== GLOBAL_APP);

  let merged;
  if (!Array.isArray(scopeAppIds)) {
    merged = concrete;
  } else {
    const allowed = new Set(concrete);
    merged = scopeAppIds.map(String).filter(app => allowed.has(app));
  }
  if (wantsGlobal) merged = [...new Set([...merged, GLOBAL_APP])];
  return merged;
}

/**
 * 生成用户表的行级过滤条件
 *
 * `self` 用 `id = 自己`；`depts` 用 `dept_id IN (...)`，集合为空时给一个不可能命中的值，
 * 而不是省掉条件 —— 省掉就等于"看全部"，方向正好相反。
 *
 * @param {{mode: string, deptIds: number[]|null}} scope 数据范围
 * @param {number} actorId 操作者 ID
 * @returns {object} Sequelize where 片段
 */
function userScopeWhere(scope, actorId) {
  if (!scope || scope.mode === 'all') return {};
  if (scope.mode === 'self') return { id: Number(actorId) };
  const ids = (scope.deptIds ?? []).filter(n => Number.isInteger(n) && n > 0);
  return { dept_id: ids.length > 0 ? ids : [-1] };
}

/**
 * 校验「能不能把用户写进这个部门」
 *
 * 读与写的范围必须是同一套：列表用 `userScopeWhere` 过滤，所以部门管理员只能看见
 * 自己部门的人；如果**写**不校验，他就可以往看不见的部门里建账号 —— 那是"凭空造人"，
 * 而且新账号立刻从他的列表里消失，谁都发现不了。批量导入尤其明显：一张 CSV 能一次
 * 塞 500 个。
 *
 * 三档语义（与 `userScopeWhere` 一一对应）：
 *   · `all`   → 不限；
 *   · `depts` → 必须指定部门，且落在 `deptIds` 里（含子部门，已在下游展开）；
 *   · `self`  → 拒绝：数据范围只有本人的人，本来就不该有创建他人的能力。
 *
 * 刻意**不允许**"不填部门"绕过：`dept_id IS NULL` 的用户不属于任何部门，
 * 部门管理员既看不见也管不了，等于留了一个无人认领的账号。
 *
 * @param {{mode: string, deptIds: number[]|null}} scope 数据范围
 * @param {number|null} deptId 目标部门 ID
 * @param {object} [options] 提示文案上下文
 * @param {string} [options.action='创建'] 动作名（"导入"/"创建"）
 * @returns {void}
 * @throws {Error} `FORBIDDEN:xxx` / `INVALID_PARAM:xxx`
 */
function assertDeptWritable(scope, deptId, { action = '创建' } = {}) {
  if (!scope || scope.mode === 'all') return;

  if (scope.mode === 'self') {
    throw new Error(`FORBIDDEN:你的数据范围仅限本人，不能${action}他人账号`);
  }

  const target = Number(deptId);
  if (!Number.isInteger(target) || target <= 0) {
    throw new Error(`INVALID_PARAM:请填写部门 —— 你的数据范围限定在若干部门内，不能${action}无所属部门的账号`);
  }

  const allowed = new Set((scope.deptIds ?? []).map(Number));
  if (!allowed.has(target)) {
    throw new Error('FORBIDDEN:该部门不在你的数据范围内');
  }
}

/**
 * 剪枝部门树（只留下范围内的部门）
 *
 * 父节点不在范围内时整枝丢弃：留下孤儿子节点会让树"从中间开始"，读者无法定位。
 *
 * @param {Array<object>} nodes 部门树
 * @param {{mode: string, deptIds: number[]|null}} scope 数据范围
 * @param {number} actorDeptId 操作者部门（self 时只留它）
 * @returns {Array<object>} 剪枝后的树
 */
function filterDeptTree(nodes, scope, actorDeptId) {
  if (!scope || scope.mode === 'all') return nodes;
  const allowed =
    scope.mode === 'self' ? new Set([Number(actorDeptId || 0)]) : new Set((scope.deptIds ?? []).map(Number));
  const walk = list =>
    list.filter(node => allowed.has(Number(node.id))).map(node => ({ ...node, children: walk(node.children ?? []) }));
  return walk(nodes);
}

/**
 * 日志表的行级过滤片段（拼接在既有 whereSql 之后）
 *
 * 日志只有 `user_id`，没有 `dept_id`，所以部门档要走子查询
 * `user_id IN (SELECT id FROM user_user WHERE dept_id IN (...))`。
 *
 * 这里直接内联整数而不是走 replacements：deptIds 全部来自 `Number()` + `Number.isInteger`
 * 过滤过的库内数据，且调用点用的是同一个 `replacements` 对象（多个片段共用会互相覆盖键名）。
 * 即便将来有人改坏，`filter(n => Number.isInteger(n) && n > 0)` 也会把注入串挡在外面。
 *
 * @param {{mode: string, deptIds: number[]|null}} scope 数据范围
 * @param {number} actorId 操作者 ID
 * @param {string} alias 日志表别名（a / l）
 * @returns {string} 形如 ` AND a.user_id = 3`；`all` 档返回空串
 */
function logScopeSql(scope, actorId, alias) {
  if (!scope || scope.mode === 'all') return '';
  if (scope.mode === 'self') return ` AND ${alias}.user_id = ${Number(actorId)}`;
  const ids = (scope.deptIds ?? []).filter(n => Number.isInteger(n) && n > 0);
  // 集合为空时用 -1：省掉条件就等于"看全部"，方向正好相反
  const list = ids.length > 0 ? ids.join(',') : '-1';
  return ` AND ${alias}.user_id IN (SELECT id FROM user_user WHERE dept_id IN (${list}))`;
}

/**
 * 该角色编码是否允许配置"非仅本人"的数据范围
 *
 * 只有**需要看别人数据**的三类角色才给这个口子：
 *   · 管理员 `*_admin`（含 `superadmin`）
 *   · 审核员 `*_operator`
 *   · 观察者 `*_viewer`
 *
 * 其余角色（`*_user` / `*_vip` / `*_creator` / `user_normal` / 自定义编码）一律「仅本人」——
 * 这条规则的作用是堵住"建个角色顺手勾个『全部数据』"这条最短的越权路径。
 *
 * @param {string} code 角色编码
 * @returns {boolean} 是否可配
 */
function isScopeConfigurable(code) {
  const value = String(code || '').trim();
  if (!value) return false;
  if (value === 'superadmin') return true;
  return /^.+_(admin|operator|viewer)$/.test(value);
}

/**
 * 校验角色只能用「仅本人」
 *
 * @param {string} code 角色编码
 * @param {number|null|undefined} dataScope 提交的数据范围
 * @returns {void}
 * @throws {Error} 非白名单角色提交了非 5 的档位
 */
function assertScopeConfigurable(code, dataScope) {
  if (dataScope === undefined || dataScope === null) return;
  if (Number(dataScope) === DATA_SCOPE.SELF) return;
  if (isScopeConfigurable(code)) return;
  throw new Error(`INVALID_PARAM:角色「${code}」的数据范围只能是「仅本人」（只有管理员 / 审核员 / 观察者可配置范围）`);
}

export {
  DATA_SCOPE,
  isScopeConfigurable,
  assertScopeConfigurable,
  resolveDataScope,
  userScopeWhere,
  mergeAppScopes,
  GLOBAL_APP,
  assertDeptWritable,
  filterDeptTree,
  subtreeOf,
  activeRoleIds,
  dataAppIdsOf,
  logScopeSql
};
