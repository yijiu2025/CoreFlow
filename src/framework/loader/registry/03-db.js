/**
 * 数据库连接加载器
 * 初始化 Sequelize 连接，注入 app.db 装饰器
 * 连接失败时不阻塞启动，降级为 null
 *
 * @author yijiu2025
 * @since 2026-07-24
 */

import { sequelize } from '../../../framework/db/index.js';
import { C } from '../../../utils/colors.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.loader.registry.03-db');

/** 数据库连接超时（毫秒） */
const DB_CONNECT_TIMEOUT = 30_000;

const dbLoader = async app => {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER } = process.env;
  const dbConfigured = Boolean(DB_HOST && DB_NAME && DB_USER);

  if (!dbConfigured) {
    // 本地/测试环境未配置 DB：保持原降级语义（app.db=null），允许无库启动
    log.warn(
      `📦 [Loader: DB] ${C.yellow}未配置数据库（DB_HOST/DB_NAME/DB_USER），降级为 null（仅本地/测试）${C.reset}`
    );
    app.decorate('db', null);
    return;
  }

  log.always(`📦 [Loader: DB] ${C.cyan}正在连接数据库: ${DB_HOST}:${DB_PORT}/${DB_NAME}...${C.reset}`);

  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('数据库连接超时')), DB_CONNECT_TIMEOUT))
    ]);
    log.always(`✅ [Loader: DB] ${C.green}数据库连接成功${C.reset}`);

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
      log.always(`📦 [Loader: DB] ${C.cyan}数据库连接已关闭${C.reset}`);
    });
  } catch (err) {
    // 已配置但连不上 → 致命错误，向上抛出让 engine fail-fast，
    // 而不是带着 null DB 继续启动（后续模型/密钥/路由全会在 null 上崩成 500）
    err.message = `数据库连接失败（${DB_HOST}:${DB_PORT}/${DB_NAME}）: ${err.message}`;
    throw err;
  }
};

export default dbLoader;
