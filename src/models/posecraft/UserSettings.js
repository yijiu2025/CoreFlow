/**
 * PoseCraft 用户个性设置表
 *
 * 与系统 User 1:1（一用户一行），存储前端 UI 相关的个性偏好。
 * 如：showTemplate、saveLoginInfo、theme 等。
 *
 * 由前端写回、登录时拉取，后端只负责持久化与合并，不解析具体字段语义。
 *
 * @author Claude
 * @since 2026-07-13
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} UserSettings 模型
 */
export default (sequelize, DataTypes) => {
  const UserSettings = sequelize.define(
    'UserSettings',
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
        unique: true,
        field: 'user_id',
        comment: '系统 User.id，唯一约束保证 1:1'
      },
      /** 用户个性设置 JSON 字符串化存储，字段由前端定义 */
      settings: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON 字符串，如 {"showTemplate":true,"saveLoginInfo":true}'
      }
    },
    {
      tableName: 'posecraft_user_settings',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['user_id'], name: 'uk_settings_user' }
      ],
      comment: 'PoseCraft 用户个性设置（UI 偏好），由前端维护字段语义'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  UserSettings.associate = (models) => {
    UserSettings.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return UserSettings;
};
