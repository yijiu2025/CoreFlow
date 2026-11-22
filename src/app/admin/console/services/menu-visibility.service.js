/**
 * 菜单可见性规则（**唯一来源**）
 *
 * 两处消费：
 * 1. `GET /admin/v1/session/routes` 的裁剪 —— 决定侧栏能看见什么；
 * 2. `POST/PUT /admin/v1/menus` 的写入校验 —— 决定什么样的菜单允许入库。
 *
 * 两条规则必须成对存在：
 *   · 读侧**默认拒绝**（没授权就不下发）；
 *   · 写侧**必须声明权限码**（除了 `/settings/` 自助区）。
 *
 * 只做读侧的默认拒绝，管理员仍能建出一个"没有权限码的页面菜单" —— 它拿不到任何
 * 授权，看起来是隐藏了，但只要哪天有人为了"先让它显示出来"放宽判据，就会变成
 * 全员可见。写侧直接拒掉，这类数据压根进不来。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */

/**
 * 自助区路径前缀（保留命名空间）
 *
 * 只有"每个后台用户管自己"的页面可以落在这里：个人资料、通知偏好、外观与主题、
 * 账号与安全。它们不参与菜单授权，登录即可见。
 *
 * 🔴 管理页**不准**挂进来 —— 落进来就等于对所有登录用户开放。新增自助页只能
 *    复用这个前缀，不要另起一个。
 */
const SELF_SERVICE_PREFIX = '/settings/';

/**
 * 路径是否属于自助区
 *
 * @param {unknown} path 菜单路径
 * @returns {boolean} 是否自助区路径
 */
function isSelfServicePath(path) {
  return String(path || '').startsWith(SELF_SERVICE_PREFIX);
}

/**
 * 校验「页面菜单必须声明权限码」
 *
 * 判据只看 `type === 'menu'`：
 *   · `dir` 是容器，本身不进路由，不需要码；
 *   · `btn` 在 `toModelFields` 里已有更严的规则（必须填码）。
 *
 * 例外只有自助区：`/settings/` 下的页面允许不填码，这是**显式白名单**，
 * 不是"没写码就放行"。
 *
 * @param {object} payload 菜单字段（模型口径：`type` / `permission` / `path`）
 * @returns {void}
 * @throws {Error} `INVALID_PARAM:...`
 */
function assertMenuDeclaresPermission(payload) {
  if (payload?.type !== 'menu') return;
  if (payload.permission) return;
  if (isSelfServicePath(payload.path)) return;
  throw new Error('INVALID_PARAM:页面菜单必须填写权限码；只有 /settings/ 下的自助页（个人资料、通知偏好等）可以不填');
}

export { SELF_SERVICE_PREFIX, isSelfServicePath, assertMenuDeclaresPermission };
