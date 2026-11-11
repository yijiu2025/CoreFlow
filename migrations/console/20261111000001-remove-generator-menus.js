/**
 * 迁移：下线「代码生成」菜单（连同空壳目录「开发工具」）
 *
 * 为什么删：这条菜单指向 `scaffold/src/views/tool/Generator.vue` —— 一个 62 行的占位页，
 * 表单齐全但**没有任何后端接口**，点「生成」什么都不会发生。它比"没用"更糟：
 * 会让人以为这个脚手架支持代码生成，然后再花时间找不存在的配置。
 *
 * 目录「开发工具」下只有这一个子项，删完就成空壳，所以一并清掉 ——
 * 但只在**确实没有其它子项**时才删（有人后来往里加过东西就不动它）。
 *
 * 幂等：先删角色-菜单关联再删菜单；不存在时是空操作。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */

/** 代码生成菜单的路径（比按名字稳：名字可能被人工改过） */
const MENU_PATH = '/tool/generator';

/** 父目录名（用于找到并判断是否为空壳） */
const PARENT_NAME = '开发工具';

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function up({ queryInterface }) {
  const sequelize = queryInterface.sequelize;

  // 先记下父目录 id：删完子项才好在"是否还有别的子项"上判断
  const [parents] = await sequelize.query('SELECT id FROM sys_menu WHERE name = :name AND parent_id = 0 LIMIT 1', {
    replacements: { name: PARENT_NAME }
  });
  const parentId = parents.length > 0 ? Number(parents[0].id) : null;

  // 清悬空授权：否则角色侧栏会"少一项但查不到原因"
  await sequelize.query('DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE path = :path)', {
    replacements: { path: MENU_PATH }
  });
  await sequelize.query('DELETE FROM sys_menu WHERE path = :path', { replacements: { path: MENU_PATH } });

  if (parentId === null) return;

  const [rest] = await sequelize.query('SELECT COUNT(*) AS c FROM sys_menu WHERE parent_id = :parentId', {
    replacements: { parentId }
  });
  if (Number(rest[0]?.c) > 0) return;

  await sequelize.query('DELETE FROM sys_role_menu WHERE menu_id = :parentId', { replacements: { parentId } });
  await sequelize.query('DELETE FROM sys_menu WHERE id = :parentId', { replacements: { parentId } });
}

/**
 * 回滚：把「开发工具 / 代码生成」重新插回
 *
 * 只恢复菜单本体，不恢复角色授权 —— 那是被人主动删掉的关系，不该由回滚替人决定。
 * 注意：对应前端页面已随代码删除，回滚只还原"菜单存在"这一状态，点进去仍是 404。
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const sequelize = queryInterface.sequelize;

  const [exists] = await sequelize.query('SELECT id FROM sys_menu WHERE path = :path LIMIT 1', {
    replacements: { path: MENU_PATH }
  });
  if (exists.length > 0) return;

  let parentId;
  const [parents] = await sequelize.query('SELECT id FROM sys_menu WHERE name = :name AND parent_id = 0 LIMIT 1', {
    replacements: { name: PARENT_NAME }
  });
  if (parents.length > 0) {
    parentId = Number(parents[0].id);
  } else {
    await sequelize.query(
      `INSERT INTO sys_menu (parent_id, name, type, icon, path, component, permission, sort, visible, status, created_at, updated_at)
       VALUES (0, :name, 'dir', 'Wrench', NULL, NULL, NULL, 40, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      { replacements: { name: PARENT_NAME } }
    );
    const [created] = await sequelize.query('SELECT id FROM sys_menu WHERE name = :name AND parent_id = 0 LIMIT 1', {
      replacements: { name: PARENT_NAME }
    });
    parentId = Number(created[0].id);
  }

  await sequelize.query(
    `INSERT INTO sys_menu (parent_id, name, type, icon, path, component, permission, sort, visible, status, created_at, updated_at)
     VALUES (:parentId, '代码生成', 'menu', 'Wand2', :path, 'generator', 'admin:gen:read', 41, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    { replacements: { parentId, path: MENU_PATH } }
  );
}
