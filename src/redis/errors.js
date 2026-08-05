/**
 * Redis 模块自定义错误类
 * 用于区分降级场景和强制失败场景
 *
 * @author yijiu2025
 * @since 2026-07-25
 */

/**
 * Redis 不可用且不允许降级时抛出的错误
 * 调用方应捕获此错误并返回 503 Service Unavailable
 */
class RedisRequiredError extends Error {
  /**
   * @param {string} message - 错误描述
   * @param {object} [options]
   * @param {string} [options.operation] - 失败的 Redis 操作名
   * @param {string} [options.store] - 存储名称
   */
  constructor(message, { operation, store } = {}) {
    super(message);
    this.name = 'RedisRequiredError';
    this.code = 'REDIS_REQUIRED';
    this.operation = operation || 'unknown';
    this.store = store || 'unknown';
    this.statusCode = 503; // Service Unavailable
  }
}

export { RedisRequiredError };
