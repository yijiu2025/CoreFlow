/**
 * 补齐「页面授权」：按角色 policy 反推 sys_role_menu 的页面节点
 *
 * 背景：`button-grant` 的页面闸原本对"没配过页面授权的角色"网开一面，
 * 否则 `admin_operator`（有 12 个按钮、0 个页面）会连列表都打不开。
 * 补齐之后页面闸才能收口成硬闸 —— 否则"删光页面授权"等于绕过。
 *
 * 规则：
 *   · 角色的 Allow 动作能匹配到某页面的 permission ⇒ 授权该页面 + 它到根的目录；
 *   · **跳过已经配过页面的角色**（管理员表过态，不覆盖其显式取消）；
 *   · 只加不删，重复执行安全。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */

/** 通配匹配（支持 `admin:*` / `admin:user:*`） */
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

/** 解析 policy 的 Allow 动作 */
function parseAllow(policy) {
  try {
    const doc = typeof policy === 'string' ? JSON.parse(policy) : policy;
    const statements = Array.isArray(doc?.Statement) ? doc.Statement : [];
    return statements.filter(st => st?.Effect === 'Allow').flatMap(st => (Array.isArray(st.Action) ? st.Action : []));
  } catch {
    return [];
  }
}

export async function up({ queryInterface }) {
  const [menus] = await queryInterface.sequelize.query(`SELECT id, parent_id, permission, type FROM sys_menu`);
  const [roles] = await queryInterface.sequelize.query(`SELECT id, policy FROM iam_role WHERE delete_version = 0`);

  const pages = menus.filter(m => m.type === 'menu' && m.permission);
  const parentOf = new Map(menus.map(m => [Number(m.id), Number(m.parent_id)]));
  const pageIds = new Set(pages.map(p => Number(p.id)));

  for (const role of roles) {
    const actions = parseAllow(role.policy);
    if (actions.length === 0) continue;

    const [existingRows] = await queryInterface.sequelize.query(
      `SELECT menu_id FROM sys_role_menu WHERE role_id = ${Number(role.id)}`
    );
    const have = new Set(existingRows.map(row => Number(row.menu_id)));
    // 已配过页面 = 表过态，跳过（不覆盖管理员的显式取消）
    if ([...have].some(id => pageIds.has(id))) continue;

    const want = new Set();
    for (const page of pages) {
      if (!actions.some(action => matchAction(action, page.permission))) continue;
      want.add(Number(page.id));
      let parent = parentOf.get(Number(page.id));
      const guard = new Set();
      while (Number.isInteger(parent) && parent > 0 && !guard.has(parent)) {
        guard.add(parent);
        want.add(parent);
        parent = parentOf.get(parent);
      }
    }

    const add = [...want].filter(id => !have.has(id));
    if (add.length === 0) continue;
    await queryInterface.bulkInsert(
      'sys_role_menu',
      add.map(menuId => ({ role_id: Number(role.id), menu_id: menuId }))
    );
  }
}

/**
 * 回滚：不删任何授权
 *
 * 补齐的正是"哪些页面该可见"的依据，删掉会让这些角色立刻失去后台入口；
 * 需要收紧时应当在界面上逐个取消（有审计）。
 */
export async function down() {
  // no-op：见上
}
