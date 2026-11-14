/**
 * 后台管理（console）头像上传
 *
 * 只做一件事：把用户上传的图片写进 `public/console/u/<userId>/`，返回可直接访问的 URL。
 *
 * 为什么不用「填链接」：外链头像会随着对方站点失效/防盗链变成裂图，而且 40x40 的头像
 * 指向一个几 MB 的原图也不合适。落本地公开目录后由 `@fastify/static` 直出，路径稳定。
 *
 * 安全边界：
 *   - **只认 MIME 白名单 + 文件头魔数**，不信任客户端声明的 Content-Type；
 *   - 文件名**由服务端生成**（hash + 白名单扩展名），绝不用用户提交的文件名
 *     （原名带 `../` 或 `.php` 是经典上传漏洞）；
 *   - 单文件 2MB 上限：头像是 40~80px 的东西，再大就是误用。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appDir, ensureDir, resolveFile, publicUrl } from '../../../framework/persistence/storage/index.js';

const APP = 'console';
/** 头像上限 2MB（够用，也避免把大头像当图床） */
const MAX_SIZE = 2 * 1024 * 1024;
/** 允许的图片类型 → 固定扩展名（扩展名只从本表取） */
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
/** 常见图片魔数：声明 MIME 与真实文件头必须一致 */
const MAGIC = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46]
};

/**
 * 校验并保存头像
 *
 * @param {object} params 参数
 * @param {number} params.userId 用户内部 ID
 * @param {Buffer} params.buffer 文件内容
 * @param {string} params.mimetype 客户端声明的 MIME
 * @returns {Promise<{url: string}>} 可访问 URL（形如 `/console/u/1/avatar-ab12cd34.webp`）
 * @throws {Error} `INVALID_PARAM:...` 校验失败
 */
async function saveAvatar({ userId, buffer, mimetype }) {
  const ext = EXT_BY_MIME[mimetype];
  if (!ext) throw new Error('INVALID_PARAM:只支持 JPG / PNG / WebP 图片');
  if (!buffer || buffer.length === 0) throw new Error('INVALID_PARAM:文件是空的');
  if (buffer.length > MAX_SIZE) throw new Error('INVALID_PARAM:头像不能超过 2MB');

  const magic = MAGIC[mimetype];
  if (!magic.every((byte, i) => buffer[i] === byte)) {
    throw new Error('INVALID_PARAM:文件内容与图片格式不符');
  }

  // 文件名由服务端生成：只保留 hash，杜绝用原名带来的路径穿越与可执行扩展名
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  const key = `u/${Number(userId)}/avatar-${hash}${ext}`;
  const abs = resolveFile(APP, key);
  ensureDir(path.dirname(abs));
  await fs.promises.writeFile(abs, buffer);

  await removeOldAvatars(Number(userId), path.basename(abs));
  return { url: publicUrl(APP, key) };
}

/**
 * 清掉该用户旧的头像文件
 *
 * 不清理的话每换一次头像就多一个孤儿文件；只删同目录下的 `avatar-*`，
 * 不碰别的应用/别的用户的文件。
 *
 * @param {number} userId 用户内部 ID
 * @param {string} keep 本次新写入的文件名
 * @returns {Promise<void>}
 */
async function removeOldAvatars(userId, keep) {
  const dir = path.join(appDir(APP), 'u', String(userId));
  try {
    const names = await fs.promises.readdir(dir);
    await Promise.all(
      names
        .filter(name => name.startsWith('avatar-') && name !== keep)
        .map(name => fs.promises.unlink(path.join(dir, name)).catch(() => {}))
    );
  } catch {
    // 目录不存在 / 权限问题都不该影响本次上传
  }
}

/** 服务门面：路由只依赖这一个入口 */
const avatarService = { saveAvatar, MAX_SIZE, APP };

export default avatarService;
