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
import { saveUploadFile, saveBase64Image, UploadError } from '../../../app/posecraft/services/upload.service.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('api.posecraft.upload');

async function registerUploadRoutes(fastify) {
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
        if (err instanceof UploadError) {
          return reply.result.fail(err.message);
        }
        // 内部错误不向客户端回显原始错误（避免泄露内部路径/堆栈），只记录日志
        log.error('上传文件失败', err);
        return reply.result.fail('上传失败，请稍后重试');
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
        if (err instanceof UploadError) {
          return reply.result.fail(err.message);
        }
        // 内部错误不向客户端回显原始错误（避免泄露内部路径/堆栈），只记录日志
        log.error('上传 Base64 图片失败', err);
        return reply.result.fail('上传失败，请稍后重试');
      }
    }
  });
}

export default registerUploadRoutes;
