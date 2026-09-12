/**
 * 迁移：session_tokens 表新增 family_id 字段
 *
 * family_id：登录链（family）标识。同一设备同一次登录在 30 天内不断轮转
 * sid/sid_r 产生的所有凭证属于同一 family，盗用检测命中后 revokeFamily 整链吊销。
 *
 * 背景：familyId 此前只存在于 Redis（sessionData / familyStore / rotatedStore），
 * DB 完全不存。Redis session 被驱逐后 getSession 从 DB 重建 sessionData 时
 * familyId 永久丢失，下次 sid_r 轮转会新建孤儿 family——盗用检测仍能命中
 * （rotatedStore 独立持久化），但 revokeFamily 的吊销范围退化为孤儿 family，
 * 原 family 残留的活跃 rt（updateRememberMe 反复开关等场景产生）漏吊。
 * 本列作为 familyId 的持久锚点，重建/轮转时回读，孤儿化不再发生。
 *
 * 存量行不回填（历史链的 familyId 已不可考，Redis 仍在的会自然延续；
 * 丢失的按既有孤儿逻辑运行，与修复前行为一致）。
 *
 * 幂等：字段已存在时跳过
 */
export async function up({ queryInterface, Sequelize }) {
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM session_tokens LIKE 'family_id'");
  if (rows.length === 0) {
    await queryInterface.addColumn('session_tokens', 'family_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: '登录链（family）标识：同一次登录轮转产生的所有凭证同族，盗用后整链吊销',
      after: 'device_id_original'
    });
    await queryInterface.addIndex('session_tokens', ['family_id'], {
      name: 'idx_session_token_family'
    });
  }
}

export async function down({ queryInterface }) {
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM session_tokens LIKE 'family_id'");
  if (rows.length > 0) {
    await queryInterface.removeIndex('session_tokens', 'idx_session_token_family');
    await queryInterface.removeColumn('session_tokens', 'family_id');
  }
}
