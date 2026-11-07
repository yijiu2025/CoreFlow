/**
 * 迁移：修正 guard_configs 里 Admin 系统键的历史大小写
 *
 * 【问题】
 * `guard_configs.system_key` 是 `varchar(64)` + `utf8mb4_general_ci` 唯一键。
 * MySQL 的 ci collation 让 `admin` 与 `Admin` 互相匹配 —— `WHERE system_key = 'Admin'`
 * 会命中 `admin` 那行。而代码侧注册的键是 `Admin`（`src/api/admin/system.json` 的 `name`），
 * 于是形成一条静默故障：
 *
 *   读：loadFromDB 拿到的键是 `admin`，内存里没有 `admin` → mergeDbConfig 忽略它，
 *       Admin 的运行时字段回落代码默认值；
 *   写：findOrCreate({ where: { system_key: 'Admin' } }) 命中 `admin` 行 → 更新写回旧键，
 *       且 version 被算成 `dbVersions['Admin'] || 0 + 1 = 1`，乐观锁失效；
 *   症状：每次启动补录一次 Admin，而运维改的 Admin 守卫策略（enabled / requireLogin /
 *        IP 与角色白名单）重启后就失效。
 *
 * 【修法】
 * 把这行改名为代码实际使用的 `Admin`。只改键名，不动 configs 内容与 version。
 *
 * 【幂等】
 * 用 `BINARY` 精确匹配（否则 ci collation 下 `WHERE system_key = 'admin'` 也能匹配到
 * 已经是 `Admin` 的行，反复执行会自伤）。重复执行时第一步查不到源行，直接返回。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

export async function up({ queryInterface }) {
  await renameSystemKey(queryInterface, 'admin', 'Admin');
}

export async function down({ queryInterface }) {
  await renameSystemKey(queryInterface, 'Admin', 'admin');
}

/**
 * 精确改键名（幂等）
 *
 * @param {object} queryInterface Sequelize 的 QueryInterface
 * @param {string} from 现有键（区分大小写）
 * @param {string} to 目标键
 * @returns {Promise<void>}
 */
async function renameSystemKey(queryInterface, from, to) {
  const escape = value => queryInterface.sequelize.escape(value);
  const find = key =>
    queryInterface.sequelize.query(`SELECT system_key FROM guard_configs WHERE BINARY system_key = ${escape(key)}`);

  const [source] = await find(from);
  if (source.length === 0) return; // 已是目标形态，或该行不存在

  const [target] = await find(to);
  // 两种写法并存属于异常状态（正常被唯一键挡住）。不擅自合并 —— 保留两行让运维确认
  // 哪一份是当前策略后再清，比自动删掉一份更安全。
  if (target.length > 0) return;

  await queryInterface.sequelize.query(
    `UPDATE guard_configs SET system_key = ${escape(to)} WHERE BINARY system_key = ${escape(from)}`
  );
}
