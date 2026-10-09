/**
 * RetroWeb 路线方案表
 *
 * 同一目标分子可以保存多条路线方案（横向对比、切换、fork）。
 *
 * 🔴 独立于 Task.snapshot：方案对比要"按任务列出所有方案并算统计"，
 *    若埋在任务 JSON 里，每次对比都得把整棵树拉出来再翻一遍。
 *
 * @since 2026-10-09
 */

/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {object} Scheme 模型
 */
const defineScheme = (sequelize, DataTypes) => {
  const Scheme = sequelize.define(
    'Scheme',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '自增主键'
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属用户'
      },
      task_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属任务'
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        defaultValue: '',
        comment: '方案名'
      },
      route_json: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '路线内容（节点/边/已选反应）'
      },
      stats_json: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '体检结果：步数 / 总概率 / 起点可得性等（对比表直接读）'
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      deleted_at: { type: DataTypes.DATE, allowNull: true, comment: '软删' }
    },
    {
      tableName: 'retroweb_scheme',
      timestamps: true,
      underscored: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id', 'task_id'], name: 'idx_scheme_user_task' },
        { fields: ['task_id', 'updated_at'], name: 'idx_scheme_task_updated' }
      ],
      comment: 'RetroWeb 路线方案（同任务多方案，用于对比/切换）'
    }
  );

  Scheme.associate = models => {
    Scheme.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Scheme;
};

export default defineScheme;
