/**
 * 迁移：把后台菜单重排成四组 —— 用户管理 / 系统管理 / 日志与审计 / 个人设置
 *
 * 【为什么改】
 * 原结构把「管人」「管软件」「看日志」「管我自己」四类混在一起：
 *   · 系统管理 里同时有用户、角色、菜单、部门、岗位、应用、通知配置；
 *   · 日志审计 里挂着「防火墙监控」（它是实时观测，不是审计留痕）；
 *   · 与"我"有关的四个页面（个人资料 / 外观主题 / 访问令牌 / 通知偏好）散在顶栏
 *     两个图标 + 一个顶级菜单里，找任何一项都得先猜它在哪。
 *
 * 新结构的判据是**作用对象**，不是功能名：
 *   用户管理   = 管人（用户 / 部门 / 岗位 / 角色）
 *   系统管理   = 管这套软件（菜单、应用、通知渠道与模板、防火墙）
 *   日志与审计 = 只读观测
 *   个人设置   = 只影响我自己（任何登录用户，不需要权限码）
 *
 * 通知因此被切成两处，这是**有意为之**，不是重复：
 *   · 系统管理 → 通知中心：通过什么发（渠道凭据）、发什么（模板）、默认发给谁；
 *   · 个人设置 → 通知偏好：我收哪些、什么时段不收。
 *
 * 【幂等】
 * 目录按 `(parent_id = 0, type = 'dir', name)` 判存在；页面按 `path` 定位。
 * 重复执行只会把同一批字段改成同一批值，不会产生重复行。
 *
 * 【授权兜底】
 * 菜单是树：父目录没授权，即便子页面授过权，服务端 `prune` 也会整枝剪掉。
 * 移动节点后必然出现"子页授了、新父目录没授"的组合，所以最后统一补一次
 * 「已授权节点的所有祖先也授权」，否则除超管外所有人都会看不到新分组。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */

/** 新目录：名字 → 图标 / 排序 */
const DIR_USER = { name: '用户管理', icon: 'Users', sort: 20 };
const DIR_SYSTEM = { name: '系统管理', icon: 'Settings', sort: 30 };
const DIR_LOG = { name: '日志与审计', icon: 'ScrollText', sort: 40 };
const DIR_SELF = { name: '个人设置', icon: 'UserCog', sort: 90 };

/**
 * 页面目标位置：按 `path` 定位（路由路径是页面的稳定标识，名字会被改）
 *
 * `parent` 是目录常量引用，实际写入时解析成 id。
 */
const MOVES = [
  // —— 用户管理：管人 ——
  { path: '/system/user', parent: DIR_USER, name: '用户列表', sort: 21 },
  { path: '/system/dept', parent: DIR_USER, name: '部门', sort: 22 },
  { path: '/system/post', parent: DIR_USER, name: '岗位', sort: 23 },
  { path: '/system/role', parent: DIR_USER, name: '角色', sort: 24 },

  // —— 系统管理：管这套软件 ——
  { path: '/system/menu', parent: DIR_SYSTEM, name: '菜单管理', sort: 31 },
  { path: '/system/app', parent: DIR_SYSTEM, name: '应用管理', icon: 'LayoutGrid', sort: 32 },
  { path: '/system/notice', parent: DIR_SYSTEM, name: '通知中心', sort: 33 },
  { path: '/monitor/firewall', parent: DIR_SYSTEM, name: '防火墙监控', sort: 34 },

  // —— 日志与审计：只读 ——
  { path: '/monitor/oper-log', parent: DIR_LOG, name: '操作日志', sort: 41 },
  { path: '/monitor/login-log', parent: DIR_LOG, name: '登录日志', sort: 42 },

  // —— 个人设置：只影响我自己 ——
  { path: '/settings/profile', parent: DIR_SELF, name: '个人资料', icon: 'IdCard', sort: 91 },
  { path: '/settings/notice', parent: DIR_SELF, name: '通知偏好', sort: 92 },
  { path: '/settings/theme', parent: DIR_SELF, name: '外观与主题', icon: 'Palette', sort: 93 },
  { path: '/settings/center', parent: DIR_SELF, name: '账号与安全', icon: 'KeyRound', sort: 94 }
];

/**
 * 查询封装（只取数据行）
 *
 * @param {object} sequelize Sequelize 实例
 * @param {string} sql SQL
 * @param {object} [replacements] 命名参数
 * @returns {Promise<Array<object>>} 数据行
 */
async function all(sequelize, sql, replacements = {}) {
  const [rows] = await sequelize.query(sql, { replacements });
  return rows;
}

/**
 * 确保目录存在（存在则只校准图标与排序）
 *
 * @param {object} sequelize Sequelize 实例
 * @param {object} dir 目录声明
 * @returns {Promise<number>} 目录 id
 */
async function ensureDir(sequelize, dir) {
  const [found] = await all(
    sequelize,
    "SELECT id FROM sys_menu WHERE parent_id = 0 AND type = 'dir' AND name = :name LIMIT 1",
    { name: dir.name }
  );
  if (found) {
    await all(
      sequelize,
      'UPDATE sys_menu SET icon = :icon, sort = :sort, updated_at = CURRENT_TIMESTAMP WHERE id = :id',
      { icon: dir.icon, sort: dir.sort, id: found.id }
    );
    return Number(found.id);
  }

  await all(
    sequelize,
    `INSERT INTO sys_menu (parent_id, name, type, icon, path, component, permission, sort, app_id, visible, status)
     VALUES (0, :name, 'dir', :icon, NULL, NULL, NULL, :sort, 'admin', 1, 1)`,
    { name: dir.name, icon: dir.icon, sort: dir.sort }
  );
  const [created] = await all(sequelize, 'SELECT id FROM sys_menu WHERE parent_id = 0 AND type = :type AND name = :name', {
    type: 'dir',
    name: dir.name
  });
  return Number(created.id);
}

/**
 * 把一个页面挪到目标目录（页面不存在则创建）
 *
 * 个人设置下的三项（个人资料 / 外观主题 / 账号与安全）原本只存在于顶栏，
 * 没有 sys_menu 行，所以这里要能补建。
 *
 * @param {object} sequelize Sequelize 实例
 * @param {object} move 目标声明
 * @param {number} parentId 目标目录 id
 * @returns {Promise<void>}
 */
async function placeMenu(sequelize, move, parentId) {
  const [found] = await all(sequelize, 'SELECT id FROM sys_menu WHERE path = :path AND type = :type LIMIT 1', {
    path: move.path,
    type: 'menu'
  });

  if (found) {
    await all(
      sequelize,
      `UPDATE sys_menu
          SET parent_id = :parentId, name = :name, sort = :sort,
              icon = COALESCE(:icon, icon), updated_at = CURRENT_TIMESTAMP
        WHERE id = :id`,
      { parentId, name: move.name, sort: move.sort, icon: move.icon ?? null, id: found.id }
    );
    return;
  }

  // 补建：个人页没有权限码（自助入口），其余页面照旧由 MOVES 里的语义决定
  await all(
    sequelize,
    `INSERT INTO sys_menu (parent_id, name, type, icon, path, component, permission, sort, app_id, visible, status)
     VALUES (:parentId, :name, 'menu', :icon, :path, NULL, NULL, :sort, 'admin', 1, 1)`,
    { parentId, name: move.name, icon: move.icon ?? null, path: move.path, sort: move.sort }
  );
}

/**
 * 补全授权：已授权的节点，其所有祖先也必须授权
 *
 * 不加这一步的后果很具体：把「用户列表」挪进新建的「用户管理」目录后，
 * `admin_operator` 这类角色仍然只授了子页 → 服务端 prune 时父目录未授权 → 整组消失。
 *
 * @param {object} sequelize Sequelize 实例
 * @returns {Promise<number>} 新增的授权行数
 */
async function grantAncestors(sequelize) {
  const menuRows = await all(sequelize, 'SELECT id, parent_id FROM sys_menu');
  const parentOf = new Map(menuRows.map(r => [Number(r.id), Number(r.parent_id)]));
  const grants = await all(sequelize, 'SELECT role_id, menu_id FROM sys_role_menu');

  const seen = new Set();
  const pairs = [];
  for (const grant of grants) {
    const roleId = Number(grant.role_id);
    let parent = parentOf.get(Number(grant.menu_id));
    while (parent && parent > 0) {
      const key = `${roleId}:${parent}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push([roleId, parent]);
      }
      parent = parentOf.get(parent);
    }
  }
  if (pairs.length === 0) return 0;

  await sequelize.query('INSERT IGNORE INTO sys_role_menu (role_id, menu_id) VALUES ?', { replacements: [pairs] });
  return pairs.length;
}

/**
 * 合并同名顶级目录（保留 id 最小的那个）
 *
 * 为什么需要这一步：目录是按**名字**认的，而日志组要改名。如果先"确保目录存在"
 * 再改名，就会先在库里建出一个「日志与审计」，随后又把旧的「日志审计」改成同名 ——
 * 于是出现两个同名目录，其中一个还是空的。这个顺序坑过一次，所以：
 * 顺序固定为 **改名 → 去重 → 确保存在**，并且用这个函数兜住"已经产生重复"的库。
 *
 * @param {object} sequelize Sequelize 实例
 * @returns {Promise<number>} 被合并掉的目录数
 */
async function mergeDuplicateDirs(sequelize) {
  const rows = await all(sequelize, "SELECT id, name FROM sys_menu WHERE parent_id = 0 AND type = 'dir' ORDER BY id");
  const keepId = new Map();
  let merged = 0;
  for (const row of rows) {
    const id = Number(row.id);
    if (!keepId.has(row.name)) {
      keepId.set(row.name, id);
      continue;
    }
    const keep = keepId.get(row.name);
    // 子项挂回保留的目录，再删重复行与它的授权
    await all(sequelize, 'UPDATE sys_menu SET parent_id = :keep, updated_at = CURRENT_TIMESTAMP WHERE parent_id = :dup', {
      keep,
      dup: id
    });
    await all(sequelize, 'DELETE FROM sys_role_menu WHERE menu_id = :id', { id });
    await all(sequelize, 'DELETE FROM sys_menu WHERE id = :id', { id });
    merged += 1;
  }
  return merged;
}

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function up({ queryInterface }) {
  const sequelize = queryInterface.sequelize;

  const [exists] = await sequelize.query('SHOW TABLES LIKE "sys_menu"');
  if (exists.length === 0) return;

  // 1. 先改名（顺序见 mergeDuplicateDirs 的注释），再兜住可能已产生的重复目录
  await all(sequelize, "UPDATE sys_menu SET name = :to, updated_at = CURRENT_TIMESTAMP WHERE type = 'dir' AND name = :from", {
    to: DIR_LOG.name,
    from: '日志审计'
  });
  await mergeDuplicateDirs(sequelize);

  // 2. 确保四个目录存在（存在则只校准图标与排序）
  const dirIds = new Map();
  for (const dir of [DIR_USER, DIR_SYSTEM, DIR_LOG, DIR_SELF]) {
    dirIds.set(dir, await ensureDir(sequelize, dir));
  }

  // 3. 归一页面的归属、名称与排序
  for (const move of MOVES) {
    await placeMenu(sequelize, move, dirIds.get(move.parent));
  }

  // 4. 补全祖先授权（否则新目录对非超管不可见）
  await grantAncestors(sequelize);
}

/**
 * 回滚：恢复原结构
 *
 * 只撤销本次的结构性改动（父级、名称、排序、新增行与授权），
 * 不动任何页面本身的数据。新增的三个个人页行会被删除 —— 它们只承载导航。
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const sequelize = queryInterface.sequelize;

  const [exists] = await sequelize.query('SHOW TABLES LIKE "sys_menu"');
  if (exists.length === 0) return;

  const [systemDir] = await all(
    sequelize,
    "SELECT id FROM sys_menu WHERE parent_id = 0 AND type = 'dir' AND name = :name LIMIT 1",
    { name: DIR_SYSTEM.name }
  );
  const [logDir] = await all(sequelize, "SELECT id FROM sys_menu WHERE parent_id = 0 AND type = 'dir' AND name = :name LIMIT 1", {
    name: DIR_LOG.name
  });
  const systemId = systemDir ? Number(systemDir.id) : null;
  const logId = logDir ? Number(logDir.id) : null;

  const BACK = [
    { path: '/system/user', parentId: systemId, name: '用户管理', sort: 21 },
    { path: '/system/role', parentId: systemId, name: '角色管理', sort: 22 },
    { path: '/system/menu', parentId: systemId, name: '菜单管理', sort: 23 },
    { path: '/system/dept', parentId: systemId, name: '部门管理', sort: 24 },
    { path: '/system/post', parentId: systemId, name: '岗位管理', sort: 25 },
    { path: '/system/app', parentId: systemId, name: '应用管理', sort: 26 },
    { path: '/system/notice', parentId: systemId, name: '通知配置', sort: 28 },
    { path: '/monitor/oper-log', parentId: logId, name: '操作日志', sort: 31 },
    { path: '/monitor/login-log', parentId: logId, name: '登录日志', sort: 32 },
    { path: '/monitor/firewall', parentId: logId, name: '防火墙监控', sort: 33 },
    // 通知偏好回到顶级自助入口
    { path: '/settings/notice', parentId: 0, name: '通知偏好', sort: 90 }
  ];

  for (const item of BACK) {
    if (item.parentId === null) continue;
    await all(
      sequelize,
      'UPDATE sys_menu SET parent_id = :parentId, name = :name, sort = :sort, updated_at = CURRENT_TIMESTAMP WHERE path = :path AND type = :type',
      { parentId: item.parentId, name: item.name, sort: item.sort, path: item.path, type: 'menu' }
    );
  }

  if (systemId) {
    await all(sequelize, 'UPDATE sys_menu SET sort = 20, updated_at = CURRENT_TIMESTAMP WHERE id = :id', { id: systemId });
  }
  if (logId) {
    await all(sequelize, "UPDATE sys_menu SET name = '日志审计', sort = 30, updated_at = CURRENT_TIMESTAMP WHERE id = :id", {
      id: logId
    });
  }

  // 删掉本次新增的三个导航行与两个目录（含其授权），避免回滚后留下空目录
  for (const path of ['/settings/profile', '/settings/theme', '/settings/center']) {
    const rows = await all(sequelize, 'SELECT id FROM sys_menu WHERE path = :path AND type = :type', { path, type: 'menu' });
    for (const row of rows) {
      await all(sequelize, 'DELETE FROM sys_role_menu WHERE menu_id = :id', { id: row.id });
      await all(sequelize, 'DELETE FROM sys_menu WHERE id = :id', { id: row.id });
    }
  }

  for (const name of [DIR_USER.name, DIR_SELF.name]) {
    const rows = await all(sequelize, "SELECT id FROM sys_menu WHERE parent_id = 0 AND type = 'dir' AND name = :name", { name });
    for (const row of rows) {
      const [child] = await all(sequelize, 'SELECT id FROM sys_menu WHERE parent_id = :id LIMIT 1', { id: row.id });
      if (child) continue; // 还有子项就不删，宁可留一个空目录也不弄丢页面
      await all(sequelize, 'DELETE FROM sys_role_menu WHERE menu_id = :id', { id: row.id });
      await all(sequelize, 'DELETE FROM sys_menu WHERE id = :id', { id: row.id });
    }
  }
}
