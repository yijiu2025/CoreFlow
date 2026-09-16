/**
 * 权限缓存键与指纹（framework/auth 权限缓存治理）
 *
 * 职责有二，都是为了回答同一个问题：**缓存里的权限还能不能信**。
 *
 * 1. **缓存键构造**（第 2 层防御）
 *    命名空间带 `auth:perm:` 前缀，键体用 sha256 截断 —— 让"这是认证框架的数据"
 *    在 Redis 里一眼可见，且键不可由 userId/appId 明文枚举。
 *
 * 2. **权限指纹**（第 3 层防御）
 *    由三张权限表的 `(id, updatedAt)` 组合算出轻量指纹。缓存里存指纹，
 *    读取时比对：不一致即视为失效，回源重载。
 *
 *    为什么不用 DB 版本列：
 *    - `Role.policy` 改一次影响该角色下**所有**用户，逐个递增 `users.perm_version`
 *      既慢又必然漏（任何绕过 DAO 的写入都不会记得递增）
 *    - 指纹由**数据自身**推导，不存在"忘记递增"的运维漏洞
 *    - 三张表都是 `timestamps: true`，指纹无需任何 schema 改动
 *
 *    ⚠️ `underscored: true` 下时间戳**属性名**仍是 `updatedAt` / `deletedAt`
 *    （物理列才是 `updated_at`）。写 `'updated_at'` 会被 Sequelize **静默丢弃**，
 *    于是指纹恒为常量、缓存永不失效 —— 而测试会因为"缓存命中"而通过。
 *
 * @author yijiu2025
 * @since 2026-09-16
 */
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { getModel } from '../db/index.js';
import { loadUserPermissions } from './permission-loader.js';
import { permStore as sharedPermStore } from './session-store.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.perm-cache');

/** perm 缓存的 Redis 命名空间：`auth:` 前缀声明归属，业务代码不应触碰 */
//
// ⚠️ 同一个 **字面量** 在 session-store.js 里也声明了一次（该文件受"零兄弟模块依赖"
// 约束，不能 import 本模块）。两处必须逐字一致，由契约测试钉死 —— 命名空间字符串
// 不一致会让读写落到不同 store，且**静默失效**（历史上的 'user_sessions' 事故）。
const PERM_NAMESPACE = 'auth:perm';

/** 缓存 TTL（秒）：短于会话 TTL，保证权限变更即便指纹失效也能自愈 */
const PERM_TTL = 60;

/**
 * 由 (userId, appId) 构造不可枚举的缓存键
 *
 * 原实现是明文 `${userId}:${appId}` —— 键空间可被遍历猜测，
 * 且与业务 store 无命名区隔，任何 `getStore('perm')` 都能读写。
 *
 * @param {number|string} userId 用户内部 ID
 * @param {string} appId 应用标识
 * @returns {string} 形如 `a1b2c3d4e5f6a7b8` 的 16 位 hex
 */
function buildPermKey(userId, appId) {
  return crypto.createHash('sha256').update(`${userId}\u0000${appId}`).digest('hex').slice(0, 16);
}

/**
 * 归一化时间戳为可参与指纹的字符串
 *
 * 兼容 Date / 字符串 / 数字 / null（paranoid 未删除时为 null）。
 *
 * ⚠️ 不直接 String(dateObj)：不同 Sequelize 版本/时区下的 toString 可能不同，
 * 统一转 epoch 毫秒保证指纹在进程间稳定。
 *
 * ⚠️ 全程包在 try 内并做类型前置判断：本函数会处理**来自 DB 的值**，
 * 而 `new Date(Symbol())` / `new Date(1n)` 都会抛 TypeError。
 * 本仓已多次出现"外部可控值未归一化直接进运算"的缺陷（cookie/totp/signature），
 * 这里同样必须兜底 —— 一旦抛错，上层 `computePermFingerprint` 失败，
 * 整个权限读取会退化成回源，甚至在降级分支里沿用陈旧权限。
 *
 * @param {Date|string|number|null|undefined} v 时间戳
 * @returns {string} epoch 毫秒字符串，或空串（无法解析）
 */
function normalizeTs(v) {
  try {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) {
      const t = v.getTime();
      return Number.isFinite(t) ? String(t) : '';
    }
    // 只接受可安全参与 Date 构造的原始类型；其余（Symbol/BigInt/对象/函数）一律视为无效，
    // 不抛错也不猜测 —— 指纹里留空比崩溃或猜错更安全
    const type = typeof v;
    if (type !== 'string' && type !== 'number') return '';
    if (type === 'number' && !Number.isFinite(v)) return '';
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? String(t) : '';
  } catch {
    return '';
  }
}

/**
 * 计算用户的权限指纹
 *
 * 覆盖三张表的**行级变更**：新增/删除（id 集合变化）与更新（updatedAt 变化）。
 * 刻意**不读 policy JSON** —— 只需 id 与时间戳，查询很轻。
 *
 * 行按 id 排序后再拼接，保证同一份数据在任何查询顺序下得到同一指纹
 * （SQL 不保证返回顺序，依赖返回顺序会让指纹无谓抖动 → 缓存每次都判定失效）。
 *
 * @param {number} userId 用户内部 ID
 * @param {string} appId 应用标识（含 'GLOBAL'）
 * @returns {Promise<string>} 16 位 hex 指纹
 */
async function computePermFingerprint(userId, appId) {
  const UserRole = getModel('UserRole');
  const Role = getModel('Role');
  const InlinePolicy = getModel('InlinePolicy');

  const apps = appId === 'GLOBAL' ? [appId] : [appId, 'GLOBAL'];

  // 只取 id / updatedAt / deletedAt（paranoid 软删行也要反映进指纹）
  const userRoles = await UserRole.findAll({
    where: { user_id: userId, app_id: { [Op.in]: apps } },
    attributes: ['id', 'updatedAt', 'deletedAt', 'role_id'],
    paranoid: false
  });

  // 角色**策略**变更会影响该角色下所有用户 → 必须把 Role 行纳入指纹
  const roleIds = [...new Set(userRoles.map(ur => ur.get('role_id')).filter(Boolean))];
  const roles = roleIds.length
    ? await Role.findAll({
        where: { id: { [Op.in]: roleIds } },
        attributes: ['id', 'updatedAt', 'deletedAt'],
        paranoid: false
      })
    : [];

  const inlinePolicies = await InlinePolicy.findAll({
    where: { user_id: userId, app_id: { [Op.in]: apps } },
    attributes: ['id', 'updatedAt', 'deletedAt'],
    paranoid: false
  });

  const rows = [
    ...userRoles.map(r => `ur:${r.get('id')}:${normalizeTs(r.get('updatedAt'))}:${normalizeTs(r.get('deletedAt'))}`),
    ...roles.map(r => `role:${r.get('id')}:${normalizeTs(r.get('updatedAt'))}:${normalizeTs(r.get('deletedAt'))}`),
    ...inlinePolicies.map(
      r => `ip:${r.get('id')}:${normalizeTs(r.get('updatedAt'))}:${normalizeTs(r.get('deletedAt'))}`
    )
  ];

  rows.sort();

  return crypto.createHash('sha256').update(rows.join('|')).digest('hex').slice(0, 16);
}

/**
 * 取 perm 命名空间的 store 实例
 *
 * 实例来自 session-store.js（与 session 等共同构成认证 Redis 命名空间全景，
 * 保证 'auth:perm' 只有一处声明）。`getStore` 本身不做实例缓存，这里再包一层
 * 模块级缓存，避免每次权限读取都新建包装对象。
 *
 * @returns {object} perm 命名空间的 store
 */
let cachedStore = null;
function permStore() {
  if (!cachedStore) cachedStore = sharedPermStore;
  return cachedStore;
}

/**
 * 取用户权限，**带指纹校验**
 *
 * 这是权限读取的唯一入口。相比"直接读缓存 TTL 内一律信任"，多了一步指纹比对：
 *
 * ```
 * 1. 算当前数据指纹（查 3 张表的 id/updatedAt，轻量）
 * 2. 读缓存 { fingerprint, roles, permissions }
 * 3. 指纹一致 → 用缓存；不一致/缺失 → 回源 loadUserPermissions + 写回
 * ```
 *
 * 收益：
 * - 权限变更**立即生效**，不必等 TTL 过期（原设计要等会话 TTL，最长 30 天）
 * - 缓存被外部写入篡改 → 指纹对不上 → 下次请求自动重载覆盖（自愈）
 * - 缓存整体丢失 → 指纹缺失 → 回源，行为与原来一致
 *
 * ⚠️ 任何一步异常都**降级为回源加载**，绝不因缓存层故障而拒绝请求或放行。
 *
 * @param {number} userId 用户内部 ID
 * @param {string} appId 应用标识
 * @param {object} [opts={}] 选项
 * @param {boolean} [opts.fresh=false] **强制回源**：跳过缓存直接查库（敏感操作用，第 4 层）
 * @returns {Promise<{roles: string[], permissions: {allows: string[], denies: string[]}}>}
 */
async function getPermissions(userId, appId, opts = {}) {
  const { fresh = false } = opts;
  const store = permStore();
  const key = buildPermKey(userId, appId);

  if (fresh) {
    log.debug('🔐 强制回源加载权限: userId=%s, appId=%s', userId, appId);
    const loaded = await loadUserPermissions(userId, appId);
    // 回源结果顺手刷新缓存（下次可命中），写失败不影响本次返回
    try {
      const fingerprint = await computePermFingerprint(userId, appId);
      await store.set(key, { fingerprint, ...loaded }, PERM_TTL);
    } catch (err) {
      log.warn('[Auth] 强制回源后写缓存失败:', err);
    }
    return loaded;
  }

  let cached = null;
  try {
    cached = await store.get(key);
  } catch (err) {
    log.warn('[Auth] 权限缓存读取失败，回源加载:', err);
  }

  if (cached && cached.fingerprint && cached.roles && cached.permissions) {
    try {
      const current = await computePermFingerprint(userId, appId);
      if (current === cached.fingerprint) {
        log.debug('📦 权限缓存命中（指纹一致）: userId=%s, appId=%s', userId, appId);
        return { roles: cached.roles, permissions: cached.permissions };
      }
      // 指纹不一致 = 权限数据已变更或缓存被篡改 → 丢弃缓存
      log.info('♻️ 权限指纹变化，缓存作废重载: userId=%s, appId=%s', userId, appId);
    } catch (err) {
      log.warn('[Auth] 权限指纹计算失败，回源加载:', err);
    }
  }

  const loaded = await loadUserPermissions(userId, appId);
  try {
    const fingerprint = await computePermFingerprint(userId, appId);
    await store.set(key, { fingerprint, ...loaded }, PERM_TTL);
  } catch (err) {
    log.warn('[Auth] 权限缓存写入失败:', err);
  }
  return loaded;
}

/**
 * 失效指定用户的权限缓存（权限变更后主动调用，让变更立即对所有会话生效）
 *
 * 指纹机制已能在"下次请求时"发现变更；主动删除是**把生效时机提前到变更瞬间**，
 * 不依赖用户下次请求。两者互补：主动删可能漏（如直接改 DB），指纹兜底。
 *
 * @param {number} userId 用户内部 ID
 * @param {string|null} [appId=null] 指定应用；传 null 表示清该用户所有已知应用
 * @returns {Promise<number>} 实际删除的键数量
 */
async function invalidatePermCache(userId, appId = null) {
  const store = permStore();
  const apps = appId ? [appId] : ['GLOBAL'];
  let removed = 0;
  for (const a of apps) {
    try {
      await store.delete(buildPermKey(userId, a));
      removed += 1;
    } catch (err) {
      log.warn('[Auth] 权限缓存失效失败: userId=%s, appId=%s', userId, a, err);
    }
  }
  return removed;
}

/**
 * 预热权限缓存（签发令牌时调用）
 *
 * 把一次 `loadUserPermissions` 的结果连同当前指纹写入缓存，供随后同进程/同 Redis 的
 * 验证侧直接命中。**这是唯一允许从外部触发的写入路径**，键与 TTL 全部由本模块决定，
 * 调用方无法自行拼键 —— 原先 token-issuer 直接 `getStore('perm').set(明文键)`，
 * 与读侧命名空间/键都对不上，预热实际是无效写。
 *
 * 失败不抛错：预热只是省一次 DB 查询，不能影响令牌签发。
 *
 * @param {number} userId 用户内部 ID
 * @param {string} appId 应用标识
 * @returns {Promise<boolean>} 是否写入成功
 */
async function warmPermissions(userId, appId) {
  try {
    const { roles, permissions } = await loadUserPermissions(userId, appId);
    const fingerprint = await computePermFingerprint(userId, appId);
    await permStore().set(buildPermKey(userId, appId), { fingerprint, roles, permissions }, PERM_TTL);
    return true;
  } catch (err) {
    log.warn('[Auth] 权限缓存预热失败: userId=%s, appId=%s', userId, appId, err);
    return false;
  }
}

export {
  PERM_NAMESPACE,
  PERM_TTL,
  buildPermKey,
  computePermFingerprint,
  getPermissions,
  invalidatePermCache,
  normalizeTs,
  warmPermissions
};
