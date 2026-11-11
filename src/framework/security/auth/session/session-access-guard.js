/**
 * 会话的「应用级访问撤销」标记
 *
 * 解决的问题：`scope=app` 的注销执行时，DB 里的 session_tokens 会被 revoke，但 Redis 里
 * 的活跃会话要靠一次网络调用删掉。删失败（Redis 不可用）时，那个会话会一直活到自己的
 * TTL（记住我场景最长 30 天）—— 而**用户本身仍是正常的**（scope=app 不动主账号），
 * 所以 `isSessionUserActive` 拦不住它。这是唯一一个"注销了但还能用"的真实缺口。
 *
 * 做法：注销生效时写一个**带 TTL 的标记**，会话读取时顺带看一眼 ——
 * 命中即吊销该会话。窗口从"直到会话 TTL"缩到"下一个请求"。
 *
 * 为什么用带 TTL 的 Redis 键而不是查库：
 * - 这是每个请求都要过的地方，不能加 DB 查询；
 * - 撤销窗口结束时标记自然过期，不需要谁来清理（注销本身也是一次性动作，没有"恢复"语义：
 *   真要重新授权，用户重新走一次 OAuth 即可，那时不该再被拦）。
 *
 * 失败语义：**读失败放行（fail-open）**，只记 warn。理由是这一层是"补漏"而不是主闸门
 * （主闸门是 DB 侧的 token revoke + 登录拦截）；Redis 抖动时把所有人挡在门外，
 * 代价远大于漏掉一次补漏。写失败同理只记错误，不影响注销本身。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { getStore } from '../../../persistence/redis/index.js';
import { LONG_SESSION_TTL } from '../context/cookie.js';
import { createLogger } from '../../../support/log/index.js';

const log = createLogger('framework.auth.session-access-guard');

/** 命名空间：与应用会话数据分开，便于运维单独观察/清理 */
const STORE_NAMESPACE = 'deact_app';

/** 懒加载：模块导入时不碰 Redis（测试与无 Redis 部署都能正常 import） */
let cachedStore = null;

/**
 * 取标记存储（懒加载）
 *
 * @returns {object} 带 get/set/del 的 store
 */
function deactStore() {
  if (!cachedStore) cachedStore = getStore(STORE_NAMESPACE, { timeout: 3000 });
  return cachedStore;
}

/**
 * 标记键
 *
 * 用**数字主键**而不是 uid：会话数据（`session.userId`）里就是数字 id，
 * 会话读取时能直接拼，不必多做一次 uuid 反查。
 *
 * @param {number} userId 用户 ID
 * @param {string} appId 应用标识
 * @returns {string} key
 */
function keyOf(userId, appId) {
  return `${Number(userId)}:${String(appId)}`;
}

/**
 * 写入「该用户在此应用的访问已撤销」
 *
 * 幂等：重复调用只是刷新 TTL（执行与申请两个时机都会写）。
 *
 * @param {number} userId 用户 ID
 * @param {string} appId 应用标识
 * @param {number} [ttlSeconds] 有效期（缺省 = 长期会话时长，覆盖"记住我"的最坏情况）
 * @param {object} [store] 注入的存储（测试用）
 * @returns {Promise<boolean>} 是否写入成功
 */
async function markAppAccessRevoked(userId, appId, ttlSeconds = LONG_SESSION_TTL, store) {
  if (!userId || !appId) return false;
  try {
    await (store || deactStore()).set(keyOf(userId, appId), '1', Number(ttlSeconds) || LONG_SESSION_TTL);
    return true;
  } catch (err) {
    // 写失败不影响注销本身：DB 侧 token 已 revoke，这里只是把窗口再缩短一层
    log.error('⚠️ [AccessGuard] 写入应用撤销标记失败（%s/%s）: %s', userId, appId, err?.message || err);
    return false;
  }
}

/**
 * 清除「该用户在此应用的访问已撤销」（撤销注销时）
 *
 * @param {number} userId 用户 ID
 * @param {string} appId 应用标识
 * @param {object} [store] 注入的存储（测试用）
 * @returns {Promise<void>}
 */
async function clearAppAccessRevoked(userId, appId, store) {
  if (!userId || !appId) return;
  try {
    await (store || deactStore()).del(keyOf(userId, appId));
  } catch (err) {
    log.warn('⚠️ [AccessGuard] 清除应用撤销标记失败（%s/%s）: %s', userId, appId, err?.message || err);
  }
}

/**
 * 该用户在此应用的访问是否已被撤销
 *
 * @param {number} userId 用户 ID
 * @param {string} appId 应用标识
 * @param {object} [store] 注入的存储（测试用）
 * @returns {Promise<boolean>} true = 已撤销（会话应被吊销）
 */
async function isAppAccessRevoked(userId, appId, store) {
  if (!userId || !appId) return false;
  try {
    return Boolean(await (store || deactStore()).get(keyOf(userId, appId)));
  } catch (err) {
    // fail-open：这一层是补漏，不是主闸门；Redis 抖动不该把所有人挡在门外
    log.warn('⚠️ [AccessGuard] 读取应用撤销标记失败，本次放行: %s', err?.message || err);
    return false;
  }
}

export { markAppAccessRevoked, clearAppAccessRevoked, isAppAccessRevoked };
