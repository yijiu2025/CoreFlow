/**
 * 持仓记录模型
 * 存储用户当前持有的股票
 *
 * @author <作者>
 * @since 2026-07-20
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} Position 模型
 */
export default (sequelize, DataTypes) => {
  const Position = sequelize.define(
    'Position',
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
      quantity: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '持有数量'
      },
      avg_cost: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        field: 'avg_cost',
        comment: '平均成本价'
      },
      total_cost: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'total_cost',
        comment: '总投入金额'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '1=持有 0=已清仓'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'stick_position',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['stock_id'], name: 'idx_position_stock' },
        { fields: ['user_id'], name: 'idx_position_user' },
        { fields: ['status'], name: 'idx_position_status' }
      ],
      comment: '持仓记录表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  Position.associate = (models) => {
    Position.belongsTo(models.Stock, { foreignKey: 'stock_id', as: 'stock' });
    Position.hasMany(models.Trade, { foreignKey: 'position_id', as: 'trades' });
  };

  return Position;
};
