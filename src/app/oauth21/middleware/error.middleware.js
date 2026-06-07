/**
 * 统一 OAuth 错误处理中间件
 *
 * 同时支持 Fastify 和 Express。
 * 错误响应格式统一为 { code, message, data }
 */

/**
 * Fastify 错误处理插件
 * @param {object} fastify - Fastify 实例
 */
export function registerOAuthErrorHandler(fastify) {
  fastify.setErrorHandler((err, request, reply) => {
    const statusCode = err.statusCode || 500;
    const isOAuthError = err.error && err.error_description;

    // OAuth 标准错误格式
    if (isOAuthError) {
      request.log.error({ err }, `[OAuth] ${err.error}: ${err.error_description}`);
      return reply.code(statusCode).send({
        code: statusCode,
        message: err.error_description,
        data: { error: err.error }
      });
    }

    // 通用错误格式
    request.log.error({ err }, `[Auth] ${err.message}`);
    return reply.code(statusCode).send({
      code: statusCode,
      message: err.message || 'Internal server error',
      data: null
    });
  });
}

/**
 * Express 错误处理中间件（向后兼容遗留代码）
 */
export function oauthErrorHandler(err, req, res, _next) {
  console.error(`[Auth] ${err.error ?? 'server_error'}: ${err.message}`);

  const statusCode = err.statusCode ?? 500;
  res.status(statusCode).json({
    code: statusCode,
    message: err.description ?? err.message ?? 'Internal server error',
    data: err.error ? { error: err.error } : null
  });
}
