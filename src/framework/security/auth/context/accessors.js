/**
 * ALS 请求上下文访问器
 *
 * 供业务层在请求生命周期的任意深度取 request / db / 插件实例，
 * 避免层层透传 request。ALS 实例本体在 ./request-context.js（零依赖）。
 *
 * @author yijiu
 * @since 2026-11-01 自 auth/index.js 拆出（index.js 收敛为纯门面）
 */
import { requestContext } from './request-context.js';

/**
 * 获取当前请求上下文
 * @returns {import('fastify').FastifyRequest}
 * @throws {Error} code=INTERNAL_CONTEXT_ERROR 当 ALS 无 store（非请求上下文内调用）
 */
function getCtx() {
  const req = requestContext.getStore();
  if (!req) {
    const err = new Error('认证上下文缺失：当前不在请求生命周期内（ALS 无 store）');
    err.code = 'INTERNAL_CONTEXT_ERROR';
    err.statusCode = 500;
    throw err;
  }
  return req;
}

/**
 * 获取数据库实例
 * @returns {object} Sequelize 实例
 */
function getDb() {
  const db = getCtx().server.db;
  if (!db) throw new Error('Database plugin not registered');
  return db;
}

/**
 * 通用服务器资源访问器
 * @param {string} name 插件名
 * @returns {*} 插件实例
 * @throws {Error} code=INVALID_PARAM 当 name 非字符串；未注册时抛普通 Error
 */
function getServerResource(name) {
  if (!name || typeof name !== 'string') {
    const err = new Error('name 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const resource = getCtx().server[name];
  if (resource === undefined) throw new Error(`Plugin "${name}" not registered`);
  return resource;
}

export { getCtx, getDb, getServerResource };
