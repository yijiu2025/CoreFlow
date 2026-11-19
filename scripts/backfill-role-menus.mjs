/**
 * 一次性补齐：按角色 policy 反推「页面授权」（sys_role_menu 的 type=menu 节点）
 *
 * 为什么需要：页面闸（`button-grant`）原本对"没配过页面授权的角色"网开一面，
 * 否则 `admin_operator` 这种"只有按钮、没有页面"的历史角色会连列表都打不开。
 * 补齐之后这个安全网才能撤掉，变成真正的硬闸。
 *
 * 判据：角色的 Allow 动作里**能匹配到某页面的 permission** ⇒ 授权该页面 + 它到根的祖先。
 *
 * 🔴 只补「**一个页面都没配过**」的角色。
 *    已经配过页面的角色视为"管理员表过态"，一律跳过 —— 否则管理员刚取消的页面
 *    会被 policy 反推回来（实测：admin_viewer 刚取消「用户管理」，按 policy 补就又加上了，
 *    等于把人的显式选择覆盖掉）。
 *
 * 只加不删：不覆盖现有授权，重复执行安全。
 *
 * 跑法：
 *   node --env-file=.env scripts/backfill-role-menus.mjs            # 预览
 *   node --env-file=.env scripts/backfill-role-menus.mjs --apply    # 执行
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { loadAllModels } from '../src/framework/persistence/db/models.js';
import { getModel } from '../src/framework/persistence/db/index.js';

const APPLY = process.argv.includes('--apply');

/**
 * 通配匹配（支持 `admin:*` 与 `admin:user:*` 这类后缀通配）
 *
 * @param {string} pattern 策略里的动作
 * @param {string} code 菜单上的权限码
 * @returns {boolean} 是否命中
 */
function matchAction(pattern, code) {
  if (!pattern || !code) return false;
  if (pattern === '*' || pattern === code) return true;
  if (!pattern.includes('*')) return false;
  const escaped = pattern
    .split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(code);
}

/**
 * 解析 policy 里所有 Allow 动作
 *
 * @param {string|object} policy 角色策略
 * @returns {string[]} 动作列表
 */
function parseAllow(policy) {
  try {
    const doc = typeof policy === 'string' ? JSON.parse(policy) : policy;
    const statements = Array.isArray(doc?.Statement) ? doc.Statement : [];
    return statements.filter(st => st?.Effect === 'Allow').flatMap(st => (Array.isArray(st.Action) ? st.Action : []));
  } catch {
    return [];
  }
}

await loadAllModels();
const Menu = getModel('console.SysMenu');
const Role = getModel('Role');
const RoleMenu = getModel('console.SysRoleMenu');

const menus = await Menu.findAll({ attributes: ['id', 'parent_id', 'permission', 'type'], raw: true });
const pages = menus.filter(m => m.type === 'menu' && m.permission);
const parentOf = new Map(menus.map(m => [Number(m.id), Number(m.parent_id)]));
const roles = await Role.findAll({ where: { delete_version: 0 }, attributes: ['id', 'code', 'policy'], raw: true });

const plan = [];
for (const role of roles) {
  const actions = parseAllow(role.policy);
  if (actions.length === 0) continue;

  const ids = new Set();
  for (const page of pages) {
    if (!actions.some(action => matchAction(action, page.permission))) continue;
    ids.add(Number(page.id));
    let parent = parentOf.get(Number(page.id));
    const guard = new Set();
    while (Number.isInteger(parent) && parent > 0 && !guard.has(parent)) {
      guard.add(parent);
      ids.add(parent);
      parent = parentOf.get(parent);
    }
  }
  if (ids.size === 0) continue;

  const existing = await RoleMenu.findAll({ where: { role_id: role.id }, attributes: ['menu_id'], raw: true });
  const have = new Set(existing.map(row => Number(row.menu_id)));

  // 已经配过页面 = 表过态，跳过（不覆盖管理员的显式选择）
  const pageIdSet = new Set(pages.map(page => Number(page.id)));
  const hasPageGrant = [...have].some(id => pageIdSet.has(id));
  if (hasPageGrant) continue;

  const add = [...ids].filter(id => !have.has(id));
  if (add.length > 0) plan.push({ role, add });
}

console.log(`模式: ${APPLY ? '执行' : '预览（加 --apply 才写库）'}`);
console.log(`涉及角色 ${plan.length} 个：\n`);
for (const { role, add } of plan) {
  const names = add
    .map(id => menus.find(m => Number(m.id) === id))
    .filter(Boolean)
    .map(m => m.permission || m.type);
  console.log(`  #${role.id} ${String(role.code).padEnd(20)} +${add.length} 条  [${names.join(', ')}]`);
}

if (!APPLY) {
  console.log('\n未写入。确认后加 --apply。');
  process.exit(0);
}

let total = 0;
for (const { role, add } of plan) {
  await RoleMenu.bulkCreate(add.map(menuId => ({ role_id: role.id, menu_id: menuId })));
  total += add.length;
}
console.log(`\n✅ 已写入 ${total} 条`);
process.exit(0);
