/**
 * 用户内联策略表 (PBAC 个人特权/黑名单)
 */
export default (sequelize, DataTypes) => {
  const InlinePolicy = sequelize.define(
    'InlinePolicy',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联用户ID'
      },
      app_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'GLOBAL',
        comment: '应用标识'
      },
      policy: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '用户个人的策略文档 (PBAC 核心)'
      }
    },
    {
      tableName: 'user_inline_policy',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id', 'app_id'] }
      ]
    }
  );

  InlinePolicy.associate = (models) => {
    InlinePolicy.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return InlinePolicy;
};
