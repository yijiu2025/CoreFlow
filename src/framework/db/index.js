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

/**
 * 获取模型
 * 支持三种调用方式：
 *   getModel('User')              → 按模型名查找（flat，从 sequelize.models）
 *   getModel('user.User')         → 点号写法（命名空间 + 模型名）
 *   getModel('user', 'User')      → 双参数（命名空间 + 模型名）
 * 模型名全局唯一，命名空间仅作组织用途，最终都从 sequelize.models 查找
 *
 * @param {string} namespaceOrName - 命名空间（如 'user'）或单参数时的模型名
 * @param {string} [modelName] - 模型名（如 'User'），不传时 namespaceOrName 为模型名或点号写法
 * @returns {object} Sequelize 模型
 * @throws {TypeError} 模型不存在时
 */
function getModel(namespaceOrName, modelName) {
  let name = modelName;
  let ns = namespaceOrName;

  // 单参数点号写法：getModel('user.User')
  if (name === undefined && typeof ns === 'string' && ns.includes('.')) {
    const idx = ns.lastIndexOf('.');
    name = ns.slice(idx + 1);
    ns = ns.slice(0, idx);
  }
  // 单参数：getModel('User') → name = ns
  if (name === undefined) {
    name = ns;
  }

  const model = sequelize.models[name];
  if (!model) {
    throw new TypeError(
      `getModel: 模型 "${name}" 不存在。可用模型: ${Object.keys(sequelize.models).join(', ') || '(无)'}`
    );
  }
  return model;
}

export { sequelize, Sequelize, getModel };
export default sequelize;
