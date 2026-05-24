/**
 * OAuth 应用授权记录模型
 *
 * 记录用户（由 OIDC sub 标识）对具体应用（app_id）的授权信息以及分配的 scopes。
 * 遵循项目统一的 snake_case 命名规范。
 */
export default (sequelize, DataTypes) => {
  const OauthApproval = sequelize.define(
    'OauthApproval',
    {
      /** 授权主键 UUID */
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      /** 
       * 受权主体用户 ID (sub claim，存储主系统 User.uid)
       * 安全与对齐：主系统 User.uid 为 UUID，故 sub 统一为 UUID 类型以便建立物理索引外键关联与提升 JOIN 效能
       */
      sub: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: '受权主体用户 ID (sub claim，存储主系统 User.uid)'
      },
      /** 应用唯一标识 */
      app_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '应用唯一标识'
      },
      /** 
       * 授权的权限范围 
       * 统一使用 JSON 数据类型替代 TEXT，提供原生的结构校验和高效率解析
       */
      scopes: {
        type: DataTypes.JSON,
        defaultValue: [],
        comment: '授权的权限范围(JSON数组)'
      },
      /** 状态: 1-正常, 0-已撤销/封禁 */
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-正常, 0-已撤销/封禁'
      },
      /** 最后授权时间 */
      last_auth_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '最后授权时间'
      }
    },
    {
      tableName: 'oauth_user_approval', // 修正：去除了连字符 '-' 以避免 SQL 中不必要的转义负担
      timestamps: true,
      comment: 'OAuth 应用授权记录表',
      indexes: [
        {
          unique: true,
          fields: ['sub', 'app_id']
        }
      ]
    }
  );

  OauthApproval.associate = (models) => {
    // 建立与 User 模型的关联关联关系 (基于 sub -> User.uid)
    OauthApproval.belongsTo(models.User, {
      foreignKey: 'sub',
      targetKey: 'uid',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return OauthApproval;
};
