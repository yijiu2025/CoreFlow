/**
 * 用户头像上传路由
 *
 * POST /user/v1/avatar — 上传头像
 *
 * 业务逻辑见 app/user/services/avatar.service.js（processAndUploadAvatar）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { processAndUploadAvatar, AvatarError } from '../../../app/user/services/avatar.service.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('api.user.upload');

async function registerUploadRoutes(fastify) {
  registerGroupMetadata({
    name: 'upload',
    alias: '文件上传',
    description: '头像上传',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * POST /user/v1/avatar
   */
  registerSecureRoute(fastify, {
    name: 'uploadAvatar',
    alias: '上传头像',
    method: 'POST',
    url: '/avatar',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      // 1. 接收文件
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ code: 400, message: '请选择图片文件', data: null });
      }

      // 2. 读取文件内容为 Buffer
      const chunks = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // 3. 委托 service 处理（校验+sharp+上传+DB+删旧）
      try {
        const result = await processAndUploadAvatar(file.mimetype, buffer, user.sub, user.userId);
        return reply.result.success('头像上传成功', result);
      } catch (err) {
        if (err instanceof AvatarError) {
          return reply.code(err.statusCode).send({
            code: err.statusCode,
            message: err.message,
            data: null
          });
        }
        // 内部错误不向客户端回显原始错误（避免泄露内部路径/堆栈），只记录日志
        log.error('头像上传失败', err);
        return reply.code(500).send({
          code: 500,
          message: '头像上传失败，请稍后重试',
          data: null
        });
      }
    }
  });
}

export default registerUploadRoutes;
