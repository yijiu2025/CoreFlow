/**
 * 迁移：下线「字典管理」「参数管理」两个菜单
 *
 * 为什么删：这两块**没有任何消费方** —— 后端除自身 DAO / 路由外无人读取
 * （业务配置走 `src/config/*.js` 与 `data/*.json`，不查 `sys_config`），前端也
 * 只有那两个页面自己调接口。留着它们的结果是：后台多两个入口、多一份"看起来能配
 * 但配了没人用"的错觉。
 *
 * === 表不删（刻意）===
 * `sys_dict_type` / `sys_dict_data` / `sys_config` 三张表**保留、数据不动**：
 *   · 删数据不可逆，而这些表里可能有历史配置；
 *   · 页面/接口下线已经消除了"误配"入口，表本身不构成风险；
 *   · 真要恢复时，接口与页面可以从 git 取回，数据还在。
 * 真到确定永不再用，再单独提一个 `drop table` 迁移。
 *
 * 幂等：先删角色-菜单关联再删菜单本身；不存在时是空操作。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */

/** 要下线的菜单路径（比按名字更稳：名字可被人工改过） */
const PATHS = ['/system/dict', '/system/config'];

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function up({ queryInterface }) {
  // 先清关联：否则会留下指向已删菜单的悬空授权（角色侧栏会"少一项但查不到原因"）
  await queryInterface.sequelize.query(
    'DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE path IN (:paths))',
    { replacements: { paths: PATHS } }
  );
  await queryInterface.sequelize.query('DELETE FROM sys_menu WHERE path IN (:paths)', {
    replacements: { paths: PATHS }
  });
}

/**
 * 回滚：把两条菜单重新插回「系统管理」下
 *
 * 只恢复菜单本体，不恢复角色授权（那是被人主动删掉的关系，不该由回滚替人决定）。
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const [parents] = await queryInterface.sequelize.query(
    "SELECT id FROM sys_menu WHERE name = '系统管理' AND parent_id = 0 LIMIT 1"
  );
  if (parents.length === 0) return;
  const parentId = Number(parents[0].id);

  const rows = [
    {
      name: '字典管理',
      icon: 'BookMarked',
      path: '/system/dict',
      component: 'dict',
      permission: 'admin:dict:read',
      sort: 26
    },
    {
      name: '参数管理',
      icon: 'SlidersHorizontal',
      path: '/system/config',
      component: 'configs',
      permission: 'admin:config:read',
      sort: 27
    }
  ];

  for (const row of rows) {
    const [exists] = await queryInterface.sequelize.query('SELECT id FROM sys_menu WHERE path = :path LIMIT 1', {
      replacements: { path: row.path }
    });
    if (exists.length > 0) continue;
    await queryInterface.sequelize.query(
      `INSERT INTO sys_menu (parent_id, name, type, icon, path, component, permission, sort, visible, status, created_at, updated_at)
       VALUES (:parentId, :name, 'menu', :icon, :path, :component, :permission, :sort, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      { replacements: { parentId, ...row } }
    );
  }
}
