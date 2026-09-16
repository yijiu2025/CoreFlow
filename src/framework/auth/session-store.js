/**
 * Session 存储底座（framework/auth 会话子模块共享层）
 *
 * 由 session.js 拆分而来（AUDIT-REPORT-2026-09-12.md §2.3 批次 C）。承载**被兄弟模块共享**的
 * 低层资产，使 session.js / session-kick.js / session-governance.js 不必各自重复获取 Redis 实例：
 * - 7 个 `getStore(...)` 实例（session / refresh / user_refresh / refresh_rotated / session_family / user_sessions / auth:perm）
 * - 环境变量常量 `MAX_REFRESH_TOKENS` / `MAX_ACTIVE_DEVICES`
 * - `sidHash`：sessionId → DB token 列哈希，全模块唯一真源（🔴-2 即因它未导出而炸）
 * - `deleteRefreshTokensForSession` / `revokeFamily`：生命周期与踢出两条路径共用的吊销原语
 *
 * 依赖方向：只依赖 cookie/db/redis 等基础设施，**不 import 任何兄弟子模块**，
 * 因此处于子模块依赖图最底层（谁都可以 import 它，它不 import 谁）→ 无环。
 * ⚠️ 这条约束意味着**不能** `import { PERM_NAMESPACE } from './perm-cache.js'`
 * （perm-cache 依赖 permission-loader，会把底座抬到非底层）。故这里把字面量**独立声明一次**，
 * 并有契约测试钉死它与 perm-cache.js 的 `PERM_NAMESPACE` 逐字一致。
 *
 * 日志 tag 沿用 `framework.auth.session`：本次拆分是纯代码组织调整，不改变日志行为。
 *
 * @author yijiu2025
 * @since 2026-09-14
 */

import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { getModel } from '../db/index.js';
import { getStore } from '../redis/index.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.session');

// ── 常量 / Redis 实例 / sidHash / 吊销原语 ──

const MAX_REFRESH_TOKENS = parseInt(process.env.MAX_REFRESH_TOKENS) || 10;
/**
 * 同一用户活跃设备行数上限（session_tokens 表 revoked=false 的行）。
 *
 * x-device-id 头客户端可控，同一用户每次传随机新 deviceId 会绕过
 * findOrCreate(user_id+device_id) 的设备幂等键，无限新增 session_tokens 行 →
 * 设备数统计失真 + DB 膨胀。此上限在 createSession 写 DB 前裁剪最旧行，
 * 只保留最近 N 个活跃设备。默认 20 覆盖正常用户多端场景（手机/电脑/平板/多浏览器）。
 */
const MAX_ACTIVE_DEVICES = parseInt(process.env.MAX_ACTIVE_DEVICES) || 20;

// 统一存储实例（getStore 自动处理 Redis/MapStore、超时、序列化）
const sessionStore = getStore('session');
const refreshStore = getStore('refresh');
const userRefreshStore = getStore('user_refresh');
// sid_r 轮转后旧 refreshToken 的"已轮转"标记（供复用盗用检测），TTL=ROTATED_RETENTION
const rotatedStore = getStore('refresh_rotated');
// family 集合：familyId → zset[refreshToken]，用于盗用检测后只吊销同 family
const familyStore = getStore('session_family');
// 用户会话索引：userId → zset[raw sessionId]，供 kick/单设备互踢按 raw sid 定位 Redis session
// （DB 仅存 sha256(sessionId) 无法反查 raw sid，故用 Redis 逆索引，不暴露 raw sid 到 DB）
const userSessionsStore = getStore('user_sessions');
// 权限缓存的命名空间：与 perm-cache.js 的 PERM_NAMESPACE 必须逐字一致（契约测试钉死）。
// 这里重复声明而非 import，是为了守住本文件的"零兄弟模块依赖"约束（见文件头）。
const PERM_NAMESPACE = 'auth:perm';
// 权限缓存实例（键 = sha256(userId+appId)）：读路径在 perm-cache.js 走"指纹校验 + 回源"，
// **唯一写入方**是 perm-cache.js 自身。此处实例化仅为让本文件保持"认证相关 Redis
// 命名空间全景"的单一出处 —— 命名空间字符串散落就是下一个 'user_sessions' 事故。
const permStore = getStore(PERM_NAMESPACE);

/**
 * sessionId → DB token 列存的哈希（sha256），集中一处避免散落
 *
 * 对外导出：`deactivation.service.js` 注销流程需自行算 token 哈希以 revoke DB 行
 * （AUDIT-REPORT-2026-09-12.md 🔴-2 曾因未导出导致调用方解构到 undefined）。
 *
 * @param {string} sessionId raw sessionId
 * @returns {string} 64 位 hex
 */
function sidHash(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

/**
 * 吊销整个 family（sid_r 盗用检测命中时调用）
 * 删除该 family 下所有 session/refreshToken/轮转标记，并 revoke 对应 DB token
 * @param {string} familyId 会话家族 ID
 * @param {number|null} [userId] 用户 ID（用于清理 user_refresh 索引）
 */
async function revokeFamily(familyId, userId = null) {
  const rts = await familyStore.zRangeByScore(familyId, '-inf', '+inf');
  const SessionToken = getModel('SessionToken');
  const hashes = [];
  for (const rt of rts) {
    const sid = await refreshStore.get(rt);
    if (sid) {
      await sessionStore.delete(sid);
      if (userId != null) await userSessionsStore.zRem(String(userId), [sid]); // 清会话索引
      hashes.push(sidHash(sid));
    }
    await refreshStore.delete(rt);
    await rotatedStore.delete(rt);
    if (userId != null) await userRefreshStore.zRem(String(userId), [rt]);
  }
  // DB 兜底：按 rt 链路吊销之外，再按 family_id 列吊销该链名下所有行——
  // 覆盖 familyStore zset 条目丢失（Redis 故障）但行还在的场景。
  // family_id 与登录链一一对应（每次 re-login 换新值），不会误伤其他链的行。
  try {
    await SessionToken.update({ revoked: true }, { where: { family_id: familyId } });
  } catch (err) {
    log.warn('[Session] revokeFamily 按 family_id 吊销失败:', err);
  }
  if (hashes.length) {
    await SessionToken.update({ revoked: true }, { where: { token: { [Op.in]: hashes } } });
  }
  await familyStore.delete(familyId);
}

/**
 * 删除指定 session 对应的所有 refreshToken（取消"记住我"/登出时调用）
 * 遍历用户 refresh 索引，删除映射到本 sessionId 的 refreshToken + 清理 family 集合
 * @param {number} userId 用户 ID
 * @param {string} sessionId 会话 ID
 * @param {string|null} [familyId] 会话家族 ID（用于清理 family 集合）
 */
async function deleteRefreshTokensForSession(userId, sessionId, familyId = null) {
  const rts = await userRefreshStore.zRangeByScore(String(userId), '-inf', '+inf');
  for (const rt of rts) {
    if ((await refreshStore.get(rt)) === sessionId) {
      await refreshStore.delete(rt);
      await userRefreshStore.zRem(String(userId), [rt]);
      if (familyId) await familyStore.zRem(familyId, [rt]);
    }
  }
}

export {
  MAX_REFRESH_TOKENS,
  MAX_ACTIVE_DEVICES,
  sessionStore,
  refreshStore,
  userRefreshStore,
  rotatedStore,
  familyStore,
  userSessionsStore,
  PERM_NAMESPACE,
  permStore,
  sidHash,
  deleteRefreshTokensForSession,
  revokeFamily
};
