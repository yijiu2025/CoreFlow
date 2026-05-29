import { sequelize } from '../../db/index.js';

const C = { reset: '\x1b[0m', cyan: '\x1b[36m' };

/**
 * 初始化系统基础设置 (Seed Data)
 */
export default async (app) => {
  const { NoticeConfig } = sequelize.models;
  if (!NoticeConfig) return;

  const defaults = [
    { key: 'smtp_server', value: process.env.SMTP_SERVER || 'smtp.163.com', description: 'SMTP服务器地址', category: 'email' },
    { key: 'smtp_port', value: process.env.SMTP_PORT || '465', description: 'SMTP端口 (SSL: 465, TLS: 587)', category: 'email' },
    { key: 'smtp_user', value: process.env.SMTP_USER || '', description: 'SMTP用户名', category: 'email' },
    { key: 'smtp_password', value: process.env.SMTP_PASSWORD || '', description: 'SMTP授权码/密码', category: 'email' },
    { key: 'smtp_from', value: process.env.SMTP_FROM || '', description: '发件人显示名称', category: 'email' },
    { key: 'smtp_use_ssl', value: process.env.SMTP_USE_SSL || 'true', description: '是否使用 SSL (端口465必选)', category: 'email' }
  ];

  for (const item of defaults) {
    const exist = await NoticeConfig.findByPk(item.key);
    if (!exist) {
      await NoticeConfig.create(item);
      console.log(`🌱 [Seed] ${C.cyan}初始化设置: ${item.key}${C.reset}`);
    } else {
      // 如果已存在但需要强制更新为用户提供的新配置，可以在此处 update
      await exist.update({ value: item.value });
    }
  }
};
