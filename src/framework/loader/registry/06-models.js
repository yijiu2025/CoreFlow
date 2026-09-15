/**
 * Loader：模型自动加载
 *
 * 扫描与实例化逻辑统一在 `framework/db/models.js`，本步骤只负责：
 * ① 把模型挂到 `app.db`（按子目录分命名空间）；② 建立关联；③ DB_SYNC 与日志。
 * 这样 CLI（非 Fastify 进程）与应用启动走的是**同一套**模型加载实现，不会各改各的。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { sequelize, getModel } from '../../db/index.js';
import { scanModels, associateModels, MODELS_DIR } from '../../db/models.js';
import { C } from '../../../utils/colors.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.loader.registry.06-models');

const modelsLoader = async app => {
  const db = app.db;
  const loadErrors = []; // 收集加载失败的模型，末尾统一告警

  // 递归扫描模型目录，按子目录自动创建命名空间
  // 每个 .js 文件导出工厂函数 (sequelize, DataTypes) => Model
  const { entries, errors } = await scanModels(MODELS_DIR);

  for (const { namespace, name, model } of entries) {
    if (namespace) {
      if (!db[namespace]) db[namespace] = {};
      db[namespace][name] = model;
    } else {
      db[name] = model;
    }
  }

  for (const err of errors) {
    loadErrors.push(err);
    // 传原始异常（cause）而不是消息串，保留堆栈 —— 模型加载失败多为语法错误，没有堆栈很难定位到行
    log.error(`❌ [Loader: Models] ${C.red}模型 [${err.file}] 加载失败${C.reset}`, err.cause || err.error);
  }

  // 执行模型关联 (associate) —— 必须在全部模型注册完毕后统一进行
  associateModels(entries);

  // 注册模型获取方法：app.db.getModel 委托给独立 getModel
  // 支持 getModel('User') / getModel('user.User') / getModel('user', 'User')
  db.getModel = getModel;

  // 自动同步表结构（仅限首次开发环境建表，后续变更请使用迁移）
  if (process.env.DB_SYNC === 'true') {
    if (process.env.NODE_ENV === 'production') {
      log.error(
        `❌ [Loader: Models] ${C.red}拒绝在生产环境执行 DB_SYNC！请使用 npm run migrate 管理表结构变更。${C.reset}`
      );
      process.exit(1);
    } else {
      try {
        log.warn(`⚠️ [Loader: Models] ${C.yellow}DB_SYNC=true: 正在 sync 建表（仅限首次开发环境）。${C.reset}`);
        log.warn(
          `⚠️ [Loader: Models] ${C.yellow}后续表结构变更请创建迁移文件: npx umzug migration:create --name <描述>${C.reset}`
        );
        await sequelize.sync({ alter: true });
        log.always(`✅ [Loader: Models] ${C.green}表结构同步完成${C.reset}`);
      } catch (err) {
        log.error(`❌ [Loader: Models] ${C.red}表结构同步失败${C.reset}`, err);
      }
    }
  }

  log.always(`📦 [Loader: Models] ${C.cyan}所有模型加载完毕${C.reset}`);

  // 模型加载失败告警
  if (loadErrors.length > 0) {
    log.error(`⚠️ [Loader: Models] ${C.yellow}${loadErrors.length} 个模型加载失败，请检查:${C.reset}`);
    loadErrors.forEach(e => log.error(`  - ${e.file}: ${e.error}`));
  }
};

export default modelsLoader;
