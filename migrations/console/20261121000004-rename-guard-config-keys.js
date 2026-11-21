/**
 * 迁移：守卫配置里的路由标识从 `console*` 改名为 `admin*`
 *
 * 背景（2026-11-21）：`console` 已并入 `admin` —— 应用标识、权限码、代码目录都改了，
 * 但**路由注册名**（`registerSecureRoute({ name })`）还留着一批 `consoleUserList`
 * 之类的旧名。它们不只是日志里的标识：
 *
 *   · `name` 就是守卫配置的第三级键（`groups[groupKey].apis[apiKey]`）；
 *   · 运维在面板上给某个接口单独开的 IP 白名单 / 关闭状态，全部挂在这个键上。
 *
 * 所以代码改名必须配一条**数据改名**，否则新注册的 `adminUserList` 找不到旧行，
 * 表现为"上次关掉的接口重启后又开了"（旧行被判成已删除的 API 配置，只留一条 warn）。
 *
 * 处理：把 `groups` 的键、`apis` 的键、以及节点里的 `id` 字段一起搬过去。
 * 幂等：没有 `console*` 键的行直接跳过。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */

/** `consoleXxx` → `adminXxx`；不匹配原样返回 */
function renameKey(key) {
  return typeof key === 'string' && /^console[A-Z]/.test(key) ? `admin${key.slice('console'.length)}` : key;
}

/**
 * 重命名一个配置树里的键（groups / apis / id）
 *
 * @param {object} config 单系统的配置
 * @returns {{config: object, changed: boolean}} 结果
 */
function renameTree(config) {
  let changed = false;
  const groups = {};
  for (const [groupKey, group] of Object.entries(config.groups || {})) {
    const nextGroupKey = renameKey(groupKey);
    if (nextGroupKey !== groupKey) changed = true;

    const apis = {};
    for (const [apiKey, api] of Object.entries(group.apis || {})) {
      const nextApiKey = renameKey(apiKey);
      if (nextApiKey !== apiKey) changed = true;
      const nextApi = { ...api };
      if (nextApi.id && renameKey(nextApi.id) !== nextApi.id) {
        nextApi.id = renameKey(nextApi.id);
        changed = true;
      }
      apis[nextApiKey] = nextApi;
    }

    const nextGroup = { ...group, apis };
    if (nextGroup.id && renameKey(nextGroup.id) !== nextGroup.id) {
      nextGroup.id = renameKey(nextGroup.id);
      changed = true;
    }
    groups[nextGroupKey] = nextGroup;
  }
  return { config: { ...config, groups }, changed };
}

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function up({ queryInterface }) {
  const [exists] = await queryInterface.sequelize.query('SHOW TABLES LIKE "guard_configs"');
  if (exists.length === 0) return;

  const [rows] = await queryInterface.sequelize.query('SELECT system_key, config, version FROM guard_configs');
  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.config);
    } catch {
      continue; /* 坏行交给启动期的告警，不在迁移里静默改写 */
    }
    const { config, changed } = renameTree(parsed);
    if (!changed) continue;

    await queryInterface.sequelize.query(
      'UPDATE guard_configs SET config = :cfg, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE system_key = :key',
      { replacements: { cfg: JSON.stringify(config), key: row.system_key } }
    );
  }
}

/**
 * 回滚：改回 console 前缀
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const [rows] = await queryInterface.sequelize.query('SELECT system_key, config FROM guard_configs');
  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.config);
    } catch {
      continue;
    }
    /* 只在 admin 前缀确实来自本次改名时才回滚是不可判定的，这里按对称规则反转 */
    const groups = {};
    for (const [groupKey, group] of Object.entries(parsed.groups || {})) {
      const apis = {};
      for (const [apiKey, api] of Object.entries(group.apis || {})) {
        apis[apiKey.replace(/^admin([A-Z])/, 'console$1')] = api;
      }
      groups[groupKey.replace(/^admin([A-Z])/, 'console$1')] = { ...group, apis };
    }
    await queryInterface.sequelize.query(
      'UPDATE guard_configs SET config = :cfg, version = version + 1 WHERE system_key = :key',
      { replacements: { cfg: JSON.stringify({ ...parsed, groups }), key: row.system_key } }
    );
  }
}
