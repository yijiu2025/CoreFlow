/**
 * 静态 / 私有文件的**目录约定与路径守卫**（framework 层，零业务依赖）
 *
 * ════════════════════════════════════════════════════════════════════
 * 两个根，别混
 * ════════════════════════════════════════════════════════════════════
 *   public/<app>/…    公开资源：由 `@fastify/static`（prefix `/`）直出，任何人可访问。
 *                     只放「被陌生人拿到也无所谓」的东西：作品展示图、头像、logo、字体。
 *   storage/<app>/…   私有资源：**不在静态根下**，只能经 `GET /api/files/v1/:app/*`
 *                     鉴权后由 Node 读盘下发。合同、导出报表、证件、付费内容放这里。
 *
 * 为什么必须分开：`public/` 不是权限控制，只是"URL 猜不到"。一旦 URL 流出（分享、Referer、
 * 日志、截图、DB 导出），任何人都能永久下载且无法撤销 —— 私有文件放进去等于泄露。
 *
 * ════════════════════════════════════════════════════════════════════
 * 目录按 app 分层（多应用共存，互不踩踏）
 * ════════════════════════════════════════════════════════════════════
 *   public/posecraft/<uuid>.jpg          ⇐ posecraft 的公开图片
 *   public/user/avatars/<file>.jpg       ⇐ 用户头像
 *   storage/posecraft/u/<ownerId>/<f>    ⇐ posecraft 的私有文件（按归属再分一层）
 *
 * 私有文件强制 `u/<ownerId>/` 前缀：归属写进路径，下载路由据此鉴权，
 * 不依赖任何额外表就能做到"只能下载自己的"。
 *
 * ════════════════════════════════════════════════════════════════════
 * 为什么两个根都在**仓库根**，而不是 `src/` 下
 * ════════════════════════════════════════════════════════════════════
 *   - `src/` 只放代码（进镜像、可只读挂载）；`public/` 与 `storage/` 是**运行期数据**，
 *     需要单独挂卷 / 备份 / 在多实例间共享，放在 src 里会被构建和只读约束一起管住。
 *   - 容器里可写面只有 logs、data、public/<app>、storage（见 Dockerfile），
 *     根目录布局与 `chown` 一一对应。
 *   - 所有路径都从本模块取（`appDir` / `resolveFile` / `publicUrl` / `publicUrlToPath`），
 *     **禁止**在业务代码里用 `path.join(__dirname, '../../public')` 之类自己数层级 ——
 *     数错一级就会静默写进 `src/public`（真实事故：preview.js 少写一层，
 *     预览图全写进 src/public，静态服务读的是根 public，于是全部 404）。
 *     这条约束由 `src/__tests__/storage-root.test.js` 静态扫描守着。
 *
 * @author yijiu2025
 * @since 2026-11-04
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../paths.js';

// 仓库根只从 framework/paths.js 取：这里再数一次 `../` 就等于第二份定义，改一处忘一处。
/** 公开静态根（`@fastify/static` 的 root） */
const PUBLIC_ROOT = path.join(REPO_ROOT, 'public');
/** 私有文件根（不进静态服务，只能走鉴权下载） */
const PRIVATE_ROOT = path.join(REPO_ROOT, 'storage');

/** app 名白名单格式：小写字母数字与 -_，2~32 位（防止 `..`、分隔符、盘符混进来） */
const APP_PATTERN = /^[a-z0-9][a-z0-9_-]{1,31}$/i;

/**
 * 校验 app 名
 *
 * @param {string} app app 标识（如 posecraft / user / firewall）
 * @returns {string} 原值
 * @throws {Error} 非法时抛错（调用方应转成 400，不要静默吞掉）
 */
function assertApp(app) {
  if (typeof app !== 'string' || !APP_PATTERN.test(app)) {
    throw new Error(`非法的 app 标识: ${String(app)}`);
  }
  return app;
}

/**
 * 校验相对 key（可含 `/` 分层，如 `u/42/a.pdf`）
 *
 * 每一段都必须是普通文件名：拒绝空段、`.`、`..`、反斜杠、NUL、绝对路径。
 *
 * @param {string} key 相对路径
 * @returns {string[]} 段数组
 * @throws {Error} 非法时抛错
 */
function assertKey(key) {
  if (typeof key !== 'string' || key.length === 0) throw new Error('文件 key 不能为空');
  const segs = key.split('/');
  for (const seg of segs) {
    if (!seg || seg === '.' || seg === '..') throw new Error(`非法的路径段: ${JSON.stringify(seg)}`);
    if (seg.includes('\\') || seg.includes('\0')) throw new Error('文件 key 含非法字符');
    if (path.isAbsolute(seg)) throw new Error('文件 key 不允许绝对路径');
  }
  return segs;
}

/**
 * 取某个 app 的目录（公开或私有）
 *
 * @param {string} app app 标识
 * @param {{private?: boolean}} [options] private=true 表示私有根
 * @returns {string} 绝对目录
 */
function appDir(app, options = {}) {
  const root = options.private ? PRIVATE_ROOT : PUBLIC_ROOT;
  return path.join(root, assertApp(app));
}

/**
 * 解析到绝对文件路径（带越界双保险）
 *
 * @param {string} app app 标识
 * @param {string} key 相对 key
 * @param {{private?: boolean}} [options] 私有 / 公开根
 * @returns {string} 绝对文件路径
 * @throws {Error} 非法或越界时抛错
 */
function resolveFile(app, key, options = {}) {
  const dir = appDir(app, options);
  const abs = path.resolve(dir, ...assertKey(key));
  // 双保险：拼完必须仍在 app 目录内（`..` 已在 assertKey 拦掉，这里防实现漂移）
  if (abs !== dir && !abs.startsWith(dir + path.sep)) {
    throw new Error('文件路径越界');
  }
  return abs;
}

/**
 * 公开文件的可访问 URL（`@fastify/static` 以 `/` 为 prefix，所以直接拼 `/<app>/<key>`）
 *
 * @param {string} app app 标识
 * @param {string} key 相对 key
 * @returns {string} 形如 `/posecraft/xxx.jpg`
 */
function publicUrl(app, key) {
  return `/${assertApp(app)}/${assertKey(key).join('/')}`;
}

/**
 * 私有文件的归属 key：`u/<ownerId>/<filename>`
 *
 * 归属写进路径 = 下载路由不需要查表就能判定"这是谁的文件"。
 *
 * @param {string|number} ownerId 归属用户 id（内部 id）
 * @param {string} filename 文件名（由服务端生成，不含路径）
 * @returns {string} 相对 key
 */
function privateKey(ownerId, filename) {
  const id = String(ownerId ?? '').trim();
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(id)) throw new Error(`非法的 ownerId: ${String(ownerId)}`);
  const segs = assertKey(filename);
  if (segs.length !== 1) throw new Error('filename 只能是文件名，不能含路径');
  return `u/${id}/${filename}`;
}

/**
 * 公开 URL → 绝对文件路径（`/posecraft/xxx.jpg` → `<repo>/public/posecraft/xxx.jpg`）
 *
 * 用于「DB 里存了 URL、需要回头读原文件」的场景（如按底图生成缩略图）。
 * 不要用 `path.resolve(process.cwd(), 'public', ...)` 代替：那依赖启动时的 cwd，
 * 从别的目录启动就会静默读不到（返回 null，看起来"没有缩略图"而不是报错）。
 *
 * @param {string} url 公开 URL（必须以 `/` 开头；带 query / hash 时会被忽略）
 * @returns {string} 绝对文件路径
 * @throws {Error} 非站内绝对路径或含非法段时抛错
 */
function publicUrlToPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) {
    throw new Error(`不是站内绝对路径: ${String(url)}`);
  }
  const clean = url.split(/[?#]/, 1)[0];
  const segs = assertKey(clean.replace(/^\/+/, ''));
  const abs = path.resolve(PUBLIC_ROOT, ...segs);
  if (!abs.startsWith(PUBLIC_ROOT + path.sep)) throw new Error('公开路径越界');
  return abs;
}

/**
 * 确保目录存在（幂等）
 *
 * @param {string} dir 绝对目录
 * @returns {string} 同一目录
 */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export {
  REPO_ROOT,
  PUBLIC_ROOT,
  PRIVATE_ROOT,
  assertApp,
  assertKey,
  appDir,
  resolveFile,
  publicUrl,
  publicUrlToPath,
  privateKey,
  ensureDir
};
