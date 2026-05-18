/**
 * OAuth 2.1 Utils 模块的验证架构
 */

/** 通用响应结构 */
const commonResponse = {
  type: 'object',
  properties: {
    code: { type: 'integer' },
    message: { type: 'string' },
    data: { type: 'object', nullable: true }
  }
};

/** 生成验证码 Schema */
export const generateCaptchaSchema = {
  summary: '生成图形验证码',
  description: '生成 Base64 格式的 PNG 验证码图片并返回标识符',
  querystring: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: '客户端生成的会话 ID' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        code: { type: 'integer' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            captchaKey: { type: 'string', description: '验证码唯一标识' },
            captchaImage: { type: 'string', description: 'PNG 图片的 Base64 字符串' }
          }
        }
      }
    }
  }
};

/** 验证验证码 Schema */
export const verifyCaptchaSchema = {
  summary: '预验证图形验证码',
  description: '校验用户输入的验证码是否正确，并在后端标记验证状态',
  body: {
    type: 'object',
    required: ['captchaKey', 'captchaValue'],
    properties: {
      captchaKey: {
        type: 'string',
        minLength: 1,
        description: '验证码唯一标识'
      },
      captchaValue: {
        type: 'string',
        minLength: 4,
        maxLength: 6,
        description: '用户输入的验证码文本'
      },
      email: { type: 'string', description: '需要发送验证码的邮箱（可选）' },
      type: { type: 'string', description: '业务类型：register/login/reset_password（可选）' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        code: { type: 'integer' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    },
    400: commonResponse
  }
};
