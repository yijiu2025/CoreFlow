/**
 * 迁移：OAuth 客户端 `console` → `admin`
 *
 * 背景（2026-11-21）：`console` 与 `admin` 合并成同一个应用，客户端的唯一来源
 * 改为 `src/app/admin/config.js` 的 `oauth_client.client_id = 'admin'`。
 *
 * 为什么要**改名**而不是让 loader 新建一条：
 *   · `oauth_clients` 的 `client_id` 是唯一键，历史授权（`oauth_user_approval`）按它
 *     记录用户同意过哪些 scope；新建一条会让老授权变成孤儿，用户要重新点一次同意；
 *   · 表里的 `redirect_uris` 可能被运营在线上改过，新建会丢这些改动。
 *
 * 若不迁移：启动期 loader 会按新配置 create 一条 `admin`，而 `console` 那条继续留在表里 ——
 * 两个客户端指向同一个后台，登录页按 `?appName=` 传什么就建什么会话，`appId` 依旧分裂。
 *
 * 🔴 存量影响（已在 admin/config.js 的注释里写明，这里重申一次）：
 *    改名后**已签发 token 全部失效**（JWT `aud=console`），存量会话解析不到权限集，
 *    用户需要重新登录一次。这是刻意代价。
 *
 * 幂等：`console` 不存在（或 `admin` 已存在）时什么都不做。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */

/** 旧 → 新 客户端标识 */
const OLD_ID = 'console';
const NEW_ID = 'admin';

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function up({ queryInterface }) {
  const [exists] = await queryInterface.sequelize.query('SHOW TABLES LIKE "oauth_clients"');
  if (exists.length === 0) return;

  const [oldRows] = await queryInterface.sequelize.query('SELECT client_id FROM oauth_clients WHERE client_id = :id', {
    replacements: { id: OLD_ID }
  });
  if (oldRows.length === 0) return;

  const [newRows] = await queryInterface.sequelize.query('SELECT client_id FROM oauth_clients WHERE client_id = :id', {
    replacements: { id: NEW_ID }
  });
  /*
   * 两种真实形态都要处理：
   *   A. 只有 console  → 改名（保留运营在线上改过的 redirect_uris / secret）
   *   B. admin 已存在  → 后端已按新配置 upsert 过一次，旧行成了孤儿，删掉即可
   *      （实测两行的 redirect_uris / scope / grant_types 完全一致，没有值要救；
   *        若哪天不一致，先人工核对再删 —— 这里刻意不自动合并字段，避免覆盖线上配置）
   */
  if (newRows.length === 0) {
    await queryInterface.sequelize.query(
      'UPDATE oauth_clients SET client_id = :newId, client_name = :name WHERE client_id = :oldId',
      { replacements: { newId: NEW_ID, oldId: OLD_ID, name: '管理后台' } }
    );
  } else {
    await queryInterface.sequelize.query('DELETE FROM oauth_clients WHERE client_id = :oldId', {
      replacements: { oldId: OLD_ID }
    });
  }

  /* 历史授权跟着迁：它们是"用户同意过哪些 scope"，与客户端同一条链 */
  const [approvalExists] = await queryInterface.sequelize.query('SHOW TABLES LIKE "oauth_user_approval"');
  if (approvalExists.length > 0) {
    await queryInterface.sequelize.query('UPDATE oauth_user_approval SET client_id = :newId WHERE client_id = :oldId', {
      replacements: { newId: NEW_ID, oldId: OLD_ID }
    });
  }
}

/**
 * 回滚：把标识改回去
 *
 * 注意：回滚不会让已失效的 token 复活，用户仍需重新登录。
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const [exists] = await queryInterface.sequelize.query('SHOW TABLES LIKE "oauth_clients"');
  if (exists.length === 0) return;
  const [rows] = await queryInterface.sequelize.query('SELECT client_id FROM oauth_clients WHERE client_id = :id', {
    replacements: { id: NEW_ID }
  });
  if (rows.length === 0) return;
  await queryInterface.sequelize.query('UPDATE oauth_clients SET client_id = :oldId WHERE client_id = :newId', {
    replacements: { oldId: OLD_ID, newId: NEW_ID }
  });
  const [approvalExists] = await queryInterface.sequelize.query('SHOW TABLES LIKE "oauth_user_approval"');
  if (approvalExists.length > 0) {
    await queryInterface.sequelize.query('UPDATE oauth_user_approval SET client_id = :oldId WHERE client_id = :newId', {
      replacements: { oldId: OLD_ID, newId: NEW_ID }
    });
  }
}
