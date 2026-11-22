/**
 * 迁移：在「个人设置」下新增「我的操作日志」
 *
 * 【为什么是自助页】
 * 它回答的是"我最近做过什么"，与"审计谁在管理系统"是两件事：
 *   · 日志系统 → 操作日志（`admin:log:read` + 数据范围）是审计视角，能看全站；
 *   · 个人设置 → 我的操作日志（无权限码）只看自己，接口 `/admin/v1/my-logs`
 *     把用户范围钉死在会话里，请求参数放大不了。
 *
 * 【为什么不补授权】
 * `path` 在 `/settings/` 下且 `permission IS NULL`，命中的是服务端 prune 的**自助区**
 * 分支（`api/admin/v1/session.js` 的 `isSelfServicePage`），与角色授权无关。
 * 这也正是"个人设置默认每个登录用户都有"的落地方式：不给任何角色写 `sys_role_menu`，
 * 反而不需要每次新建角色都记得勾上它。
 *
 * 【幂等】
 * 按 `path = '/settings/logs'` 判重；父目录按 `(parent_id = 0, type = 'dir', name)` 定位。
 * 父目录不存在时**直接报错**而不是静默跳过 —— 迁移顺序固定（000006 建目录在前），
 * 跳过只会让菜单凭空消失，排查成本远高于一次性失败。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */

const PARENT_DIR_NAME = '个人设置';

const MENU = {
  name: '我的操作日志',
  type: 'menu',
  icon: 'History',
  path: '/settings/logs',
  component: 'settings-logs',
  permission: null
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

  const [parents] = await queryInterface.sequelize.query(
    "SELECT id FROM sys_menu WHERE parent_id = 0 AND type = 'dir' AND name = :name AND app_id = 'admin' LIMIT 1",
    { replacements: { name: PARENT_DIR_NAME } }
  );
  if (parents.length === 0) {
    throw new Error(`[migration] 未找到「${PARENT_DIR_NAME}」目录，请先执行 20261122000006-restructure-console-menus`);
  }
  const parentId = parents[0].id;

  const [dup] = await queryInterface.sequelize.query(
    "SELECT id FROM sys_menu WHERE path = :path AND app_id = 'admin' LIMIT 1",
    { replacements: { path: MENU.path } }
  );
  if (dup.length > 0) return;

  // 排在同级末尾：位置由目录内容决定，不该写死一个会和别人撞车的数字
  const [maxRows] = await queryInterface.sequelize.query(
    'SELECT COALESCE(MAX(sort), 0) AS maxSort FROM sys_menu WHERE parent_id = :parentId',
    { replacements: { parentId } }
  );
  const sort = Number(maxRows[0]?.maxSort || 0) + 10;

  await queryInterface.bulkInsert('sys_menu', [
    {
      parent_id: parentId,
      name: MENU.name,
      type: MENU.type,
      icon: MENU.icon,
      path: MENU.path,
      component: MENU.component,
      permission: MENU.permission,
      sort,
      app_id: 'admin',
      visible: 1,
      status: 1,
      created_at: Sequelize.literal('CURRENT_TIMESTAMP'),
      updated_at: Sequelize.literal('CURRENT_TIMESTAMP')
    }
  ]);
}

/**
 * 回滚：按路径删除（路径是这条菜单的稳定标识）
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  await queryInterface.sequelize.query("DELETE FROM sys_menu WHERE path = :path AND app_id = 'admin'", {
    replacements: { path: MENU.path }
  });
}
