/**
 * 迁移：创建角色授权流水表 iam_role_grant_log
 *
 * 幂等：表 / 索引已存在则跳过，可重复执行。
 *
 * 为什么单独建表而不是写 audit_logs：授权历史要按 user_id 查询（用户详情里的
 * 时间线），JSON 列里查用不上索引；且 grant / revoke 需要能分开筛。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @param {object} ctx.Sequelize Sequelize 构造器
 * @returns {Promise<void>}
 */
export async function up({ queryInterface, Sequelize }) {
  const table = 'iam_role_grant_log';

  const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
  const exists = tables.some(t => Object.values(t)[0] === table);

  if (!exists) {
    await queryInterface.createTable(
      table,
      {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '被授权的用户 ID' },
        username: { type: Sequelize.STRING(64), allowNull: false, comment: '被授权用户账号快照' },
        role_id: { type: Sequelize.BIGINT, allowNull: false, comment: '角色 ID' },
        role_code: { type: Sequelize.STRING(64), allowNull: false, comment: '角色编码快照' },
        role_name: { type: Sequelize.STRING(64), allowNull: false, comment: '角色名称快照' },
        action: { type: Sequelize.STRING(16), allowNull: false, comment: 'grant 授予 / revoke 取消' },
        operator_id: { type: Sequelize.BIGINT, allowNull: true, comment: '操作人用户 ID' },
        operator_name: { type: Sequelize.STRING(64), allowNull: false, comment: '操作人账号快照' },
        app_id: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'GLOBAL', comment: '角色所属应用' },
        remark: { type: Sequelize.STRING(255), allowNull: true, comment: '来源说明' },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: true }
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' }
    );
  }

  /**
   * 索引不存在时才创建
   *
   * @param {string} name 索引名
   * @param {string[]} fields 字段
   * @returns {Promise<void>}
   */
  async function createIndexIfNotExists(name, fields) {
    const [rows] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, {
      replacements: [name]
    });
    if (rows.length === 0) await queryInterface.addIndex(table, fields, { name });
  }

  // 按用户查历史（倒序取最近 N 条）是主查询路径
  await createIndexIfNotExists('idx_grant_log_user', ['user_id', 'id']);
  // 全局时间线 / 清理旧流水
  await createIndexIfNotExists('idx_grant_log_created', ['created_at']);
}

/**
 * 回滚：删除表
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  await queryInterface.dropTable('iam_role_grant_log');
}
