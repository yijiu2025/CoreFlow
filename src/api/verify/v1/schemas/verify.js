/**
 * 验证模块 Schema 定义
 * 用于 Fastify 路由的请求/响应校验
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
  description: '生成 Base64 格式的验证码图片并返回标识符',
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
            captchaImage: { type: 'string', description: '图片 Base64 字符串' }
          }
        }
      }
    }
  }
};

/** 验证验证码 Schema */
export const verifyCaptchaSchema = {
  summary: '校验图形验证码',
  description: '校验用户输入的验证码是否正确，并可选发送邮箱验证码',
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
        minLength: 3,
        maxLength: 6,
        description: '用户输入的验证码文本'
      },
      email: { type: 'string', description: '需要发送验证码的邮箱（可选）' }
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
            emailSent: { type: 'boolean' }
          }
        }
      }
    },
    400: commonResponse
  }
};
