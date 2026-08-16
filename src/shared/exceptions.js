/**
 * 统一 API 异常基类
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
class ApiException extends Error {
  /**
   * @param {string} message - 错误信息
   * @param {number} [statusCode=500] - HTTP 状态码
   * @param {number|string|null} [bizCode=null] - 业务错误码（如不提供则默认为 statusCode）
   * @param {any} [data=null] - 额外携带的数据
   */
  constructor(message, statusCode = 500, bizCode = null, data = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.bizCode = bizCode;
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 异常：请求参数错误
 */
class BadRequestException extends ApiException {
  constructor(message = '请求参数错误', bizCode = null, data = null) {
    super(message, 400, bizCode, data);
  }
}

/**
 * 401 异常：身份验证失败
 */
class UnauthorizedException extends ApiException {
  constructor(message = '身份验证失败', bizCode = null, data = null) {
    super(message, 401, bizCode, data);
  }
}

/**
 * 403 异常：权限不足
 */
class ForbiddenException extends ApiException {
  constructor(message = '权限不足', bizCode = null, data = null) {
    super(message, 403, bizCode, data);
  }
}

/**
 * 404 异常：资源未找到
 */
class NotFoundException extends ApiException {
  constructor(message = '资源不存在', bizCode = null, data = null) {
    super(message, 404, bizCode, data);
  }
}

/**
 * 409 异常：资源冲突
 */
class ConflictException extends ApiException {
  constructor(message = '资源冲突', bizCode = null, data = null) {
    super(message, 409, bizCode, data);
  }
}

/**
 * 429 异常：请求过于频繁
 */
class TooManyRequestsException extends ApiException {
  constructor(message = '请求过于频繁，请稍后再试', bizCode = null, data = null) {
    super(message, 429, bizCode, data);
  }
}

/**
 * 500 异常：服务器内部错误
 */
class InternalServerException extends ApiException {
  constructor(message = '服务器内部错误', bizCode = null, data = null) {
    super(message, 500, bizCode, data);
  }
}

export {
  ApiException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  TooManyRequestsException,
  InternalServerException
};
