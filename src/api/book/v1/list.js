// src/api/book/v1/list.js
export default async function (fastify, opts) {
  fastify.get('/api/v1/books/', async (request, reply) => {
    // 这里可以直接使用 request.server.db
    return Result.success('获取书籍列表');
  });
}
