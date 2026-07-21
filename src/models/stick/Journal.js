/**
 * 交易日志模型
 * 存储用户的交易复盘和经验
 *
 * @author <作者>
 * @since 2026-07-20
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} Journal 模型
 */
export default (sequelize, DataTypes) => {
  const Journal = sequelize.define(
    'Journal',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      uid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true,
        comment: 'UUID，对外暴露'
      },
      stock_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'stock_id',
        comment: '关联股票'
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'user_id',
        comment: '关联用户'
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '日志标题'
      },
      content: {
        type: DataTypes.TEXT,
        comment: '日志内容'
      },
      mood: {
        type: DataTypes.TINYINT,
        defaultValue: 2,
        comment: '1=乐观 2=中性 3=悲观'
      },
      lesson: {
        type: DataTypes.TEXT,
        comment: '学到的经验'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'stick_journal',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['stock_id'], name: 'idx_journal_stock' },
        { fields: ['user_id'], name: 'idx_journal_user' },
        { fields: ['mood'], name: 'idx_journal_mood' },
        { fields: ['created_at'], name: 'idx_journal_created' }
      ],
      comment: '交易日志表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  Journal.associate = (models) => {
    Journal.belongsTo(models.Stock, { foreignKey: 'stock_id', as: 'stock' });
  };

  return Journal;
};
