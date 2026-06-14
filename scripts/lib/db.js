/**
 * 数据库工具模块
 * 封装 Sequelize 连接、模型加载和常用数据库操作
 *
 * @module scripts/lib/db
 * @example
 * import { loadAllModels, getModels, closeDb } from './lib/db.js';
 * await loadAllModels();
 * const { User, Role } = getModels();
 */
import sequelize from '../../src/db/index.js';

// ============== 模型加载 ==============

/**
 * 模型加载顺序配置
 * 按依赖关系排序，确保关联模型先加载
 */
const MODEL_IMPORT_ORDER = [
  // 用户域
  '../../src/models/user/User.js',
  '../../src/models/user/UserIdentity.js',

  // 访问控制域
  '../../src/models/iam/Role.js',
  '../../src/models/iam/UserRole.js',
  '../../src/models/iam/InlinePolicy.js',
  '../../src/models/iam/Permission.js',

  // 会话域
  '../../src/models/session/UserSession.js',
  '../../src/models/session/SessionToken.js',
  '../../src/models/session/SessionLog.js',
  '../../src/models/session/AuditLog.js',

  // OAuth 域
  '../../src/models/oauth21/OauthClient.js',
  '../../src/models/oauth21/OauthCode.js',
  '../../src/models/oauth21/OauthToken.js',
  '../../src/models/oauth21/OauthApproval.js',
  '../../src/models/oauth21/OauthConsent.js',

  // 通知域
  '../../src/models/notice/EmailCode.js',
  '../../src/models/notice/NoticeConfig.js'
];

/**
 * 加载所有模型
 * 按照依赖顺序依次加载，确保模型关联正确建立
 *
 * @returns {Promise<void>}
 * @throws {Error} 模型加载失败时抛出错误
 */
export async function loadAllModels() {
  const errors = [];

  for (const modelPath of MODEL_IMPORT_ORDER) {
    try {
      await import(modelPath);
    } catch (err) {
      const modelName = modelPath.split('/').pop().replace('.js', '');
      errors.push({ model: modelName, error: err.message });
    }
  }

  if (errors.length > 0) {
    const failedModels = errors.map((e) => e.model).join(', ');
    console.warn(`⚠️  [DB] 部分模型加载失败: ${failedModels}`);
  }
}

// ============== 连接管理 ==============

/**
 * 获取 Sequelize 实例
 * @returns {import('sequelize').Sequelize}
 */
export function getSequelize() {
  return sequelize;
}

/**
 * 获取所有已加载的模型
 * @returns {object} 模型集合，如 { User, Role, ... }
 */
export function getModels() {
  return sequelize.models;
}

/**
 * 获取指定命名空间的模型
 * @param {string} namespace - 命名空间，如 'user', 'iam', 'oauth21'
 * @returns {object} 该命名空间下的模型集合
 */
export function getModelsByNamespace(namespace) {
  const models = sequelize.models;
  const namespaceModels = {};

  for (const [name, model] of Object.entries(models)) {
    // 通过表名前缀判断命名空间
    const tableName = model.tableName || '';
    if (tableName.startsWith(`${namespace}_`) || tableName.startsWith(`${namespace}-`)) {
      namespaceModels[name] = model;
    }
  }

  return namespaceModels;
}

/**
 * 测试数据库连接
 * @returns {Promise<boolean>} 连接是否成功
 */
export async function testConnection() {
  try {
    await sequelize.authenticate();
    return true;
  } catch {
    return false;
  }
}

/**
 * 关闭数据库连接
 * 建议在脚本结束时调用，确保连接正确释放
 * @returns {Promise<void>}
 */
export async function closeDb() {
  try {
    await sequelize.close();
  } catch {
    // 忽略关闭错误
  }
}

// ============== 查询工具 ==============

/**
 * 获取所有表名
 * @returns {Promise<string[]>} 表名数组
 */
export async function getTableNames() {
  const [results] = await sequelize.query('SHOW TABLES');
  return results.map((r) => Object.values(r)[0]);
}

/**
 * 获取表的行数
 * @param {string} tableName - 表名
 * @returns {Promise<number>} 行数
 */
export async function getTableRowCount(tableName) {
  const [results] = await sequelize.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
  return results[0]?.count || 0;
}

/**
 * 获取表的列信息
 * @param {string} tableName - 表名
 * @returns {Promise<Array>} 列信息数组
 */
export async function getTableColumns(tableName) {
  const [columns] = await sequelize.query(`DESCRIBE \`${tableName}\``);
  return columns;
}

/**
 * 检查表是否存在
 * @param {string} tableName - 表名
 * @returns {Promise<boolean>}
 */
export async function tableExists(tableName) {
  const tables = await getTableNames();
  return tables.includes(tableName);
}

// ============== 事务工具 ==============

/**
 * 在事务中执行操作
 * @param {Function} callback - 事务回调函数，接收 transaction 参数
 * @returns {Promise<any>} 回调函数的返回值
 *
 * @example
 * const user = await withTransaction(async (t) => {
 *   const user = await User.create({ username: 'test' }, { transaction: t });
 *   await UserRole.create({ user_id: user.id }, { transaction: t });
 *   return user;
 * });
 */
export async function withTransaction(callback) {
  return await sequelize.transaction(callback);
}
