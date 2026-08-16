/**
 * 用户头像上传路由
 *
 * POST /user/v1/avatar — 上传头像
 *
 * 业务逻辑见 app/user/services/avatar.service.js（processAndUploadAvatar）。
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { processAndUploadAvatar, AvatarError } from '../../../app/user/services/avatar.service.js';

export default async function (fastify) {
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
        return reply.code(500).send({
          code: 500,
          message: '头像上传失败: ' + err.message,
          data: null
        });
      }
    }
  });
}
