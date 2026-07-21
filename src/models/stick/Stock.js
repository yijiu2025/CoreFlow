/**
 * 股票基础信息模型
 * 存储用户关注的股票信息
 *
 * @author <作者>
 * @since 2026-07-20
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} Stock 模型
 */
export default (sequelize, DataTypes) => {
  const Stock = sequelize.define(
    'Stock',
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
      code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: '股票代码（如 600519）'
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '股票名称（如 贵州茅台）'
      },
      market: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '市场：1=沪市 2=深市 3=港市 4=美股'
      },
      industry: {
        type: DataTypes.STRING(50),
        comment: '所属行业'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'stick_stock',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['code'], name: 'idx_stock_code' },
        { fields: ['user_id'], name: 'idx_stock_user' },
        { fields: ['market'], name: 'idx_stock_market' }
      ],
      comment: '股票基础信息表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  Stock.associate = (models) => {
    Stock.hasMany(models.Position, { foreignKey: 'stock_id', as: 'positions' });
    Stock.hasMany(models.Trade, { foreignKey: 'stock_id', as: 'trades' });
    Stock.hasMany(models.Analysis, { foreignKey: 'stock_id', as: 'analyses' });
    Stock.hasMany(models.Journal, { foreignKey: 'stock_id', as: 'journals' });
  };

  return Stock;
};
