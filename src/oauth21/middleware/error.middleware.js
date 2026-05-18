// src/middleware/error.middleware.js

/**
 * 统一 OAuth 错误处理
 */
export function oauthErrorHandler(err, req, res, _next) {
  console.error(`[Error] ${err.error ?? 'server_error'}: ${err.message}`);

  const statusCode = err.statusCode ?? 500;
  res.status(statusCode).json({
    error: err.error ?? 'server_error',
    error_description: err.description ?? err.message ?? 'Internal server error'
  });
}
