import { sequelize } from '../../db/index.js';

/**
 * 初始化系统基础设置 (Seed Data)
 */
export default async (app) => {
  const { NoticeConfig } = sequelize.models;
  if (!NoticeConfig) return;

  const defaults = [
    { key: 'smtp_server', value: 'smtp.163.com', description: 'SMTP服务器地址', category: 'email' },
    { key: 'smtp_port', value: '465', description: 'SMTP端口 (SSL: 465, TLS: 587)', category: 'email' },
    { key: 'smtp_user', value: '15393412436@163.com', description: 'SMTP用户名', category: 'email' },
    { key: 'smtp_password', value: 'GWvNbFYmfgTFMYEs', description: 'SMTP授权码/密码', category: 'email' },
    { key: 'smtp_from', value: '"Antigravity System" <15393412436@163.com>', description: '发件人显示名称', category: 'email' },
    { key: 'smtp_use_ssl', value: 'true', description: '是否使用 SSL (端口465必选)', category: 'email' }
  ];

  for (const item of defaults) {
    const exist = await NoticeConfig.findByPk(item.key);
    if (!exist) {
      await NoticeConfig.create(item);
      console.log(`🌱 [Seed:Settings] 初始化设置: ${item.key}`);
    } else {
      // 如果已存在但需要强制更新为用户提供的新配置，可以在此处 update
      await exist.update({ value: item.value });
    }
  }
};
