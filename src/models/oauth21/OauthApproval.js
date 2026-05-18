import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';

/**
 * OAuth 应用授权记录表
 * 记录用户对特定应用的授权状态
 */
const OauthApproval = sequelize.define('OauthApproval', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  uid: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: '用户ID'
  },
  appId: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'app_id',
    comment: '应用唯一标识'
  },
  scopes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '授权的权限范围(JSON数组)'
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
    comment: '状态: 1-正常, 0-已撤销/封禁'
  },
  lastAuthAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'last_auth_at',
    comment: '最后授权时间'
  }
}, {
  tableName: 'user-approval',
  underscored: true,
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['uid', 'app_id']
    }
  ]
});

export default OauthApproval;
