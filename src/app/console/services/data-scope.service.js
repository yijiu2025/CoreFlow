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
 * @author yijiu2025
 * @since 2026-11-12
 */
import { getModel } from '../../../framework/persistence/db/index.js';

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
 * 解析某用户的数据范围
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<{mode: 'all'|'depts'|'self', deptIds: number[]|null}>}
 *   `all` 不过滤；`depts` 按部门集合过滤；`self` 只能看自己
 */
async function resolveDataScope(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return { mode: 'self', deptIds: null, actorDeptId: null };

  const roleIds = await activeRoleIds(id);
  if (roleIds.length === 0) return { mode: 'self', deptIds: null, actorDeptId: null };

  const Role = getModel('Role');
  const roles = await Role.findAll({
    where: { id: roleIds, delete_version: 0 },
    attributes: ['id', 'data_scope'],
    raw: true
  });
  const scopes = roles.map(role => Number(role.data_scope || DATA_SCOPE.ALL));
  if (scopes.length === 0) return { mode: 'self', deptIds: null, actorDeptId: null };
  if (scopes.includes(DATA_SCOPE.ALL)) return { mode: 'all', deptIds: null, actorDeptId: null };

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

  if (allowed.size === 0) return { mode: 'self', deptIds: null, actorDeptId: myDeptId || null };
  return { mode: 'depts', deptIds: [...allowed], actorDeptId: myDeptId || null };
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

export { DATA_SCOPE, resolveDataScope, userScopeWhere, filterDeptTree, subtreeOf, activeRoleIds, logScopeSql };
