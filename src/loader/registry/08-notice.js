import { sequelize } from '../../db/index.js';

const C = { reset: '\x1b[0m', cyan: '\x1b[36m' };

/**
 * 初始化系统基础设置 (Seed Data)
 * 仅当数据库中不存在记录时创建默认值，不覆盖用户已有的配置。
 * 环境变量仅用于首次初始化的默认值。
 */
export default async (app) => {
  const { NoticeConfig } = sequelize.models;
  if (!NoticeConfig) return;

  const defaults = [
    { key: 'smtp_server', env: 'SMTP_SERVER', fallback: 'smtp.163.com', description: 'SMTP服务器地址', category: 'email' },
    { key: 'smtp_port', env: 'SMTP_PORT', fallback: '465', description: 'SMTP端口 (SSL: 465, TLS: 587)', category: 'email' },
    { key: 'smtp_user', env: 'SMTP_USER', fallback: '', description: 'SMTP用户名', category: 'email' },
    { key: 'smtp_password', env: 'SMTP_PASSWORD', fallback: '', description: 'SMTP授权码/密码', category: 'email' },
    { key: 'smtp_from', env: 'SMTP_FROM', fallback: '', description: '发件人显示名称', category: 'email' },
    { key: 'smtp_use_ssl', env: 'SMTP_USE_SSL', fallback: 'true', description: '是否使用 SSL (端口465必选)', category: 'email' }
  ];

  for (const item of defaults) {
    const exist = await NoticeConfig.findByPk(item.key);
    if (!exist) {
      // 数据库中不存在，使用环境变量或 fallback 作为初始值
      const value = process.env[item.env] || item.fallback;
      await NoticeConfig.create({ key: item.key, value, description: item.description, category: item.category });
      console.log(`🌱 [Seed] ${C.cyan}初始化设置: ${item.key}${C.reset}`);
    }
    // 已存在则跳过，不覆盖用户通过管理后台配置的值
  }
};
