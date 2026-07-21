/**
 * 交易记录模型
 * 存储用户的买入和卖出记录
 *
 * @author <作者>
 * @since 2026-07-20
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} Trade 模型
 */
export default (sequelize, DataTypes) => {
  const Trade = sequelize.define(
    'Trade',
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
      position_id: {
        type: DataTypes.BIGINT,
        field: 'position_id',
        comment: '关联持仓'
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'user_id',
        comment: '关联用户'
      },
      type: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '1=买入 2=卖出'
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '成交价格'
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '成交数量'
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: '成交金额'
      },
      fee: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        comment: '手续费'
      },
      trade_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'trade_date',
        comment: '交易日期'
      },
      note: {
        type: DataTypes.TEXT,
        comment: '备注'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'stick_trade',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['stock_id'], name: 'idx_trade_stock' },
        { fields: ['position_id'], name: 'idx_trade_position' },
        { fields: ['user_id'], name: 'idx_trade_user' },
        { fields: ['type'], name: 'idx_trade_type' },
        { fields: ['trade_date'], name: 'idx_trade_date' }
      ],
      comment: '交易记录表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  Trade.associate = (models) => {
    Trade.belongsTo(models.Stock, { foreignKey: 'stock_id', as: 'stock' });
    Trade.belongsTo(models.Position, { foreignKey: 'position_id', as: 'position' });
  };

  return Trade;
};
