/**
 * 授权码流程 Schema（/authorize 子流程）
 */

/** POST /authorize/login — 授权页登录 */
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
};

/** POST /authorize/consent — 用户授权确认 */
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
};
