/**
 * 迁移：初始化 Console 管理后台菜单树
 *
 * 幂等：按 `(parent_id, name)` 判重，已存在则跳过，不覆盖人工改过的排序 / 权限码。
 * 菜单只决定侧栏可见性；接口放行仍由 PBAC policy 判定。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

/** 菜单树定义：parent 用 name 引用，便于阅读与幂等判重 */
const MENUS = [
  {
    name: '工作台',
    type: 'menu',
    icon: 'LayoutDashboard',
    path: '/dashboard',
    component: 'dashboard',
    permission: 'admin:dashboard:read',
    sort: 10,
    parent: null
  },
  {
    name: '系统管理',
    type: 'dir',
    icon: 'Settings',
    path: null,
    component: null,
    permission: null,
    sort: 20,
    parent: null
  },
  {
    name: '用户管理',
    type: 'menu',
    icon: 'Users',
    path: '/system/user',
    component: 'users',
    permission: 'admin:user:read',
    sort: 21,
    parent: '系统管理'
  },
  {
    name: '角色管理',
    type: 'menu',
    icon: 'ShieldCheck',
    path: '/system/role',
    component: 'roles',
    permission: 'admin:role:read',
    sort: 22,
    parent: '系统管理'
  },
  {
    name: '菜单管理',
    type: 'menu',
    icon: 'ListTree',
    path: '/system/menu',
    component: 'menus',
    permission: 'admin:menu:read',
    sort: 23,
    parent: '系统管理'
  },
  {
    name: '部门管理',
    type: 'menu',
    icon: 'Network',
    path: '/system/dept',
    component: 'depts',
    permission: 'admin:dept:read',
    sort: 24,
    parent: '系统管理'
  },
  {
    name: '岗位管理',
    type: 'menu',
    icon: 'Briefcase',
    path: '/system/post',
    component: 'posts',
    permission: 'admin:post:read',
    sort: 25,
    parent: '系统管理'
  },
  {
    name: '字典管理',
    type: 'menu',
    icon: 'BookMarked',
    path: '/system/dict',
    component: 'dict',
    permission: 'admin:dict:read',
    sort: 26,
    parent: '系统管理'
  },
  {
    name: '参数管理',
    type: 'menu',
    icon: 'SlidersHorizontal',
    path: '/system/config',
    component: 'configs',
    permission: 'admin:config:read',
    sort: 27,
    parent: '系统管理'
  },
  {
    name: '日志审计',
    type: 'dir',
    icon: 'ScrollText',
    path: null,
    component: null,
    permission: null,
    sort: 30,
    parent: null
  },
  {
    name: '操作日志',
    type: 'menu',
    icon: 'ScrollText',
    path: '/monitor/oper-log',
    component: 'oper-log',
    permission: 'admin:log:read',
    sort: 31,
    parent: '日志审计'
  },
  {
    name: '登录日志',
    type: 'menu',
    icon: 'LogIn',
    path: '/monitor/login-log',
    component: 'login-log',
    permission: 'admin:log:read',
    sort: 32,
    parent: '日志审计'
  },
  {
    name: '防火墙监控',
    type: 'menu',
    icon: 'Shield',
    path: '/monitor/firewall',
    component: 'firewall',
    permission: 'admin:firewall:read',
    sort: 33,
    parent: '日志审计'
  },
  {
    name: '开发工具',
    type: 'dir',
    icon: 'Wrench',
    path: null,
    component: null,
    permission: null,
    sort: 40,
    parent: null
  },
  {
    name: '代码生成',
    type: 'menu',
    icon: 'Wand2',
    path: '/tool/generator',
    component: 'generator',
    permission: 'admin:gen:read',
    sort: 41,
    parent: '开发工具'
  }
];

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @param {object} ctx.Sequelize Sequelize 构造器
 * @returns {Promise<void>}
 */
export async function up({ queryInterface, Sequelize }) {
  const [exists] = await queryInterface.sequelize.query('SHOW TABLES LIKE "sys_menu"');
  if (exists.length === 0) return;

  const idByName = new Map();

  for (const menu of MENUS) {
    const parentId = menu.parent ? idByName.get(menu.parent) || 0 : 0;
    const [rows] = await queryInterface.sequelize.query(
      'SELECT id FROM sys_menu WHERE parent_id = :parentId AND name = :name LIMIT 1',
      { replacements: { parentId, name: menu.name } }
    );

    if (rows.length > 0) {
      idByName.set(menu.name, Number(rows[0].id));
      continue;
    }

    await queryInterface.bulkInsert('sys_menu', [
      {
        parent_id: parentId,
        name: menu.name,
        type: menu.type,
        icon: menu.icon,
        path: menu.path,
        component: menu.component,
        permission: menu.permission,
        sort: menu.sort,
        visible: 1,
        status: 1,
        created_at: Sequelize.literal('CURRENT_TIMESTAMP'),
        updated_at: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    ]);

    const [created] = await queryInterface.sequelize.query(
      'SELECT id FROM sys_menu WHERE parent_id = :parentId AND name = :name LIMIT 1',
      { replacements: { parentId, name: menu.name } }
    );
    idByName.set(menu.name, Number(created[0].id));
  }
}

/**
 * 回滚：删除本迁移插入的菜单（按名称 + 层级精确定位）
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const names = MENUS.map(m => m.name);
  await queryInterface.sequelize.query(
    'DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE name IN (:names))',
    {
      replacements: { names }
    }
  );
  await queryInterface.sequelize.query('DELETE FROM sys_menu WHERE name IN (:names)', { replacements: { names } });
}
