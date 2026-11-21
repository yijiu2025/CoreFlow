/**
 * 迁移：系统管理下补「应用管理」菜单
 *
 * 页面是只读的应用清单（`admin:app:read`），入口挂在「系统管理」旁边：
 * 用户 / 角色 / 菜单 / 部门 / 岗位 之后再补一档"这个系统里到底接了几个应用"。
 *
 * 幂等：按 `(parent_id, name)` 判重，已存在则跳过 —— 不覆盖人工改过的排序或权限码。
 * 父目录「系统管理」不存在时**直接跳过**（老库没跑过菜单种子，硬插会挂成一棵孤树）。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */

/** 菜单定义（顺序 = 插入值；sort 接在岗位管理 25 之后） */
const MENU = {
  name: '应用管理',
  type: 'menu',
  icon: 'LayoutGrid',
  path: '/system/app',
  component: 'apps',
  permission: 'admin:app:read',
  sort: 26
};

/** 父目录名（`20261109000002-seed-console-menus` 建的那棵树的根节点之一） */
const PARENT_NAME = '系统管理';

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

  /*
   * 🔴 同名根目录可能不止一个：线上库实测有两个「系统管理」（其中一个 path=''、
   *    零子节点，是历史脏数据）。直接 `LIMIT 1` 有概率选中那个空壳 —— 菜单照插不报错，
   *    但挂在了用户看不到的分支上，表现就是"加完功能还是找不到入口"。
   *    所以按"子节点多者优先、其次 id 小者"选真正在用的那棵树。
   */
  const [parents] = await queryInterface.sequelize.query(
    `SELECT m.id, (SELECT COUNT(*) FROM sys_menu c WHERE c.parent_id = m.id) AS kids
       FROM sys_menu m
      WHERE m.parent_id = 0 AND m.name = :name
      ORDER BY kids DESC, m.id ASC
      LIMIT 1`,
    { replacements: { name: PARENT_NAME } }
  );
  if (parents.length === 0) return;
  const parentId = Number(parents[0].id);

  const [rows] = await queryInterface.sequelize.query(
    'SELECT id FROM sys_menu WHERE parent_id = :parentId AND name = :name LIMIT 1',
    { replacements: { parentId, name: MENU.name } }
  );
  if (rows.length > 0) return;

  await queryInterface.bulkInsert('sys_menu', [
    {
      parent_id: parentId,
      name: MENU.name,
      type: MENU.type,
      icon: MENU.icon,
      path: MENU.path,
      component: MENU.component,
      permission: MENU.permission,
      sort: MENU.sort,
      visible: 1,
      status: 1,
      created_at: Sequelize.literal('CURRENT_TIMESTAMP'),
      updated_at: Sequelize.literal('CURRENT_TIMESTAMP')
    }
  ]);
}

/**
 * 回滚：按「父目录 + 名称」精确定位删除
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  /* 与 up 同一套选择逻辑：只删"真正在用的那棵树"下的同名菜单 */
  const [parents] = await queryInterface.sequelize.query(
    `SELECT m.id, (SELECT COUNT(*) FROM sys_menu c WHERE c.parent_id = m.id) AS kids
       FROM sys_menu m
      WHERE m.parent_id = 0 AND m.name = :name
      ORDER BY kids DESC, m.id ASC
      LIMIT 1`,
    { replacements: { name: PARENT_NAME } }
  );
  if (parents.length === 0) return;
  const parentId = Number(parents[0].id);

  /* 先清授权关系再删菜单：`sys_role_menu` 有外键，反序删除会撞约束 */
  const [menuRows] = await queryInterface.sequelize.query(
    'SELECT id FROM sys_menu WHERE parent_id = :parentId AND name = :name',
    { replacements: { parentId, name: MENU.name } }
  );
  for (const row of menuRows) {
    await queryInterface.sequelize.query('DELETE FROM sys_role_menu WHERE menu_id = :id', {
      replacements: { id: Number(row.id) }
    });
  }
  await queryInterface.sequelize.query('DELETE FROM sys_menu WHERE parent_id = :parentId AND name = :name', {
    replacements: { parentId, name: MENU.name }
  });
}
