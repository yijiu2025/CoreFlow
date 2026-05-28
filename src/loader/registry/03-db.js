import { sequelize } from '../../db/index.js';

export default async (app) => {
  const { DB_HOST, DB_PORT, DB_NAME } = process.env;
  console.log(`[Loader: DB] 正在连接数据库: ${DB_HOST}:${DB_PORT}/${DB_NAME}...`);

  try {
    await sequelize.authenticate();
    console.log('[Loader: DB] 数据库连接成功');

    // 通过 Fastify 装饰器注入
    const dbObj = {
      sequelize,
      Sequelize: sequelize.constructor,
      transaction: (...args) => sequelize.transaction(...args)
    };
    app.decorate('db', dbObj);

    // 优雅退出：关闭数据库连接
    app.addHook('onClose', async () => {
      await sequelize.close();
      console.log('[Loader: DB] 数据库连接已关闭');
    });
  } catch (err) {
    console.error('[Loader: DB] 数据库连接失败:', err.message);
    // 连接失败不阻塞启动，降级为 null
    app.decorate('db', null);
  }
};
