import { DataTypes } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '../../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async (app) => {
  // 1. 获取 Fastify 实例上的 db 对象
  const db = app.db;

  // 2. 扫描 src/models 文件夹加载模型
  const modelsPath = path.resolve(__dirname, '../../models');

  async function scanModels(dir, namespace = '') {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        const ns = namespace ? `${namespace}.${file.name}` : file.name;
        if (!db[ns]) db[ns] = {};
        await scanModels(fullPath, ns);
      } else if (file.name.endsWith('.js')) {
        try {
          const { default: modelDefine } = await import(`file://${fullPath}`);
          const result = modelDefine(sequelize, DataTypes);

          // 支持单个模型或模型对象/数组
          const models = result.name || typeof result !== 'object' ? [result] : Object.values(result);

          for (const model of models) {
            if (!model || !model.name) continue;
            // 挂载逻辑
            if (namespace) {
              db[namespace][model.name] = model;
            } else {
              db[model.name] = model;
            }
          }
        } catch (error) {
          console.error(`❌ [Loader: Models] 模型 [${file.name}] 加载失败:`, error.message);
        }
      }
    }
  }

  await scanModels(modelsPath);

  // 3. 执行模型关联 (associate)
  const flattenModels = (obj) => {
    let models = [];
    for (const key in obj) {
      // 检查是否为 Sequelize 模型或具有 associate 方法
      if (obj[key]?.associate || (obj[key]?.prototype && obj[key].prototype.constructor.name === 'Model')) {
        models.push(obj[key]);
      } else if (typeof obj[key] === 'object' && key !== 'sequelize' && key !== 'Sequelize') {
        models = models.concat(flattenModels(obj[key]));
      }
    }
    return models;
  };

  const allModels = flattenModels(db);
  allModels.forEach((model) => {
    if (model.associate) {
      model.associate(sequelize.models);
    }
  });

  // 4. 自动同步表结构（仅限首次开发环境建表，后续变更请使用迁移）
  if (process.env.DB_SYNC === 'true') {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '❌ [Loader: Models] 拒绝在生产环境执行 DB_SYNC！请使用 `npm run migrate` 管理表结构变更。'
      );
      process.exit(1);
    } else {
      try {
        console.warn('⚠️ [Loader: Models] DB_SYNC=true: 正在 sync 建表（仅限首次开发环境）。');
        console.warn('⚠️ [Loader: Models] 后续表结构变更请创建迁移文件: npx umzug migration:create --name <描述>');
        await sequelize.sync({ alter: true });
        console.log('🔄 [Loader: Models] 表结构同步完成');
      } catch (err) {
        console.error('🚨 [Loader: Models] 表结构同步失败:', err.message);
      }
    }
  }

  console.log('📦 [Loader: Models] 所有模型加载完毕');
};
