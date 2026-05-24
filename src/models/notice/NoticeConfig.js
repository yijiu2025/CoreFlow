export default (sequelize, DataTypes) => {
  const NoticeConfig = sequelize.define(
    'NoticeConfig',
    {
      /**
       * 配置项唯一标识键
       * 明确指定主键长度为 64，避免默认 VARCHAR(255) 造成 InnoDB 二级索引体积膨胀
       */
      key: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        primaryKey: true
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      category: {
        type: DataTypes.STRING(32),
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
