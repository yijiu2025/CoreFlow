/**
 * 迁移：新增「通知偏好」自助菜单
 *
 * 与「通知配置」的区别：
 *   · 通知配置 = 管理员配渠道与模板（`notice:config:read`，在「系统管理」下）；
 *   · 通知偏好 = 每个人配自己收什么（无权限码，顶级菜单）。
 *
 * 它**故意不声明 permission**：自助入口不该要求角色额外授权，否则新建账号永远看不到。
 * 菜单接口对「顶级 + menu + 无权限码」的节点默认放行（见 `api/admin/v1/session.js`
 * 的 `isSelfService`），所以这条不需要给任何角色补授权。
 *
 * 幂等：按 `(parent_id = 0, name)` 判重。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */

const MENU = {
  name: '通知偏好',
  type: 'menu',
  icon: 'Bell',
  path: '/settings/notice',
  component: 'notice-prefs',
  permission: null,
  sort: 90
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

  const [rows] = await queryInterface.sequelize.query('SELECT id FROM sys_menu WHERE parent_id = 0 AND name = :name LIMIT 1', {
    replacements: { name: MENU.name }
  });
  if (rows.length > 0) return;

  await queryInterface.bulkInsert('sys_menu', [
    {
      parent_id: 0,
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
  await queryInterface.sequelize.query('DELETE FROM sys_menu WHERE parent_id = 0 AND name = :name', {
    replacements: { name: MENU.name }
  });
}
