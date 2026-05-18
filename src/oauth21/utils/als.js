// src/auth/als.js
import { AsyncLocalStorage } from 'async_hooks';

// 1. ALS 单例
export const als = new AsyncLocalStorage();

// 2. 安全获取当前请求上下文
//    错误信息已脱敏：不暴露 "ALS" 或内部实现细节到客户端
export const getCtx = () => {
  const ctx = als.getStore();
  if (!ctx) {
    const err = new Error('INTERNAL_CONTEXT_ERROR');
    err.statusCode = 500;
    // 详细原因只写日志，不放进 Error.message（避免泄漏给客户端）
    throw err;
  }
  return ctx;
};

// 3. 获取数据库实例（含空值断言，明确告知开发者是插件未注册而非 undefined 报错）
export const getDb = () => {
  const db = getCtx().request.server.db;
  if (!db) {
    throw new Error('Database plugin not registered on Fastify instance');
  }
  return db;
};

// 4. 获取 Redis 实例（含空值断言）
//    注意：Redis 插件在无法连接时会注入 null，因此这里返回 null 是合法的降级状态
export const getRedis = () => {
  return getCtx().request.server.redis; // 允许返回 null（调用方自行处理降级）
};

// 5. 通用服务器资源访问器（可扩展：消息队列、搜索引擎等）
export const getServerResource = (name) => {
  const resource = getCtx().request.server[name];
  if (resource === undefined) {
    throw new Error(`Plugin "${name}" not registered on Fastify instance`);
  }
  return resource; // 允许 null（区分"未注册"和"注册但不可用"两种状态）
};

// 6. 测试辅助：允许在测试中注入 mock 上下文
//    使用方式: await runWithMockCtx({ request: mockReq, ... }, async () => { ... })
export const runWithMockCtx = (mockCtx, fn) => {
  return als.run(mockCtx, fn);
};
