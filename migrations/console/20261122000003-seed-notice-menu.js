/**
 * 迁移：新增「通知配置」菜单
 *
 * 通知中心是平台内置应用（`notice`），但它的**配置入口**属于管理后台的运维动作，
 * 所以菜单挂在「系统管理」下、`app_id` 仍是 `admin`（菜单树是一棵）。
 * 可见性由 `permission` 决定：只有拿到 `notice:config:read` 的账号才看得到这一项，
 * 普通用户走「个人中心 → 通知偏好」，那是另一条链路。
 *
 * 幂等：按 `(parent_id, name)` 判重，已存在则跳过，不覆盖人工改过的排序与权限码。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */

/** 菜单定义（parent 用 name 引用，与既有 seed 迁移保持同一写法） */
const MENU = {
  name: '通知配置',
  type: 'menu',
  icon: 'BellRing',
  path: '/system/notice',
  component: 'notice-config',
  permission: 'notice:config:read',
  sort: 28,
  parent: '系统管理'
};

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

  const [parents] = await queryInterface.sequelize.query('SELECT id FROM sys_menu WHERE parent_id = 0 AND name = :name LIMIT 1', {
    replacements: { name: MENU.parent }
  });
  if (parents.length === 0) return;
  const parentId = Number(parents[0].id);

  const [rows] = await queryInterface.sequelize.query('SELECT id FROM sys_menu WHERE parent_id = :parentId AND name = :name LIMIT 1', {
    replacements: { parentId, name: MENU.name }
  });
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
      app_id: 'admin',
      visible: 1,
      status: 1,
      created_at: Sequelize.literal('CURRENT_TIMESTAMP'),
      updated_at: Sequelize.literal('CURRENT_TIMESTAMP')
    }
  ]);
}

/**
 * 回滚：按名称与父级精确定位后删除
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const [parents] = await queryInterface.sequelize.query('SELECT id FROM sys_menu WHERE parent_id = 0 AND name = :name LIMIT 1', {
    replacements: { name: MENU.parent }
  });
  if (parents.length === 0) return;
  await queryInterface.sequelize.query('DELETE FROM sys_menu WHERE parent_id = :parentId AND name = :name', {
    replacements: { parentId: Number(parents[0].id), name: MENU.name }
  });
}
