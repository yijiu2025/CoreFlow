import fp from 'fastify-plugin';
import { AsyncLocalStorage } from 'async_hooks';

// 全局上下文存储 (实现类似 Java ThreadLocal 的效果)
export const requestContext = new AsyncLocalStorage();

export default fp(async (app) => {
  // 在每个请求到达时，将 request 对象放入 AsyncLocalStorage
  app.addHook('onRequest', (request, reply, done) => {
    requestContext.run(request, () => {
      done();
    });
  });

  console.log('✅ 全局 AsyncLocalStorage 上下文已注册 (为 StpUtil 提供静态调用能力)');
});
