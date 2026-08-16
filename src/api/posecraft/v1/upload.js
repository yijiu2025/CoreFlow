/**
 * PoseCraft 文件上传路由
 *
 * POST /posecraft/v1/upload        — multipart 文件上传
 * POST /posecraft/v1/upload/base64 — Base64 图片上传
 *
 * 业务逻辑见 app/posecraft/services/upload.service.js（saveUploadFile / saveBase64Image）。
 *
 * @author Claude
 * @since 2026-07-13
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { saveUploadFile, saveBase64Image } from '../../../app/posecraft/services/upload.service.js';

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
      const file = await request.file();
      if (!file) {
        return reply.result.fail('请选择文件');
      }
      try {
        const result = await saveUploadFile(file);
        return reply.result.success('上传成功', result);
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
      const { data, filename } = request.body;
      if (!data) {
        return reply.result.fail('缺少图片数据');
      }
      try {
        const result = await saveBase64Image(data, filename);
        return reply.result.success('上传成功', result);
      } catch (err) {
        return reply.result.fail(`上传失败: ${err.message}`);
      }
    }
  });
}
