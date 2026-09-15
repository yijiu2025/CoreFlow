/**
 * 模型加载与数据库查询工具
 *
 * 定位：跨业务 DB 基础设施，零业务语义。供两处共用：
 * - 应用启动的 loader registry（`framework/loader/registry/06-models.js`）
 * - CLI 宿主与各应用的 CLI 插件（非 Fastify 进程，拿不到 `app.db`）
 *
 * 为什么放在 `src/` 而不是 `scripts/`：
 * `src/` 内的代码不得反向依赖 `scripts/` —— `scripts/` 是**可选宿主**，不一定随部署安装。
 *
 * 关于模型清单：本模块**只扫描目录，不维护任何手工模型清单**。
 * 历史上 `scripts/lib/db.js` 硬编码了一份 `MODEL_IMPORT_ORDER`，实际导出了 17 个模型，
 * 而 `src/models/` 下有 32 个文件 —— `key/` `posecraft/` `guard/` 共 15 个模型从未被 CLI 加载，
 * 且那份实现**从不调用 `associate()`**（22 个模型定义了关联），
 * 于是 CLI 里凡是依赖关联（`include`）的查询都会失败。扫描式加载从结构上消除了这类漂移。
 *
 * @module framework/db/models
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DataTypes } from 'sequelize';
import { sequelize } from './index.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.db.models');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 模型根目录（`src/models`）
 * @type {string}
 */
const MODELS_DIR = path.resolve(__dirname, '../../models');

// ============== 模型加载 ==============

/**
 * 扫描模型目录，按子目录自动推导命名空间
 *
 * 每个 `.js` 文件默认导出一个工厂函数 `(sequelize, DataTypes) => Model`；
 * 工厂也可返回模型字典（取 `Object.values`）。本函数**只做扫描与实例化**，
 * 不建立关联、不写日志、不碰任何全局状态 —— 调用方自行决定后续处理。
 *
 * @param {string} [dir=MODELS_DIR] 起始目录
 * @returns {Promise<{entries: Array<{namespace: string, name: string, model: object}>, errors: Array<{file: string, error: string, cause?: Error}>}>}
 *   `entries` 为已实例化的模型（namespace 为空串表示根目录下的模型）；
 *   `errors` 为加载失败的文件，`error` 是消息、`cause` 是原始异常（保留堆栈供排查）
 */
async function scanModels(dir = MODELS_DIR) {
  const entries = [];
  const errors = [];

  async function walk(currentDir, namespace = '') {
    if (!fs.existsSync(currentDir)) return;

    for (const item of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, item.name);

      if (item.isDirectory()) {
        await walk(fullPath, namespace ? `${namespace}.${item.name}` : item.name);
        continue;
      }

      if (!item.name.endsWith('.js')) continue;

      try {
        const { default: modelDefine } = await import(pathToFileURL(fullPath).href);

        if (typeof modelDefine !== 'function') {
          errors.push({ file: item.name, error: '默认导出不是工厂函数 (sequelize, DataTypes) => Model' });
          continue;
        }

        const result = modelDefine(sequelize, DataTypes);
        const models = result && result.name ? [result] : Object.values(result || {});

        for (const model of models) {
          if (!model || !model.name) continue;
          entries.push({ namespace, name: model.name, model });
        }
      } catch (error) {
        errors.push({ file: item.name, error: error.message, cause: error });
      }
    }
  }

  await walk(dir);
  return { entries, errors };
}

/**
 * 建立模型关联
 *
 * 必须在**所有模型都注册完毕**之后统一调用（关联的目标模型可能后加载），
 * 否则 `Model.associate` 里的 `sequelize.models.X` 取到 undefined。
 *
 * @param {Array<{name: string, model: object}>} entries 模型条目
 * @returns {number} 成功建立关联的模型数
 */
function associateModels(entries) {
  let ok = 0;

  for (const { name, model } of entries) {
    if (typeof model.associate !== 'function') continue;
    try {
      model.associate(sequelize.models);
      ok++;
    } catch (err) {
      // 不中断启动：单个模型关联失败只影响依赖它的 include 查询，
      // 但必须显式告警 —— 静默吞掉会让缺失的关联在运行期变成难以定位的查询报错。
      log.error(`模型 [${name}] associate 失败: ${err.message}`);
    }
  }

  return ok;
}

/**
 * 加载全部模型并建立关联
 *
 * 供**非 Fastify 进程**（CLI / 脚本）使用：这类进程不会执行 loader registry，
 * 需要自行把模型注册进 `sequelize.models`。
 *
 * @param {object} [options={}] 配置
 * @param {(err: {file: string, error: string, cause?: Error}) => void} [options.onError] 自定义错误处理（默认记 warn 日志）
 * @returns {Promise<{count: number, associated: number, errors: Array<{file: string, error: string, cause?: Error}>}>}
 */
async function loadAllModels({ onError } = {}) {
  const { entries, errors } = await scanModels();

  for (const err of errors) {
    if (onError) onError(err);
    else log.warn(`模型 [${err.file}] 加载失败: ${err.error}`);
  }

  const associated = associateModels(entries);

  return { count: entries.length, associated, errors };
}

// ============== 连接管理 ==============

/**
 * 获取 Sequelize 实例
 * @returns {import('sequelize').Sequelize}
 */
function getSequelize() {
  return sequelize;
}

/**
 * 获取所有已加载的模型
 * @returns {object} 模型集合，如 { User, Role, ... }
 */
function getModels() {
  return sequelize.models;
}

/**
 * 获取指定命名空间的模型
 * @param {string} namespace - 命名空间，如 'user', 'iam', 'oauth21'
 * @returns {object} 该命名空间下的模型集合
 */
function getModelsByNamespace(namespace) {
  const namespaceModels = {};

  for (const [name, model] of Object.entries(sequelize.models)) {
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
async function testConnection() {
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
async function closeDb() {
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
async function getTableNames() {
  const [results] = await sequelize.query('SHOW TABLES');
  return results.map(r => Object.values(r)[0]);
}

/**
 * 获取表的行数
 * @param {string} tableName - 表名
 * @returns {Promise<number>} 行数
 */
async function getTableRowCount(tableName) {
  const [results] = await sequelize.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
  return results[0]?.count || 0;
}

/**
 * 获取表的列信息
 * @param {string} tableName - 表名
 * @returns {Promise<Array>} 列信息数组
 */
async function getTableColumns(tableName) {
  const [columns] = await sequelize.query(`DESCRIBE \`${tableName}\``);
  return columns;
}

/**
 * 检查表是否存在
 * @param {string} tableName - 表名
 * @returns {Promise<boolean>}
 */
async function tableExists(tableName) {
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
 * const user = await withTransaction(async t => {
 *   const user = await User.create({ username: 'test' }, { transaction: t });
 *   await UserRole.create({ user_id: user.id }, { transaction: t });
 *   return user;
 * });
 */
async function withTransaction(callback) {
  return await sequelize.transaction(callback);
}

export {
  MODELS_DIR,
  scanModels,
  associateModels,
  loadAllModels,
  getSequelize,
  getModels,
  getModelsByNamespace,
  testConnection,
  closeDb,
  getTableNames,
  getTableRowCount,
  getTableColumns,
  tableExists,
  withTransaction
};
