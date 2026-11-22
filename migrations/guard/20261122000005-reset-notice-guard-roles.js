/**
 * 迁移：清除 Notice 守卫配置里遗留的角色白名单
 *
 * 【问题】
 * `guard_configs` 里 Notice 那行是**历史快照**：它记着 `allowRoles: ["admin"]`
 * （系统级与 config 组级）。而全仓没有任何角色的 code 是 `admin`
 * （后台角色是 `admin_admin` / `admin_operator` / `admin_viewer`），
 * 于是 `/notice/**` 对**所有账号**都返回 403 —— 超级管理员也不例外，
 * 因为 `checkNodeIdentity` 只比对角色码，没有超管旁路。
 *
 * 【为什么改代码不够】
 * 守卫的运行时字段（enabled / requireLogin / allowIps / allowRoles）以 DB 为准：
 * `applyRuntimeFields` 只在"未授权的放宽"时拒绝应用，而 `[] → ["admin"]` 属于**收紧**，
 * 每次启动都会被无异议地应用回去。所以 `src/api/notice/system.json` 改成 `allowRoles: []`
 * 只能约束新环境；老环境的这行会把错误值一直带下去。
 *
 * 【修法】
 * 把 Notice 系统级、各模块级、各接口级的 `allowRoles` 一律清空（**空数组 = 不限制**，
 * 这是本项目守卫的既定语义，权限改由 `requirePermission` 权限码判定）。
 * 同时移除 `_relaxation` 签名信封：它记录的是"上一次被授权的放宽"，
 * 白名单已清空后这封信封不再对应任何有效状态，留着只会在下次启动误导方向判定。
 *
 * 【幂等】
 * 先读后判：没有任何非空 allowRoles 时直接返回，不写库、不 bump version。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */

const SYSTEM_KEY = 'Notice';

/**
 * 递归清空一组节点的角色白名单
 *
 * @param {object} node 守卫配置节点（系统 / 模块 / 接口）
 * @returns {boolean} 是否发生了改动
 */
function clearNode(node) {
  if (!node || typeof node !== 'object') return false;

  let changed = false;
  if (Array.isArray(node.allowRoles) && node.allowRoles.length > 0) {
    node.allowRoles = [];
    changed = true;
  }
  if (node._relaxation !== undefined) {
    delete node._relaxation;
    changed = true;
  }
  return changed;
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

  // BINARY 精确匹配：ci collation 下普通 `=` 会串到别的键
  const [rows] = await sequelize.query(
    'SELECT id, config, version FROM guard_configs WHERE BINARY system_key = ' + sequelize.escape(SYSTEM_KEY)
  );
  if (rows.length === 0) return;

  for (const row of rows) {
    let config;
    try {
      config = JSON.parse(row.config);
    } catch {
      // 配置损坏时不动它：这里只负责清角色白名单，不该顺手"修复"未知结构
      continue;
    }

    let changed = clearNode(config);
    for (const group of Object.values(config.groups || {})) {
      if (clearNode(group)) changed = true;
      for (const api of Object.values(group?.apis || {})) {
        if (clearNode(api)) changed = true;
      }
    }
    if (!changed) continue;

    await sequelize.query(
      'UPDATE guard_configs SET config = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      { replacements: [JSON.stringify(config), Number(row.version || 0) + 1, row.id] }
    );
  }
}

/**
 * 回滚：不做任何事
 *
 * 没有可信的"旧值"可恢复 —— 把 `allowRoles: ["admin"]` 写回去等于主动让
 * `/notice/**` 重新变成全员 403。真要恢复某种角色限制，应在守卫面板里显式设置，
 * 由面板走二次认证与签名流程，而不是靠一条回滚迁移偷偷收紧。
 *
 * @returns {Promise<void>}
 */
export async function down() {
  // 有意留空
}
