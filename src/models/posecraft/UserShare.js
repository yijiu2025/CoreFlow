/**
 * PoseCraft 作品分享模型
 *
 * @author yijiu2025
 * @since 2026-08-06
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} UserShare 模型
 */
import { registerDeleteVersionHooks } from '../../db/softDeleteHooks.js';

export default (sequelize, DataTypes) => {
  const UserShare = sequelize.define(
    'UserShare',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'user_id',
        comment: '分享者用户ID'
      },
      work_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'work_id',
        comment: '分享的作品ID'
      },
      target_user_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'target_user_id',
        comment: '分享目标用户ID（null=公开分享）'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_user_share',
      timestamps: true,
      paranoid: false,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'work_id', 'target_user_id', 'delete_version'],
          name: 'uk_user_share'
        }
      ],
      comment: 'PoseCraft 作品分享记录表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  UserShare.associate = models => {
    UserShare.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserShare.belongsTo(models.Work, { foreignKey: 'work_id', as: 'work' });
  };

  registerDeleteVersionHooks(UserShare);

  return UserShare;
};
