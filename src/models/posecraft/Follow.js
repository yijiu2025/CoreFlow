/**
 * PoseCraft 关注关系模型
 *
 * @author Claude
 * @since 2026-07-13
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} Follow 模型
 */
export default (sequelize, DataTypes) => {
  const Follow = sequelize.define(
    'Follow',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      follower_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'follower_id',
        comment: '关注者用户ID'
      },
      following_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'following_id',
        comment: '被关注者用户ID'
      },
      mutual: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'mutual',
        comment: '是否互关（双方都关注对方）'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_follow',
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          unique: true,
          fields: ['follower_id', 'following_id', 'delete_version'],
          name: 'uk_posecraft_follow'
        },
        {
          fields: ['following_id', 'delete_version'],
          name: 'idx_posecraft_follow_following'
        }
      ],
      comment: 'PoseCraft 关注关系表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  Follow.associate = models => {
    // 关注者 (A) 关注了 (B)
    Follow.belongsTo(models.User, { foreignKey: 'follower_id', as: 'follower' });
    // 被关注者 (B) 被 (A) 关注
    Follow.belongsTo(models.User, { foreignKey: 'following_id', as: 'following' });
  };

  return Follow;
};
