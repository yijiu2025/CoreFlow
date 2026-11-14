/**
 * 把默认角色 `user_normal` 的数据范围收成「仅本人」
 *
 * 背景：`iam_role.data_scope` 的列默认值是 1（全部），而 `user_normal` 是
 * **登录即送**的底噪角色 —— 每个新注册 / 新建的账号都会被绑上它。于是：
 *
 *   `resolveDataScope` 取角色并集、且"全部"一票通过 ⇒ 任何新账号一出生就拥有全量
 *   数据范围，管理员给配的「本部门」「本部门及以下」全被抬成「全部」。
 *
 * 实测复现（2026-11-14）：给某用户配 data_scope=3 的角色，只要 `user_normal` 还在，
 * 解析结果就是 `mode: 'all'`；把它摘掉才变成 `depts: [19]`。
 *
 * 这里只改**仍是默认值 1** 的行：管理员如果已经手工把它改成 3/4/5，说明是刻意设置，
 * 不该被迁移覆盖。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
export async function up({ queryInterface }) {
  await queryInterface.sequelize.query(
    "UPDATE iam_role SET data_scope = 5 WHERE code = 'user_normal' AND app_id = 'GLOBAL' AND data_scope = 1"
  );
}

/**
 * 回滚
 *
 * 只回滚"仍是 5"的行，避免把之后人工改过的范围也一起打回 1。
 *
 * @param {object} ctx Umzug 上下文
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  await queryInterface.sequelize.query(
    "UPDATE iam_role SET data_scope = 1 WHERE code = 'user_normal' AND app_id = 'GLOBAL' AND data_scope = 5"
  );
}
