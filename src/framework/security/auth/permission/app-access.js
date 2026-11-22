/**
 * 应用准入判定（登录闸门）
 *
 * 解决的问题：统一身份认证（oauth21）面向**所有注册用户**，而管理后台只应对
 * **被授予管理权限**的账号开放。没有这层判定时，普通注册用户能走完 SSO →
 * `bind-session` → 拿到会话，进后台看到的是空壳（菜单为空、接口全 403），
 * 表现成"能登录但什么都点不动"，既不像成功也不像失败。
 *
 * === 判定来源（全声明式，本模块不含任何应用名硬编码）===
 * ```js
 * // src/app/<app>/config.js
 * access: {
 *   anyPermission: ['admin:*'],        // 任一权限码命中即可（支持通配）
 *   anyRole: ['superadmin'],           // 或任一角色命中即可（历史账号兜底）
 *   selfService: false,                // 自助区准入：true 时"登录即可进"（见下）
 *   denyMessage: '该账号没有管理后台访问权限，请联系管理员分配角色'
 * }
 * ```
 * 两个数组都为空 / 未声明 `access` ⇒ **不限制**（其它应用维持原行为）。
 *
 * === `selfService`：为什么"管理自己的账号"不是一个权限码 ===
 * 个人资料 / 通知偏好 / 外观主题 / 账号与安全这四页对**每个登录用户**都该存在，
 * 但它刻意**不做成**可授予的权限码（如 `admin:self`），原因是权限码会被角色授予
 * 与收回：某个角色少勾了一项，表现就是"登录成功但侧栏白板"，而这种故障在测试环境
 * 永远复现不出来（测试账号通常持有 `admin:*`）。它是**身份自带的准入权**，只与
 * "是否已登录"有关，因此落在准入策略这一层，而不是权限命名空间里。
 *
 * 取值的后果差别极大，配置侧必须写清楚：
 *   · `false`（默认）—— 封闭应用：没有 `admin:*` 的账号连会话接口都进不来；
 *   · `true`          —— 半开放：任何已登录账号能进，但**只**看见自助区四页
 *                        （菜单侧靠 `/settings/` 前缀，接口侧靠各路由自己的
 *                        `requireLogin` + 只认 `request.state.user.uid` 的自取范围）。
 * 注意 `denies` 仍然压过 `selfService`：封禁账号不会因为"登录了"就拿到自助入口。
 *
 * === 权限从哪来 ===
 * `getPermissions()`（带指纹校验的唯一读口），命名空间经 `resolvePermissionAppId`
 * 映射 —— console 的角色住在历史 namespace `admin` 下，直接用登录 appId 查会恒为空。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { getAppConfig, resolvePermissionAppId } from '../../../config/app-registry.js';
import { createLogger } from '../../../support/log/index.js';
import { getPermissions } from './perm-cache.js';

const log = createLogger('framework.auth.app-access');

/** 缺省拒绝文案（应用没写 `denyMessage` 时用它） */
const DEFAULT_DENY_MESSAGE = '该账号没有访问本应用的权限，请联系管理员分配角色';

/**
 * 权限模式匹配（**双向通配**）
 *
 * 与路由守卫的 `matchSingle` 方向不同：那里"授予的通配能否覆盖所需的具体码"，
 * 这里问的是"授予的码能否落进某个**命名空间**"。两个方向都要认：
 *
 * ```
 * 授予 admin:*        vs 所需 admin:user:read   → 命中（前缀通配，守卫同款）
 * 授予 admin:user:read vs 所需 admin:*          → 命中（命名空间，本模块专有）
 * 授予 *              vs 任何                  → 命中
 * ```
 *
 * 为什么要后一个方向：准入只关心"有没有这一族能力"，不关心具体是哪一条；
 * 若只按守卫的方向匹配，持有 `admin:user:read` 的账号会被判成"没有 admin:*"，
 * 于是所有非超管账号都进不来 —— 正是本次要修的那种"看起来合理、实际全禁"。
 *
 * @param {string} granted 授予的权限码（可含 `*`）
 * @param {string} pattern 所需模式（可含 `*`）
 * @returns {boolean} 是否命中
 */
function permissionCovers(granted, pattern) {
  if (!granted || !pattern) return false;
  if (granted === '*' || pattern === '*' || granted === pattern) return true;
  if (granted.endsWith('*') && pattern.startsWith(granted.slice(0, -1))) return true;
  if (pattern.endsWith('*') && granted.startsWith(pattern.slice(0, -1))) return true;
  return false;
}

/**
 * 是否命中任一条模式
 *
 * @param {string[]} codes 授予的权限码
 * @param {string[]} patterns 需要的模式
 * @returns {boolean} 是否命中
 */
function matchesAny(codes, patterns) {
  if (!Array.isArray(codes) || !Array.isArray(patterns) || patterns.length === 0) return false;
  return patterns.some(pattern => codes.some(code => permissionCovers(code, pattern)));
}

/**
 * 取某应用的准入策略（未声明时返回空策略 = 不限制）
 *
 * 单独导出是为了让**请求期**也能用同一份规则：登录闸门读配置判一次，
 * 会话接口里再判一次「角色被撤销了没有」，两处必须是同一套模式，
 * 各写一份的结果是"能登录但一刷新就 403"或反过来。
 *
 * @param {string} appId 应用标识
 * @returns {{anyPermission: string[], anyRole: string[], selfService: boolean, denyMessage: string}} 策略
 */
function getAccessPolicy(appId) {
  const policy = getAppConfig(appId)?.access;
  return {
    anyPermission: Array.isArray(policy?.anyPermission) ? policy.anyPermission : [],
    anyRole: Array.isArray(policy?.anyRole) ? policy.anyRole : [],
    // 只认严格的 `true`：写成 `'true'` / `1` 一律当关闭 —— 这个开关一旦被字符串误开，
    // 后果是"任何注册用户都能进后台"，允许类型宽松等于给配置错误开一扇门。
    selfService: policy?.selfService === true,
    denyMessage: policy?.denyMessage || DEFAULT_DENY_MESSAGE
  };
}

/**
 * 用**已算好的**权限码与角色判定准入（纯函数）
 *
 * 为什么需要它：请求期手里已经有 `effectiveCodes()` 的结果，再过一遍缓存只为
 * 判同一件事是浪费；而直接写死 `admin:*` 更糟 —— 曾经 `session.js` 就是这么干的，
 * 于是"只授了 `notice:*` 的通知管理员"能登录却被会话接口挡在门外，两个判定各说各话。
 *
 * @param {object} policy `getAccessPolicy()` 的返回值
 * @param {object} [granted] 已授予的码与角色
 * @param {string[]} [granted.codes] 生效权限码
 * @param {string[]} [granted.roles] 角色编码
 * @param {string[]} [granted.denies] 显式拒绝的码
 * @param {boolean} [granted.authenticated=false] 是否已登录（`selfService` 的前提）
 * @returns {{allowed: boolean, reason?: string}} 判定结果
 */
function matchesAccessPolicy(policy, { codes = [], roles = [], denies = [], authenticated = false } = {}) {
  const anyPermission = policy?.anyPermission ?? [];
  const anyRole = policy?.anyRole ?? [];
  if (anyPermission.length === 0 && anyRole.length === 0) return { allowed: true };

  // 显式拒绝**永远优先**：封禁账号不能靠"已登录"从自助区溜进来
  if (matchesAny(denies, anyPermission)) return { allowed: false, reason: 'DENIED_BY_POLICY' };

  const roleHit = anyRole.length > 0 && roles.some(role => anyRole.includes(role));
  const permHit = matchesAny(codes, anyPermission);
  if (roleHit || permHit) return { allowed: true };

  /*
   * 自助区准入：**只与"是否已登录"有关**，与权限码无关。
   * 放在 capability 之后而不是之前，是为了让"有管理能力"的账号走正常路径 ——
   * 返回值里 `reason` 不同，排查时能一眼看出这个人是靠角色进来的还是靠自助区进来的。
   */
  if (policy?.selfService === true && authenticated) return { allowed: true, reason: 'SELF_SERVICE' };

  return { allowed: false, reason: 'NO_CAPABILITY' };
}

/**
 * 判定某用户能否进入某应用
 *
 * 失败语义只有两种：**放行**（`allowed: true`）或**拒绝并给出文案**。
 * 判定过程本身出错时**按拒绝处理**：闸门的职责是"默认关"，出错时放行等于
 * 在数据库抖动期间把后台敞开。
 *
 * @param {string} appId 登录应用标识（会话里的 `appId`）
 * @param {number} userId 用户内部 ID（数字主键）
 * @returns {Promise<{ allowed: boolean, message?: string, reason?: string }>} 判定结果
 */
async function checkAppAccess(appId, userId) {
  const policy = getAccessPolicy(appId);
  if (policy.anyPermission.length === 0 && policy.anyRole.length === 0) return { allowed: true };
  if (!userId) return { allowed: false, message: policy.denyMessage, reason: 'NO_USER' };

  const permAppId = resolvePermissionAppId(appId);
  let loaded;
  try {
    loaded = await getPermissions(Number(userId), permAppId);
  } catch (err) {
    log.error(`🚫 [AppAccess] 权限加载失败，按拒绝处理: appId=${appId}, userId=${userId}`, err);
    return { allowed: false, message: '权限校验暂时不可用，请稍后重试', reason: 'PERM_LOAD_FAILED' };
  }

  const verdict = matchesAccessPolicy(policy, {
    codes: Array.isArray(loaded?.permissions?.allows) ? loaded.permissions.allows : [],
    roles: Array.isArray(loaded?.roles) ? loaded.roles : [],
    // 显式拒绝优先：Deny 命中任何一条所需模式即拒绝（封禁角色走这条路）
    denies: Array.isArray(loaded?.permissions?.denies) ? loaded.permissions.denies : [],
    // 走到这里说明 userId 存在 —— 登录已经成功，`selfService` 若开着就凭这一点放行
    authenticated: true
  });
  return verdict.allowed ? verdict : { ...verdict, message: policy.denyMessage };
}

export { checkAppAccess, getAccessPolicy, matchesAccessPolicy, permissionCovers, DEFAULT_DENY_MESSAGE };
