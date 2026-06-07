/**
 * Token 相关请求 Schema
 */

/** POST /token */
export const tokenSchema = {
  body: {
    type: 'object',
    required: ['grant_type'],
    properties: {
      grant_type: {
        type: 'string',
        enum: ['authorization_code', 'client_credentials', 'refresh_token']
      },
      code: { type: 'string' },
      redirect_uri: { type: 'string', format: 'uri' },
      code_verifier: { type: 'string', minLength: 43, maxLength: 128 },
      client_id: { type: 'string' },
      client_secret: { type: 'string' },
      scope: { type: 'string' },
      refresh_token: { type: 'string' }
    },
    additionalProperties: false,
    if: { properties: { grant_type: { const: 'authorization_code' } } },
    then: { required: ['code', 'redirect_uri'] }
  }
}

/** POST /revoke */
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
}
