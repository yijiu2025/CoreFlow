export default (sequelize, DataTypes) => {
  const NoticeConfig = sequelize.define(
    'NoticeConfig',
    {
      key: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        primaryKey: true
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true
      },
      category: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'email' // email, dingtalk, wechat
      }
    },
    {
      tableName: 'notice_configs',
      timestamps: true
    }
  );

  /**
   * 静态快捷方法：获取设置
   */
  NoticeConfig.getVal = async function (key, defaultValue = '') {
    const record = await this.findByPk(key);
    return record ? record.value : defaultValue;
  };

  /**
   * 静态快捷方法：保存设置
   */
  NoticeConfig.setVal = async function (key, value, description = '', category = 'email') {
    return await this.upsert({ key, value, description, category });
  };

  return NoticeConfig;
};
