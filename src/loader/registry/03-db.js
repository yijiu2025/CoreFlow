/**
 * 数据库连接加载器
 * 初始化 Sequelize 连接，注入 app.db 装饰器
 * 连接失败时不阻塞启动，降级为 null
 *
 * @author yijiu2025
 * @since 2026-07-24
 */

/* eslint-disable no-console */

import { sequelize } from '../../db/index.js';
import { C } from '../../utils/colors.js';

/** 数据库连接超时（毫秒） */
const DB_CONNECT_TIMEOUT = 30_000;

export default async app => {
  const { DB_HOST, DB_PORT, DB_NAME } = process.env;
  console.log(`📦 [Loader: DB] ${C.cyan}正在连接数据库: ${DB_HOST}:${DB_PORT}/${DB_NAME}...${C.reset}`);

  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('数据库连接超时')), DB_CONNECT_TIMEOUT))
    ]);
    console.log(`✅ [Loader: DB] ${C.green}数据库连接成功${C.reset}`);

    // 通过 Fastify 装饰器注入
    const dbObj = {
      sequelize,
      Sequelize: sequelize.constructor,
      transaction: (...args) => sequelize.transaction(...args),
      models: sequelize.models
    };
    app.decorate('db', dbObj);

    // 优雅退出：关闭数据库连接
    app.addHook('onClose', async () => {
      await sequelize.close();
      console.log(`📦 [Loader: DB] ${C.cyan}数据库连接已关闭${C.reset}`);
    });
  } catch (err) {
    console.error(`❌ [Loader: DB] ${C.red}数据库连接失败: ${err.message}${C.reset}`);
    // 连接失败不阻塞启动，降级为 null
    app.decorate('db', null);
  }
};
