/**
 * Token 端点 Schema（RFC 6749）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

/** POST /token — 授权码/客户端凭证/刷新令牌 */
export const tokenSchema = {
  body: {
    type: 'object',
    required: ['grant_type'],
    properties: {
      grant_type: {
        type: 'string',
        enum: ['authorization_code', 'client_credentials', 'refresh_token']
      },
      code: { type: 'string', description: '授权码（authorization_code）' },
      redirect_uri: { type: 'string', format: 'uri' },
      code_verifier: { type: 'string', minLength: 43, maxLength: 128, description: 'PKCE' },
      client_id: { type: 'string' },
      client_secret: { type: 'string' },
      scope: { type: 'string' },
      refresh_token: { type: 'string' }
    },
    additionalProperties: false,
    // authorization_code 时必填 code + redirect_uri
    if: { properties: { grant_type: { const: 'authorization_code' } } },
    then: { required: ['code', 'redirect_uri'] }
  }
};

/** POST /revoke — 令牌撤销（RFC 7009） */
export const revokeSchema = {
  body: {
    type: 'object',
    required: ['token'],
    properties: {
      token: { type: 'string', minLength: 1 },
      token_type_hint: { type: 'string', enum: ['access_token', 'refresh_token'] }
    },
    additionalProperties: false
  }
};
