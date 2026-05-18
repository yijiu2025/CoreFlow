import { sequelize } from '../../db/index.js';

export default async (app) => {
  const { DB_HOST, DB_PORT, DB_NAME } = process.env;
  console.log(`📡 [Loader: DB] 正在连接数据库: ${DB_HOST}:${DB_PORT}/${DB_NAME}...`);

  try {
    await sequelize.authenticate();
    console.log('✨ [Loader: DB] 数据库连接成功');

    // 通过 Fastify 装饰器注入，替代丑陋的 global 变量
    const dbObj = {
      sequelize,
      Sequelize: sequelize.constructor,
      transaction: (...args) => sequelize.transaction(...args)
    };
    app.decorate('db', dbObj);

    // 同步所有模型
    await sequelize.sync();
    console.log('✨ [Loader: DB] 数据库表已同步');
  } catch (err) {
    console.error('🚨 [Loader: DB] 数据库连接失败:', err.message);
  }
};
