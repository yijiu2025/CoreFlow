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
/** 允许的图片 MIME 类型 → 固定扩展名（扩展名只从白名单映射，绝不用用户文件名） */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};
/** multipart 上传最大 10MB（防内存/磁盘耗尽） */
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
/** Base64 上传最大 10MB */
const MAX_BASE64_SIZE = 10 * 1024 * 1024;

/**
 * 上传业务错误（用户可读、可安全返回给客户端的错误）
 * 仅用于"预期的业务校验失败"；内部错误（写盘失败、解析失败等）请抛普通 Error，
 * 由路由层记日志后统一返回通用提示，避免泄露内部路径/堆栈。
 */
class UploadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadError';
  }
}

/** 常见图片魔数，用于校验真实文件头（不信任客户端声明的 mimetype） */
const MAGIC_BYTES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }
];

/**
 * 校验 Buffer 的真实文件头是否与声明 MIME 匹配
 * @param {Buffer} buffer 文件内容
 * @param {string} mime 客户端声明的 MIME
 * @returns {boolean}
 */
function isMagicMatch(buffer, mime) {
  const rule = MAGIC_BYTES.find(r => r.mime === mime);
  if (!rule || buffer.length < rule.bytes.length) return false;
  return rule.bytes.every((b, i) => buffer[i] === b);
}

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
async function saveUploadFile(file) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    throw new UploadError('不支持的文件类型');
  }

  const buffer = await file.toBuffer();

  // 大小上限：先拒超限文件，避免全量读入内存被滥用
  if (buffer.length > MAX_UPLOAD_SIZE) {
    throw new UploadError('文件大小超过限制 (10MB)');
  }
  // 魔数校验：拒绝「声明 image/png 实为 .html/.svg/.js」的伪造类型（防存储型 XSS）
  if (!isMagicMatch(buffer, file.mimetype)) {
    throw new UploadError('文件内容与类型不符');
  }

  // 文件名完全服务端生成：扩展名只从 MIME 白名单映射，绝不用用户文件名（防路径穿越）
  const ext = EXT_BY_MIME[file.mimetype] || '.png';
  const filename = `${crypto.randomUUID()}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

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
 * @param {string} [filename] - 已废弃：文件名一律服务端生成，参数仅为兼容旧调用方保留（不再使用）
 * @returns {Promise<{url: string, filename: string, size: number}>}
 * @throws {Error} 格式无效 / 超过大小限制 / 内容与类型不符
 */
async function saveBase64Image(dataUri, filename) {
  const matches = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new UploadError('无效的 Base64 格式');
  }

  // MIME 白名单 + 固定扩展名（不用 data URI 里声明的任意类型）
  const mime = `image/${matches[1]}`;
  const ext = EXT_BY_MIME[mime];
  if (!ext) {
    throw new UploadError('不支持的文件类型');
  }

  const buffer = Buffer.from(matches[2], 'base64');

  if (buffer.length > MAX_BASE64_SIZE) {
    throw new UploadError('文件大小超过限制 (10MB)');
  }
  // 魔数校验：拒绝伪造类型（防存储型 XSS）
  if (!isMagicMatch(buffer, mime)) {
    throw new UploadError('文件内容与类型不符');
  }

  // 🔴 文件名完全服务端生成：用户传入的 filename（如 ../../x.js）不再参与路径拼接（防路径穿越）
  const finalFilename = `${crypto.randomUUID()}${ext}`;
  const filepath = path.join(UPLOAD_DIR, finalFilename);
  fs.writeFileSync(filepath, buffer);

  return {
    url: `/uploads/posecraft/${finalFilename}`,
    filename: finalFilename,
    size: buffer.length
  };
}

export { saveUploadFile, saveBase64Image, UploadError };
