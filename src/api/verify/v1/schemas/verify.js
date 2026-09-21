/**
 * 验证模块 Schema 定义
 * 用于 Fastify 路由的请求/响应校验
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

// 统一响应信封（与 globals 里 reply.result 的 build() 一一对应）
//
// ⚠️ 这里的字段必须**覆盖信封的全部字段**。Fastify 用 response schema 做序列化裁剪：
//    schema 里没声明的字段不会报错，会被**静默丢掉**。此前本文件只声明了
//    code/message/data，于是 timestamp 与 requestId 在 HTTP 响应里凭空消失 ——
//    同一个信封，无 Redis 部署（走 MapStore 的 200 路径）下客户端拿不到时间戳，
//    而有 Redis 时走的是 503 降级路径、根本没有响应体，所以长期没人发现。
//    同源的正确写法见 `src/api/firewall/v1/schemas/monitor.js` 的 baseResponse。
//    实测 2026-09-21（CI 无 .env → 无 Redis → 走 200 路径，api-routes 用例才把它暴露出来）。
const envelope = dataSchema => ({
  type: 'object',
  properties: {
    code: { type: 'integer' },
    message: { type: 'string' },
    data: dataSchema,
    timestamp: { type: 'integer', description: '服务端毫秒时间戳' },
    requestId: { type: 'string', description: '请求 ID' }
  }
});

/** 通用响应结构（data 形状不固定） */
const commonResponse = envelope({ type: 'object', nullable: true });

/** 生成验证码 Schema */
const generateCaptchaSchema = {
  summary: '生成图形验证码',
  description: '生成 Base64 格式的验证码图片并返回标识符',
  querystring: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: '客户端生成的会话 ID' }
    }
  },
  response: {
    200: envelope({
      type: 'object',
      properties: {
        captchaKey: { type: 'string', description: '验证码唯一标识' },
        captchaImage: { type: 'string', description: '图片 Base64 字符串' }
      }
    })
  }
};

/** 验证验证码 Schema */
const verifyCaptchaSchema = {
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
    200: envelope({
      type: 'object',
      properties: {
        emailSent: { type: 'boolean' }
      }
    }),
    400: commonResponse
  }
};

export { generateCaptchaSchema, verifyCaptchaSchema };
