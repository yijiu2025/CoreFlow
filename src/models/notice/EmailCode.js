export default (sequelize, DataTypes) => {
  const EmailCode = sequelize.define(
    'EmailCode',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键自增 ID'
      },
      email: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '接收验证码的邮箱'
      },
      code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: '验证码'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 0, // 0:未使用, 1:已使用
        comment: '验证码状态 (0:未使用, 1:已使用)'
      },
      session_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '发起请求的会话 ID (用于图形验证码/人机校验关联)'
      },
      expired_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '验证码过期截止时间'
      }
    },
    {
      tableName: 'notice_email_codes',
      timestamps: true, // 启用标准的创建和更新时间审计
      indexes: [
        {
          fields: ['email', 'code', 'status'],
          name: 'idx_email_code_status',
          comment: '用于加速高并发防重放原子更新校验的联合索引'
        }
      ]
    }
  );

  // 静态校验方法 (解决高并发重放与竞争漏洞)
  EmailCode.check = async function (email, code, sessionId) {
    const where = {
      email,
      code,
      status: 0,
      expired_at: {
        [sequelize.Sequelize.Op.gt]: new Date()
      }
    };

    if (sessionId) {
      where.session_id = sessionId;
    }

    // 使用原子 Update 更新，借力数据库行锁。
    // 如果返回的 affectedCount = 0，说明要么匹配失败，要么已被其他并发线程捷足先登修改了状态。
    const [affectedCount] = await this.update({ status: 1 }, { where });
    return affectedCount > 0;
  };

  return EmailCode;
};
