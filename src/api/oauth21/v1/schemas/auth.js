/**
 * 认证相关请求 Schema
 */

/** POST /login 和 POST /mini-login */
export const loginSchema = {
  body: {
    type: 'object',
    properties: {
      encrypted: { type: 'string', description: 'RSA 加密后的登录信息' },
      timestamp: { type: 'number', description: '请求时间戳' },
      nonce: { type: 'string', description: '防重放随机数' },
      client_id: { type: 'string', description: '客户端 ID' },
      scope: { type: 'string', description: '请求的权限范围' },
      oidcNonce: { type: 'string', description: 'OIDC nonce' },
      captchaKey: { type: 'string', description: '验证码 key' },
      // 邮箱验证码登录
      type: { type: 'string', enum: ['email', 'pwd'], description: '登录类型' },
      email: { type: 'string', format: 'email', description: '邮箱' },
      code: { type: 'string', description: '验证码' },
      username: { type: 'string', description: '用户名（明文，仅邮箱登录）' },
      password: { type: 'string', description: '密码（明文，仅邮箱登录）' }
    },
    additionalProperties: false
  }
}

/** POST /login/consent/confirm */
export const consentConfirmSchema = {
  body: {
    type: 'object',
    required: ['consentKey'],
    properties: {
      consentKey: { type: 'string', minLength: 1 }
    },
    additionalProperties: false
  }
}

/** POST /authorize/login */
export const authorizeLoginSchema = {
  body: {
    type: 'object',
    required: ['sessionId', 'username', 'password'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      username: { type: 'string', minLength: 1 },
      password: { type: 'string', minLength: 1 }
    },
    additionalProperties: false
  }
}

/** POST /authorize/consent */
export const authorizeConsentSchema = {
  body: {
    type: 'object',
    required: ['sessionId', 'action'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      user_id: { type: 'string' },
      action: { type: 'string', enum: ['approve', 'deny'] }
    },
    additionalProperties: false
  }
}
