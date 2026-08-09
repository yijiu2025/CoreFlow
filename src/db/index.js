/**
 * 数据库连接初始化
 * 创建 Sequelize 实例，校验必要环境变量，配置连接池
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

/* eslint-disable no-console */

import { Sequelize } from 'sequelize';

const C = { reset: '\x1b[0m', red: '\x1b[31m' };

const { DB_TYPE, DB_USER, DB_PASS, DB_HOST, DB_PORT, DB_NAME } = process.env;

// 启动时校验必要配置
const required = { DB_HOST, DB_NAME, DB_USER };
const missing = Object.entries(required).filter(([, v]) => !v);
if (missing.length > 0) {
  console.error(`❌ [DB] ${C.red}缺少必要环境变量: ${missing.map(([k]) => k).join(', ')}${C.reset}`);
  // 延迟退出，确保错误日志刷新
  setTimeout(() => process.exit(1), 100);
}

const dsn = `${DB_TYPE || 'mysql'}://${DB_USER}:${encodeURIComponent(DB_PASS || '')}@${DB_HOST}:${DB_PORT || 3306}/${DB_NAME}`;

const sequelize = new Sequelize(dsn, {
  logging: false,
  define: {
    timestamps: true,
    underscored: true
  },
  dialectOptions: {
    connectTimeout: 10000
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10'),
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000'),
    idle: parseInt(process.env.DB_POOL_IDLE || '10000')
  }
});

export { sequelize, Sequelize };
export default sequelize;
