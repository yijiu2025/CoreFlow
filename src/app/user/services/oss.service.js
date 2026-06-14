/**
 * OSS 存储服务
 *
 * 支持阿里云 OSS 和本地存储降级。
 * 优先使用 OSS，未配置时自动降级到本地 public/uploads/ 目录。
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Logger from '../../../log/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_UPLOAD_DIR = path.resolve(__dirname, '../../../../public/uploads');

// 延迟加载 ali-oss（未安装时不影响启动）
let OSS = null;
try {
  const mod = await import('ali-oss');
  OSS = mod.default;
} catch {
  // ali-oss 未安装，仅可用本地存储
}

/** OSS 客户端单例 */
let ossClient = null;

/**
 * 初始化 OSS 客户端
 */
function getOssClient() {
  if (ossClient !== undefined) return ossClient;

  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET;
  const region = process.env.OSS_REGION || 'oss-cn-hangzhou';
  const endpoint = process.env.OSS_ENDPOINT;

  if (!OSS || !accessKeyId || !accessKeySecret || !bucket) {
    Logger.warn('[OSS] 未配置或 ali-oss 未安装，降级到本地存储');
    ossClient = null;
    return null;
  }

  ossClient = new OSS({
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    endpoint: endpoint || undefined,
    secure: true
  });

  Logger.info(`[OSS] 客户端初始化成功: ${bucket} @ ${region}`);
  return ossClient;
}

/**
 * 上传文件到 OSS 或本地
 * @param {Buffer} buffer - 文件内容
 * @param {string} fileName - 文件名（含扩展名）
 * @param {string} mimeType - MIME 类型
 * @returns {Promise<string>} 文件访问 URL
 */
export async function uploadFile(buffer, fileName, mimeType) {
  const client = getOssClient();

  if (client) {
    return uploadToOss(client, buffer, fileName, mimeType);
  }

  return uploadToLocal(buffer, fileName);
}

/**
 * 上传到阿里云 OSS
 */
async function uploadToOss(client, buffer, fileName, mimeType) {
  const bucket = process.env.OSS_BUCKET;
  const region = process.env.OSS_REGION || 'oss-cn-hangzhou';
  const customDomain = process.env.OSS_CUSTOM_DOMAIN;

  const key = `avatars/${fileName}`;

  await client.put(key, buffer, {
    headers: { 'Content-Type': mimeType }
  });

  // 返回访问 URL
  if (customDomain) {
    return `${customDomain}/${key}`;
  }
  return `https://${bucket}.${region}.aliyuncs.com/${key}`;
}

/**
 * 上传到本地存储（降级方案）
 */
async function uploadToLocal(buffer, fileName) {
  // 确保目录存在
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  }

  const avatarsDir = path.join(LOCAL_UPLOAD_DIR, 'avatars');
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }

  const filePath = path.join(avatarsDir, fileName);
  fs.writeFileSync(filePath, buffer);

  // 返回相对 URL（由 Fastify 静态文件服务提供）
  return `/uploads/avatars/${fileName}`;
}

/**
 * 删除旧头像（可选，不阻塞主流程）
 */
export async function deleteFile(url) {
  if (!url) return;

  try {
    const client = getOssClient();
    if (client && url.includes('aliyuncs.com')) {
      // 从 URL 提取 key
      const bucket = process.env.OSS_BUCKET;
      const region = process.env.OSS_REGION || 'oss-cn-hangzhou';
      const prefix = `https://${bucket}.${region}.aliyuncs.com/`;
      if (url.startsWith(prefix)) {
        const key = url.slice(prefix.length);
        await client.delete(key);
      }
    } else if (url.startsWith('/uploads/')) {
      // 本地文件
      const filePath = path.join(LOCAL_UPLOAD_DIR, url.replace('/uploads/', ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    Logger.warn(`[OSS] 删除旧头像失败: ${err.message}`);
  }
}
