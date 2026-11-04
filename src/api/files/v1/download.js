/**
 * 私有文件下载（**唯一出口**）
 *
 * `GET /api/files/v1/:app/u/:ownerId/:filename`
 *
 * ════════════════════════════════════════════════════════════════════
 * 为什么单独走一条路由，而不是放 public/ 让静态服务直出
 * ════════════════════════════════════════════════════════════════════
 * `public/` 由 `@fastify/static` 以 `/` 为 prefix 直出，**没有任何鉴权**：URL 一旦流出
 * （分享、Referer、日志、截图、DB 导出），任何人都能永久下载且无法撤销。
 * 所以私有文件存 `storage/<app>/…`（不在静态根下），只能经本路由：
 *   · `requireLogin`：必须登录；
 *   · 归属校验：key 必须形如 `u/<ownerId>/…`，非本人（且非 admin）一律 403；
 *   · `Cache-Control: private, no-store`：不进任何共享缓存；
 *   · 不提供目录列表、不做路径猜测（`resolveFile` 会拒绝 `..` / 绝对路径）。
 *
 * ════════════════════════════════════════════════════════════════════
 * 目录约定（详见 src/framework/storage/index.js）
 * ════════════════════════════════════════════════════════════════════
 *   storage/<app>/u/<ownerId>/<filename>   ← 本路由能读到的**唯一**形态
 *   public/<app>/<filename>                ← 公开资源，静态服务直出，不走这里
 *
 * @author yijiu2025
 * @since 2026-11-04
 */
import fs from 'node:fs';
import path from 'node:path';
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { PRIVATE_ROOT, resolveFile } from '../../../framework/storage/index.js';

/** 允许内联展示的扩展名（其余一律按附件下载，避免被浏览器当页面渲染） */
const INLINE_EXT = /\.(png|jpe?g|webp|gif|pdf|txt)$/i;

/**
 * 解析出「归属用户 id」——私有文件的 key 必须带 `u/<ownerId>/` 前缀
 *
 * 归属写进路径而不是额外查表：既不泄漏别人的文件是否存在，也不依赖 DB 往返。
 *
 * @param {string} key 相对 key
 * @returns {string|null} ownerId；格式不对（没有归属层）返回 null
 */
function ownerOfKey(key) {
  if (typeof key !== 'string') return null;
  const segs = key.split('/');
  if (segs.length < 3) return null;
  if (segs[0] !== 'u') return null;
  if (!segs[1]) return null;
  return segs[1];
}

/**
 * 注册私有文件下载路由
 *
 * @param {import('fastify').FastifyInstance} fastify Fastify 实例
 * @returns {Promise<void>}
 */
async function registerFileRoutes(fastify) {
  registerGroupMetadata({
    name: 'download',
    description: '私有文件鉴权下载（按 app 隔离 + 归属校验）',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'downloadPrivate',
    alias: '下载私有文件',
    method: 'GET',
    url: '/:app/*',
    requireLogin: true,
    // 该端点的 403/404 是正常业务语义（无权访问 / 文件已删），不该计入扫描陷阱
    config: { firewall: { skipScanTrap: true } },
    schema: {
      params: {
        type: 'object',
        required: ['app', '*'],
        properties: {
          app: { type: 'string', minLength: 1, maxLength: 32 },
          '*': { type: 'string', minLength: 1, maxLength: 512 }
        }
      },
      querystring: {
        type: 'object',
        properties: { download: { type: 'string', enum: ['0', '1'] } }
      }
    },
    handler: async (request, reply) => {
      const { app } = request.params;
      const key = request.params['*'];

      // 1. 路径守卫（越界 / 绝对路径 / `..` 一律 400）
      let abs;
      try {
        abs = resolveFile(app, key, { private: true });
      } catch (err) {
        return reply.result.badRequest(err.message);
      }

      // 2. 归属校验：私有文件必须带 u/<ownerId>/ 前缀
      const ownerId = ownerOfKey(key);
      if (!ownerId) {
        return reply.result.forbidden('私有文件必须带归属路径（u/<ownerId>/<filename>）');
      }
      const user = request.state?.user || {};
      const currentUserId = String(user.id ?? user.userId ?? '');
      const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');
      if (!isAdmin && currentUserId !== ownerId) {
        return reply.result.forbidden('无权访问该文件');
      }

      // 3. 存在性 + 拒绝符号链接
      // 用 lstat 而不是 stat：stat 会跟随软链，storage/ 里若被人放了指向 /etc/passwd
      // 的符号链接（备份还原、运维手抖、其它写入方），stat 会照样 `isFile() === true`。
      // 私有文件的出口只该是**真实文件**，软链一律当不存在。
      let stat;
      try {
        stat = fs.lstatSync(abs);
      } catch {
        return reply.result.notFound('文件不存在');
      }
      if (!stat.isFile() || stat.isSymbolicLink()) return reply.result.notFound('文件不存在');

      // 4. 下发：禁止缓存共享、禁止 MIME 嗅探；非白名单扩展名强制下载
      const filename = path.basename(abs);
      const forceDownload = request.query?.download === '1';
      const inline = !forceDownload && INLINE_EXT.test(filename);

      reply.header('Cache-Control', 'private, no-store');
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`
      );

      // cacheControl:false —— 静态插件默认会按 maxAge 写 `public, max-age=…`，
      // 对私有文件是错的（共享缓存会把别人的文件发给别人）。
      return reply.sendFile(path.relative(PRIVATE_ROOT, abs), PRIVATE_ROOT, {
        cacheControl: false,
        etag: false,
        lastModified: false
      });
    }
  });
}

export default registerFileRoutes;
export { ownerOfKey };
