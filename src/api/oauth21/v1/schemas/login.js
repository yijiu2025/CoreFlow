/**
 * 登录路由 Schema（/login、/mini-login）
 *
 * 两种登录路径：
 * - 密码登录：encrypted(RSA 密文) + timestamp + nonce + kid + keepLogin
 * - 邮箱验证码登录：type=email + email + code
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

/** POST /login、/mini-login */
export const loginSchema = {
  body: {
    type: 'object',
    properties: {
      encrypted: { type: 'string', description: 'RSA-OAEP 加密后的登录信息（密码登录）' },
      timestamp: { type: 'number', description: '请求时间戳（毫秒，防重放）' },
      nonce: { type: 'string', description: '防重放随机数' },
      kid: { type: 'string', description: 'RSA 公钥 kid（解密用）' },
      keepLogin: { type: 'boolean', description: '记住我（长期登录）' },
      client_id: { type: 'string', description: '客户端 ID' },
      scope: { type: 'string', description: '请求的权限范围' },
      oidcNonce: { type: 'string', description: 'OIDC nonce' },
      captchaKey: { type: 'string', description: '验证码 key' },
      // 邮箱验证码登录
      type: { type: 'string', enum: ['email', 'pwd'], description: '登录类型' },
      email: { type: 'string', format: 'email', description: '邮箱' },
      code: { type: 'string', description: '验证码' },
      username: { type: 'string', description: '用户名（明文，仅邮箱登录回填）' },
      password: { type: 'string', description: '密码（明文，仅邮箱登录回填）' }
    },
    additionalProperties: true
  }
};

/** POST /login/consent/confirm — 快捷登录确认授权 */
export const consentConfirmSchema = {
  body: {
    type: 'object',
    required: ['consentKey'],
    properties: {
      consentKey: { type: 'string', minLength: 1 }
    },
    additionalProperties: false
  }
};

/** 邮箱二次验证登录（环境异常后二次确认） */
export const verifyEmailLoginSchema = {
  body: {
    type: 'object',
    required: ['verifyToken', 'code'],
    properties: {
      verifyToken: { type: 'string', minLength: 1 },
      code: { type: 'string', minLength: 4 }
    },
    additionalProperties: false
  }
};
