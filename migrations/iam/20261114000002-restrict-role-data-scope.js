/**
 * 数据范围收紧：除管理员 / 审核员 / 观察者外，一律「仅本人」
 *
 * 规则：`data_scope` 只有三类角色可以不是 5（仅本人）——
 *   · `*_admin`（含 `superadmin`）
 *   · `*_operator`（审核员 / 操作员）
 *   · `*_viewer`（观察者，需要看全站数据才能审阅）
 *
 * 其余角色（`*_user` / `*_vip` / `*_creator` / `user_normal` / 自定义编码）统一压到 5。
 *
 * 为什么必须一次性重置存量：`resolveDataScope` 是"取角色并集 + 全部一票通过"，
 * 只要某个角色还留着 1，持有它的人就仍然能看到全量数据 —— 代码层的写入校验只挡
 * 之后的编辑，挡不住已经在库里的旧值。
 *
 * 只动 `delete_version = 0` 的活跃角色，软删的保持原样（不影响任何人，改了也只是噪音）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
export async function up({ queryInterface }) {
  await queryInterface.sequelize.query(
    `UPDATE iam_role
        SET data_scope = 5
      WHERE delete_version = 0
        AND data_scope <> 5
        AND code <> 'superadmin'
        AND code NOT REGEXP '^.+_(admin|operator|viewer)$'`
  );
}

/**
 * 回滚
 *
 * 刻意留空：这里丢的是"哪些角色曾经被放宽到非本人档位"的信息，无法可靠还原；
 * 而把全体角色统一打回 1（全部）会造成一次静默的权限放宽 —— 比不回滚危险得多。
 * 需要恢复时按角色逐个在界面上配置。
 *
 * @returns {Promise<void>}
 */
export async function down() {
  // no-op：见上
}
