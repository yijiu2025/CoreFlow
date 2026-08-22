/**
 * 验证码请求上下文工具
 *
 * 从 Fastify request 统一提取客户端上下文（IP + UA + device 指纹 + sessionId），
 * 供 emailDao.sendCode/verifyCode、captcha 校验等复用，避免各调用点重复构造。
 *
 * @author yijiu2025
 * @since 2026-08-22
 */

/**
 * 从 Fastify request 构造验证码校验上下文
 * @param {object} request - Fastify request
 * @param {object} [extra] - 额外字段（如 { sessionId: captchaKey }）
 * @returns {{ip:string, ua:string, deviceFp:string, sessionId?:string}}
 */
export function clientContext(request, extra = {}) {
  return {
    ip: request?.ip || '',
    ua: request?.headers?.['user-agent'] || '',
    deviceFp: request?.headers?.['x-device-fp'] || '',
    ...extra
  };
}

/**
 * 从 request.body 提取 captchaKey 作为 sessionId
 * @param {object} request - Fastify request
 * @returns {string} captchaKey（可能为 undefined）
 */
export function sessionIdFromRequest(request) {
  return request?.body?.captchaKey || request?.body?.sessionId || '';
}
