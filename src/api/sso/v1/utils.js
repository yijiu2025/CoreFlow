// src/api/sso/v1/utils.js
import Result from '../../../core/result.js';
import { generateCaptcha } from '../../../auth/utils/lib/captcha.js';

const sendEmailCodeSchema = {
  body: {
    type: 'object',
    required: ['email'],
    properties: {
      email: {
        type: 'string',
        format: 'email',
        description: '收件人邮箱'
      }
    }
  }
};

export default async function (fastify, opts) {
  /**
   * 获取图形验证码
   */
  fastify.get('/api/v1/sso/utils/captcha', async (request, reply) => {
    const { tag, image, text } = await generateCaptcha();
    const response = { sessionId: tag, image };

    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      response.text = text;
    }

    reply.json(Result.success(response, '获取成功'));
  });

  /**
   * 发送邮箱验证码
   * AJV 在这里自动校验 email 格式，无需手写 if (!email) 判断
   */
  fastify.post(
    '/api/v1/sso/utils/send-email-code',
    {
      schema: sendEmailCodeSchema
    },
    async (request, reply) => {
      const { email } = request.body;

      const code = Math.random().toString().slice(2, 8);
      const expireMinutes = 5;

      await request.server.db.user.EmailCode.create({
        email,
        code,
        expired_at: new Date(Date.now() + expireMinutes * 60000)
      });

      // TODO: 接入真正的邮件服务 (如 Nodemailer)
      request.log.info({ email }, '邮箱验证码已发送');

      reply.json(Result.success(null, '验证码已发送'));
    }
  );
}
