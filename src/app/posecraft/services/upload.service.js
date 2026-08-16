/**
 * PoseCraft 文件上传业务服务
 *
 * 从 api/posecraft/v1/upload.js 下沉：文件校验 + 唯一文件名 + 写磁盘 + base64 解析。
 * 路由层只接收 multipart / JSON，转 Buffer 后调本服务。
 *
 * @author yijiu
 * @since 2026-08-16
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 上传目录（public/uploads/posecraft，由静态资源服务暴露） */
const UPLOAD_DIR = path.resolve(__dirname, '../../../../public/uploads/posecraft');
/** 允许的图片 MIME 类型 */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Base64 上传最大 10MB */
const MAX_BASE64_SIZE = 10 * 1024 * 1024;

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * 保存 multipart 上传的文件到磁盘
 * @param {object} file - fastify multipart file 对象（含 mimetype/filename/toBuffer）
 * @returns {Promise<{url: string, filename: string, size: number}>}
 * @throws {Error} 类型不支持
 */
export async function saveUploadFile(file) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    throw new Error('不支持的文件类型');
  }

  const ext = path.extname(file.filename) || '.png';
  const filename = `${crypto.randomUUID()}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  const buffer = await file.toBuffer();
  fs.writeFileSync(filepath, buffer);

  return {
    url: `/uploads/posecraft/${filename}`,
    filename,
    size: buffer.length
  };
}

/**
 * 保存 Base64 图片到磁盘
 * @param {string} dataUri - data:image/xxx;base64,... 格式
 * @param {string} [filename] - 可选文件名
 * @returns {Promise<{url: string, filename: string, size: number}>}
 * @throws {Error} 格式无效 / 超过大小限制
 */
export async function saveBase64Image(dataUri, filename) {
  const matches = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error('无效的 Base64 格式');
  }

  const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
  const buffer = Buffer.from(matches[2], 'base64');

  if (buffer.length > MAX_BASE64_SIZE) {
    throw new Error('文件大小超过限制 (10MB)');
  }

  const finalFilename = filename || `${crypto.randomUUID()}${ext}`;
  const filepath = path.join(UPLOAD_DIR, finalFilename);
  fs.writeFileSync(filepath, buffer);

  return {
    url: `/uploads/posecraft/${finalFilename}`,
    filename: finalFilename,
    size: buffer.length
  };
}
