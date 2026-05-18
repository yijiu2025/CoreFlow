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

  // 静态校验方法
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

    const record = await this.findOne({ where });

    if (record) {
      // 校验成功即标记为已使用，防止重放攻击
      await record.update({ status: 1 });
      return true; 
    }
    return false;
  };

  return EmailCode;
};
