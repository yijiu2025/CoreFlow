/**
 * 头像上传业务服务
 *
 * 从 api/user/v1/upload.js 下沉：文件校验 + sharp 压缩裁剪 + OSS 上传 + DB 更新 + 旧文件清理。
 * 路由层只负责接收 multipart 文件、转 Buffer 后调本服务。
 *
 * @author yijiu
 * @since 2026-08-16
 */
import sharp from 'sharp';
import { uploadFile, deleteFile } from './oss.service.js';
import UserDao from '../dao/user.js';

/** 允许的图片 MIME 类型 */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** 最大文件大小（5MB） */
const MAX_SIZE = 5 * 1024 * 1024;
/** 输出尺寸（256x256） */
const OUTPUT_SIZE = 256;

/**
 * 头像上传错误（带 statusCode，供路由层转 HTTP 响应）
 */
export class AvatarError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * 处理并上传头像
 *
 * 流程：校验类型/大小 → sharp 裁剪压缩为 256x256 JPEG → 上传 → 更新 DB → 异步删旧。
 * @param {string} mimetype - 文件 MIME 类型
 * @param {Buffer} buffer - 文件内容
 * @param {string|number} userId - 用户标识（sub/uid，用于文件名）
 * @param {number} internalUserId - 用户内部 id（用于 DB 更新）
 * @returns {Promise<{avatar: string}>} 新头像 URL
 */
export async function processAndUploadAvatar(mimetype, buffer, userId, internalUserId) {
  // 1. 校验类型
  if (!ALLOWED_TYPES.includes(mimetype)) {
    throw new AvatarError(400, '仅支持 JPG、PNG、WebP、GIF 格式');
  }

  // 2. 校验大小
  if (buffer.length > MAX_SIZE) {
    throw new AvatarError(400, '文件大小不能超过 5MB');
  }

  // 3. sharp 处理：裁剪 + 压缩
  const processed = await sharp(buffer)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: 'cover',
      position: 'centre'
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  // 4. 生成文件名
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const fileName = `avatar_${userId}_${timestamp}_${random}.jpg`;

  // 5. 上传到 OSS 或本地
  const avatarUrl = await uploadFile(processed, fileName, 'image/jpeg');

  // 6. 更新 DB + 异步删除旧头像
  const oldAvatar = await UserDao.updateAvatar(internalUserId, avatarUrl);
  if (oldAvatar && oldAvatar !== avatarUrl) {
    deleteFile(oldAvatar).catch(() => {});
  }

  return { avatar: avatarUrl };
}
