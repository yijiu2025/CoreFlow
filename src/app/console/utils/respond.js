/**
 * Console 路由错误响应工具
 *
 * 领域错误以 `CODE:中文说明` 形式抛出（与既有 `REGISTER_FAILED:` 约定一致），
 * 本工具把它翻译成稳定的 HTTP 状态与响应体，避免每个路由各写一套 if/else。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

/** 错误码 → HTTP 状态 */
const STATUS_MAP = {
  INVALID_PARAM: 400,
  DUPLICATE: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  PARENT_NOT_FOUND: 400,
  INVALID_PARENT: 400,
  BUILTIN_PROTECTED: 403,
  HAS_CHILDREN: 409,
  HAS_MEMBERS: 409,
  ROLE_REFERENCED: 409,
  // 注销流程的业务拒绝（重复申请 / 未到期 / 已处理）
  DEACTIVATION_FAILED: 409,
  /*
   * 二次验证（高危操作）。
   *
   * REQUIRED 用 428：前端据此知道"该先发验证码"，而不是把它当成普通的参数错误
   * —— 428 Precondition Required 正是"请求缺少必要前置条件"的标准语义，
   * 与防火墙挑战（也是 428）不会混：那条走 X-Firewall-Challenge 头与整页跳转。
   */
  STEPUP_REQUIRED: 428,
  STEPUP_FAILED: 400,
  STEPUP_RATE_LIMITED: 429,
  STEPUP_UNAVAILABLE: 503
};

/**
 * 把异常写成统一错误响应
 *
 * @param {import('fastify').FastifyReply} reply Fastify 响应对象
 * @param {Error & {code?: string}} err 异常
 * @param {string} [fallback='操作失败'] 兜底提示
 * @returns {import('fastify').FastifyReply} 响应对象
 */
function fail(reply, err, fallback = '操作失败') {
  const raw = String(err?.message || '');
  const [maybeCode, ...rest] = raw.split(':');
  const message = STATUS_MAP[maybeCode] ? rest.join(':') || fallback : raw || fallback;
  const status = STATUS_MAP[maybeCode] || 500;
  return reply.code(status).send({ code: status, message, data: null });
}

/**
 * 包装路由处理器：统一捕获领域错误
 *
 * @param {Function} handler 业务处理器
 * @returns {Function} Fastify 处理器
 */
function withFail(handler) {
  return async (request, reply) => {
    try {
      return await handler(request, reply);
    } catch (err) {
      return fail(reply, err);
    }
  };
}

export { fail, withFail };
