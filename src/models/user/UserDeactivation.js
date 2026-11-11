/**
 * 用户注销申请模型
 *
 * 用户注销流程：申请提交 → 拒登录(7天撤销期) → 到期正式执行
 * scope=app：注销某 app（清该 app 的授权/session，不动 user 主表）
 * scope=all：注销全部（清所有 app + 软删 user_user）
 *
 * status：1=注销中(待撤销) 2=已撤销 3=已执行(正式注销完成)
 *
 * @author yijiu2025
 * @since 2026-08-23
 */
const defineUserDeactivation = (sequelize, DataTypes) => {
  const UserDeactivation = sequelize.define(
    'UserDeactivation',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联 user_user.id'
      },
      uid: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: '关联 user_user.uid，便于跨表查询 OAuth 数据'
      },
      /**
       * 发起人（管理员从后台发起时填；用户自助时为空）
       *
       * 后台"删除用户"是本仓最高危的写操作，审计必须能回答"这条删除是谁点的"。
       * 名字用快照列而不是 JOIN：发起人账号后来被删了，历史仍要读得懂。
       */
      requested_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '发起人 user_id（管理员发起时填，用户自助时为空）'
      },
      requested_by_name: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '发起人账号快照（账号被删后历史仍可读）'
      },
      scope: {
        type: DataTypes.ENUM('app', 'all'),
        allowNull: false,
        comment: '注销范围：app=单个应用，all=全部数据'
      },
      app_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'scope=app 时填应用标识；scope=all 时为 NULL'
      },
      status: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '1=注销中(待撤销) 2=已撤销 3=已执行(正式注销完成)'
      },
      /**
       * 会话是否还有残留（Redis 踢失败）
       *
       * 注销执行时 DB 里的 session_tokens 一定被 revoke，但 Redis 里的活跃会话要靠
       * 一次网络调用删掉。Redis 不可用那步只能记日志 —— 于是"账号已注销、会话还活着"。
       * 这个标记让失败**落库**，下次登录时补踢（见 deactivation.service.retryPendingKicks）。
       */
      kick_pending: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '1=还有 Redis 会话没踢掉，登录时重试'
      },
      kick_attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '重试踢会话次数'
      },
      kick_last_error: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '最后一次踢失败的原因（截断）'
      },
      kick_updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后一次尝试踢会话的时间'
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '注销原因'
      },
      requested_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '申请提交时间'
      },
      scheduled_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '计划执行时间（requested_at + 7 天）'
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '撤销时间'
      },
      executed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '正式执行时间'
      },
      revoked_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '撤销操作者 user_id（用户自助撤销时填自己，管理员撤销时填管理员 id）'
      }
    },
    {
      tableName: 'user_deactivation',
      timestamps: true,
      underscored: true,
      comment: '用户注销申请'
    }
  );

  UserDeactivation.associate = models => {
    // 关联用户主表（CASCADE：用户被硬删时申请记录一并删除）
    UserDeactivation.belongsTo(models.User, {
      foreignKey: 'user_id',
      targetKey: 'id',
      as: 'user'
    });
  };

  return UserDeactivation;
};

export default defineUserDeactivation;
