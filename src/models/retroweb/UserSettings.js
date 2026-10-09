/**
 * RetroWeb 用户设置表（1:1 用户）
 *
 * 存 UI 偏好类设置：主题、供应商偏好、面板折叠态、条件枚举偏好等。
 * 由前端写回、登录时拉取，后端只负责持久化，**不解析字段语义**（与 posecraft 同口径）。
 *
 * 🔴 与 `LlmProfile` 的分界：这里只放**无所谓泄露**的偏好；涉及密钥的一律走
 *    LlmProfile 的加密列，不要图省事塞进 settings_json。
 *
 * @since 2026-10-09
 */

/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {object} UserSettings 模型
 */
const defineUserSettings = (sequelize, DataTypes) => {
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
        comment: '系统 User.id，唯一约束保证 1:1'
      },
      settings: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON 字符串，字段语义由前端定义'
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    {
      tableName: 'retroweb_user_settings',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['user_id'], name: 'uk_retroweb_settings_user' }],
      comment: 'RetroWeb 用户设置（UI 偏好，字段语义由前端维护）'
    }
  );

  UserSettings.associate = models => {
    UserSettings.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return UserSettings;
};

export default defineUserSettings;
