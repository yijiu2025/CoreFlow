/**
 * `sys_menu` 增加「归属应用」
 *
 * 背景：这张表原先只服务管理后台（admin 命名空间的菜单与按钮）。要让**其他应用**
 * （防火墙、PoseCraft、RetroWeb…）的页面与按钮也能在同一个后台里配置授权，
 * 就必须能回答"这一行属于哪个应用的界面"。
 *
 * 为什么用应用标识而不是"父级菜单反推"：按钮的父级是页面、页面的父级是目录，
 * 整棵树的 app_id 必须一致，靠反推一旦有人手工改父级就会串味；列存下来是唯一事实。
 *
 * 现有 35 行全部属于管理后台，默认值回填成 `admin` 即可，不需要数据搬迁。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('sys_menu', 'app_id', {
    type: Sequelize.STRING(32),
    allowNull: false,
    defaultValue: 'admin',
    comment: '归属应用（admin = 管理后台；其它应用用其应用标识，如 firewall）'
  });

  // 列表与树都按「应用 + 父级」过滤，这条索引同时服务两处
  await queryInterface.addIndex('sys_menu', ['app_id', 'parent_id'], {
    name: 'idx_sys_menu_app_parent'
  });

  // 兜底：万一有历史行被写成空串（列刚加时不会，但手工导入可能）
  await queryInterface.sequelize.query("UPDATE sys_menu SET app_id = 'admin' WHERE app_id IS NULL OR app_id = ''");
}

/**
 * 回滚
 *
 * @param {object} ctx Umzug 上下文
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  await queryInterface.removeIndex('sys_menu', 'idx_sys_menu_app_parent');
  await queryInterface.removeColumn('sys_menu', 'app_id');
}
