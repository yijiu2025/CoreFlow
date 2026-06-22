/**
 * PoseCraft 文件上传 API
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../../../public/uploads/posecraft');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export default async function (fastify) {
  registerGroupMetadata({
    name: 'upload',
    description: '文件上传',
    prefix: '/v1'
  });

  // 上传文件
  registerSecureRoute(fastify, {
    name: 'uploadFile',
    alias: '上传文件',
    method: 'POST',
    url: '/upload',
    requireLogin: true,
    handler: async (request, reply) => {
      try {
        const data = await request.file();

        if (!data) {
          return reply.result.fail('请选择文件');
        }

        // 验证文件类型
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(data.mimetype)) {
          return reply.result.fail('不支持的文件类型');
        }

        // 生成唯一文件名
        const ext = path.extname(data.filename) || '.png';
        const filename = `${crypto.randomUUID()}${ext}`;
        const filepath = path.join(UPLOAD_DIR, filename);

        // 保存文件
        const buffer = await data.toBuffer();
        fs.writeFileSync(filepath, buffer);

        // 返回访问 URL
        const url = `/uploads/posecraft/${filename}`;

        return reply.result.success('上传成功', {
          url,
          filename,
          size: buffer.length
        });
      } catch (err) {
        return reply.result.fail(`上传失败: ${err.message}`);
      }
    }
  });

  // 上传 Base64 图片
  registerSecureRoute(fastify, {
    name: 'uploadBase64',
    alias: '上传 Base64 图片',
    method: 'POST',
    url: '/upload/base64',
    requireLogin: true,
    handler: async (request, reply) => {
      try {
        const { data, filename: reqFilename } = request.body;

        if (!data) {
          return reply.result.fail('缺少图片数据');
        }

        // 解析 Base64
        const matches = data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
          return reply.result.fail('无效的 Base64 格式');
        }

        const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
        const buffer = Buffer.from(matches[2], 'base64');

        // 验证大小 (10MB)
        if (buffer.length > 10 * 1024 * 1024) {
          return reply.result.fail('文件大小超过限制 (10MB)');
        }

        // 生成文件名
        const filename = reqFilename || `${crypto.randomUUID()}${ext}`;
        const filepath = path.join(UPLOAD_DIR, filename);

        // 保存文件
        fs.writeFileSync(filepath, buffer);

        const url = `/uploads/posecraft/${filename}`;

        return reply.result.success('上传成功', {
          url,
          filename,
          size: buffer.length
        });
      } catch (err) {
        return reply.result.fail(`上传失败: ${err.message}`);
      }
    }
  });
}
