/**
 * RetroWeb 大模型端点配置表（per-user）
 *
 * 🔴 取代 Python 侧那份**全局** `web/llm_settings.json`：绑定用户后，端点与密钥
 *    必须按用户隔离，否则 A 用户会花掉 B 用户的 token，且谁改都影响全站。
 *
 * 🔴 `keys_enc` 是**加密**存储（复用 framework/keys），且**永不回传明文**：
 *    接口只回掩码（与前端 `mask_key` 保尾部的口径一致）。
 *    谁能在日志里看到明文，等于谁的日志就能泄露别人的 key —— 所以加密 + 掩码两条都要。
 *
 * @since 2026-10-09
 */

/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {object} LlmProfile 模型
 */
const defineLlmProfile = (sequelize, DataTypes) => {
  const LlmProfile = sequelize.define(
    'LlmProfile',
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
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: '默认',
        comment: '配置名（可存多套）'
      },
      base_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        defaultValue: '',
        comment: '端点地址'
      },
      model: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: '',
        comment: '模型名（与 base_url 绑一套，不能分开改）'
      },
      keys_enc: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '🔴 加密后的 key 列表（明文永不落库、永不回传）'
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为当前生效的一套（每用户最多一个 true）'
      },
      max_tokens: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '0 = 不限制（此时不向模型下发该字段）'
      },
      extra_json: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '其余透传参数（temperature / thinking 等）'
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    {
      tableName: 'retroweb_llm_profile',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['user_id'], name: 'idx_llm_profile_user' },
        { fields: ['user_id', 'active'], name: 'idx_llm_profile_active' }
      ],
      comment: 'RetroWeb 大模型端点配置（per-user，密钥加密）'
    }
  );

  LlmProfile.associate = models => {
    LlmProfile.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return LlmProfile;
};

export default defineLlmProfile;
