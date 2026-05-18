export default (sequelize, DataTypes) => {
  const EmailCode = sequelize.define(
    'EmailCode',
    {
      email: {
        type: DataTypes.STRING,
        allowNull: false
      },
      code: {
        type: DataTypes.STRING(10),
        allowNull: false
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 0 // 0:未使用, 1:已使用
      },
      session_id: {
        type: DataTypes.STRING,
        allowNull: true
      },
      expired_at: {
        type: DataTypes.DATE,
        allowNull: false
      }
    },
    {
      tableName: 'email_codes'
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
