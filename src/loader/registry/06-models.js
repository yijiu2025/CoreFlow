import { DataTypes } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { sequelize } from '../../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async (app) => {
  const db = app.db;
  const modelsPath = path.resolve(__dirname, '../../models');
  const loadedModels = []; // 收集所有加载的模型，避免二次遍历

  /**
   * 递归扫描模型目录，按子目录自动创建命名空间
   * 每个 .js 文件导出工厂函数 (sequelize, DataTypes) => Model
   */
  async function scanModels(dir, namespace = '') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const ns = namespace ? `${namespace}.${entry.name}` : entry.name;
        if (!db[ns]) db[ns] = {};
        await scanModels(fullPath, ns);
      } else if (entry.name.endsWith('.js')) {
        try {
          const fileUrl = pathToFileURL(fullPath).href;
          const { default: modelDefine } = await import(fileUrl);
          const result = modelDefine(sequelize, DataTypes);

          const models = result.name || typeof result !== 'object' ? [result] : Object.values(result);

          for (const model of models) {
            if (!model || !model.name) continue;
            if (namespace) {
              db[namespace][model.name] = model;
            } else {
              db[model.name] = model;
            }
            loadedModels.push(model);
          }
        } catch (error) {
          console.error(`[Loader: Models] 模型 [${entry.name}] 加载失败:`, error.message);
        }
      }
    }
  }

  await scanModels(modelsPath);

  // 执行模型关联 (associate)
  loadedModels.forEach((model) => {
    if (model.associate) {
      model.associate(sequelize.models);
    }
  });

  // 自动同步表结构（仅限首次开发环境建表，后续变更请使用迁移）
  if (process.env.DB_SYNC === 'true') {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Loader: Models] 拒绝在生产环境执行 DB_SYNC！请使用 npm run migrate 管理表结构变更。');
      process.exit(1);
    } else {
      try {
        console.warn('[Loader: Models] DB_SYNC=true: 正在 sync 建表（仅限首次开发环境）。');
        console.warn('[Loader: Models] 后续表结构变更请创建迁移文件: npx umzug migration:create --name <描述>');
        await sequelize.sync({ alter: true });
        console.log('[Loader: Models] 表结构同步完成');
      } catch (err) {
        console.error('[Loader: Models] 表结构同步失败:', err.message);
      }
    }
  }

  console.log('[Loader: Models] 所有模型加载完毕');
};
