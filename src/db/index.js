import { Sequelize } from 'sequelize';

const { DB_TYPE, DB_USER, DB_PASS, DB_HOST, DB_PORT, DB_NAME } = process.env;
const dsn = `${DB_TYPE || 'mysql'}://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

const sequelize = new Sequelize(dsn, {
  logging: false,
  define: {
    timestamps: true,
    underscored: true
  },
  dialectOptions: {
    connectTimeout: 10000
  },
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 }
});

export { sequelize, Sequelize };
export default sequelize;
