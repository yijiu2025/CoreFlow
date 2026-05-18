import sequelize from '../../db/index.js';
import Logger from '../../log/index.js';

class NoticeDao {
  /**
   * 获取通知配置 (Email, DingTalk, etc.)
   * @param {string} type - 'email' | 'dingtalk' | 'wechat'
   */
  async getConfig(type) {
    const { NoticeConfig } = sequelize.models;
    if (!NoticeConfig) return {};

    if (type === 'email') {
      return {
        host: await NoticeConfig.getVal('smtp_server', 'smtp.163.com'),
        port: parseInt(await NoticeConfig.getVal('smtp_port', '465')),
        user: await NoticeConfig.getVal('smtp_user', ''),
        pass: await NoticeConfig.getVal('smtp_password', ''),
        from: await NoticeConfig.getVal('smtp_from', ''),
        secure: (await NoticeConfig.getVal('smtp_use_ssl', 'true')) === 'true'
      };
    }
    return {};
  }

  /**
   * 保存通知配置
   */
  async saveConfig(type, config) {
    const { NoticeConfig } = sequelize.models;
    if (!NoticeConfig) throw new Error('NoticeConfig model not found');

    Logger.info(`[Notice:Dao] 正在更新 ${type} 配置`);

    if (type === 'email') {
      const mappings = {
        host: 'smtp_server',
        port: 'smtp_port',
        user: 'smtp_user',
        pass: 'smtp_password',
        from: 'smtp_from',
        secure: 'smtp_use_ssl'
      };

      for (const [prop, key] of Object.entries(mappings)) {
        if (config[prop] !== undefined) {
          await NoticeConfig.setVal(key, config[prop].toString(), '', 'email');
        }
      }
    }
    return true;
  }

  /**
   * 获取所有可用的通知通道
   */
  async getAvailableChannels() {
    return [
      { id: 'email', name: '邮件通知', enabled: true },
      { id: 'dingtalk', name: '钉钉机器人', enabled: false },
      { id: 'wechat', name: '微信推送', enabled: false }
    ];
  }
}

export default new NoticeDao();
