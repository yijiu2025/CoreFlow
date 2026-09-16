/**
 * 会话权限解析（framework/auth 子模块）
 *
 * 由 session.js 拆出 —— 后者触及 1000 行硬限
 * （`src/__tests__/framework/auth/auth-contract.test.js` 的 fullstack-rules 约束）。
 *
 * 职责单一：回答"这个会话现在该用哪份权限"，
 * 即**第 3 层防御（权限指纹）在会话路径上的落地点**。
 *
 * ## 它解决什么
 *
 * 会话的 `permissions` 原本是一份**无失效机制的快照**：写进 Redis session 后，
 * 在整个会话 TTL 内（记住我可达 30 天）再无人校验。管理员撤销权限后，
 * 用户仍能拿旧权限继续访问，直到会话自然过期 —— 这是**功能缺陷**，不是攻击面。
 *
 * ## 它怎么做
 *
 * 会话里随权限一起存 `permFingerprint`（三张权限表的 `(id, updatedAt, deletedAt)` 摘要）：
 * - 指纹一致 → 权限未变，沿用会话副本
 * - 指纹不一致 / 会话里没存指纹（老会话）→ 回源重载并返回新指纹
 *
 * ## 边界
 *
 * ⚠️ 这不是性能优化。指纹查询本身就覆盖 3 张表，省下的只是一次
 *    `loadUserPermissions`。它换来的是**正确性**：会话不再是无失效机制的权限快照。
 * ⚠️ 指纹计算失败时**保守回源**：宁可多查一次库，不可沿用可能过期的权限。
 * ⚠️ 本模块只依赖 perm-cache（不依赖 session-store），故处于会话子模块依赖图的
 *    较底层，不会与 session.js 形成环。
 *
 * @author yijiu2025
 * @since 2026-09-16
 */

import { getPermissions, computePermFingerprint } from './perm-cache.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.session');

/**
 * 解析会话恢复时应采用的权限（第 3 层：权限指纹校验）
 *
 * @param {number} userId 用户内部 ID
 * @param {string} appId 应用标识
 * @param {{roles?: string[], permissions?: object, permFingerprint?: string}} [session] 会话副本
 *   （可为 Redis session，或正在构造中的 sessionData）
 * @returns {Promise<{roles: string[], permissions: object, permFingerprint: string}>} 本次会话应采用的权限
 */
async function resolveSessionPermissions(userId, appId, session = {}) {
  const cachedRoles = session?.roles;
  const cachedPerms = session?.permissions;
  const cachedFp = session?.permFingerprint;

  // 会话没存指纹（老会话 / 字段被裁）→ 无法判断新鲜度，直接回源
  if (!cachedFp || !cachedRoles || !cachedPerms) {
    const { roles, permissions } = await getPermissions(userId, appId);
    const permFingerprint = await computePermFingerprint(userId, appId);
    return { roles, permissions, permFingerprint };
  }

  try {
    const current = await computePermFingerprint(userId, appId);
    if (current === cachedFp) {
      return { roles: cachedRoles, permissions: cachedPerms, permFingerprint: cachedFp };
    }
    log.info(
      '♻️ [Session] 权限已变更（指纹 %s → %s），会话权限作废重载: userId=%s, appId=%s',
      cachedFp,
      current,
      userId,
      appId
    );
  } catch (err) {
    log.warn('[Session] 权限指纹计算失败，保守回源: userId=%s, appId=%s', userId, appId, err);
  }

  const { roles, permissions } = await getPermissions(userId, appId);
  let permFingerprint = cachedFp;
  try {
    permFingerprint = await computePermFingerprint(userId, appId);
  } catch {
    // 取不到新指纹就保留旧值：下次恢复仍会判定不一致而回源（保守方向）
  }
  return { roles, permissions, permFingerprint };
}

export { resolveSessionPermissions };
