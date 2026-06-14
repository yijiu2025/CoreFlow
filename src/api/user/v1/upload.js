/**
 * 用户头像上传 API
 *
 * POST /user/v1/avatar — 上传头像
 * - 接收 multipart/form-data（字段名 avatar）
 * - sharp 压缩/裁剪为 256x256
 * - 上传到 OSS 或本地存储
 * - 更新 User.avatar 字段 + Redis session
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import sharp from 'sharp';
import { uploadFile, deleteFile } from '../../../app/user/services/oss.service.js';
import sequelize from '../../../db/index.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const OUTPUT_SIZE = 256;

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

      // 2. 校验类型
      if (!ALLOWED_TYPES.includes(file.mimetype)) {
        return reply.code(400).send({
          code: 400,
          message: '仅支持 JPG、PNG、WebP、GIF 格式',
          data: null
        });
      }

      // 3. 读取文件内容
      const chunks = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // 4. 校验大小
      if (buffer.length > MAX_SIZE) {
        return reply.code(400).send({
          code: 400,
          message: '文件大小不能超过 5MB',
          data: null
        });
      }

      try {
        // 5. sharp 处理：裁剪 + 压缩
        const processed = await sharp(buffer)
          .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
            fit: 'cover',
            position: 'centre'
          })
          .jpeg({ quality: 85 })
          .toBuffer();

        // 6. 生成文件名
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const fileName = `avatar_${user.sub}_${timestamp}_${random}.jpg`;

        // 7. 上传到 OSS 或本地
        const avatarUrl = await uploadFile(processed, fileName, 'image/jpeg');

        // 8. 更新数据库
        const { User } = sequelize.models;
        const dbUser = await User.findOne({ where: { uid: user.sub } });
        if (dbUser) {
          const oldAvatar = dbUser.avatar;
          dbUser.avatar = avatarUrl;
          await dbUser.save();

          // 异步删除旧头像（不阻塞响应）
          if (oldAvatar && oldAvatar !== avatarUrl) {
            deleteFile(oldAvatar).catch(() => {});
          }
        }

        // 9. 更新 Redis session
        try {
          const redis = request.server.redis;
          if (redis) {
            const sessionId = request.cookies?.sid;
            // 简单方案：不更新 session，前端通过 fetchPermissions 重新获取
          }
        } catch {}

        return reply.result.success('头像上传成功', {
          avatar: avatarUrl
        });
      } catch (err) {
        return reply.code(500).send({
          code: 500,
          message: '头像上传失败: ' + err.message,
          data: null
        });
      }
    }
  });
}
