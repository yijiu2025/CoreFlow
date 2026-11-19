/**
 * 会话令牌的查询与清理（`session_tokens` 的读侧）
 *
 * 为什么单独一层：`api/user/v1/sessions.js` 与 `api/admin/user/v1/sessions.js` 原先
 * 各自 `getModel('SessionToken')`，还各自手写
 * `crypto.createHash('sha256').update(sessionId).digest('hex')` ——
 * 而 `sidHash` 在 `session-store.js` 里被标注为「全模块唯一真源」。
 * 哈希方式一改（比如加盐、换算法），api 层那两处不会报错，只会**静默查不到会话**
 * （表现为"踢不掉"、"认不出当前设备"）。
 *
 * 🔴 依赖方向：只依赖 db 与 `session-store`（后者是全模块最底层、谁都可以 import）。
 *    反过来**不能**被 session-store import，否则成环。
 *    也**不要**在这里自己写 sha256 —— `sidHash` 是唯一真源，复制一份就又回到"两处
 *    各写一遍、改一处静默失效"的老问题。
 *
 * 🔴 这里只做"取数据"，不做权限判定：能不能踢某人的会话是**调用方**的事
 *    （自助接口按当前用户过滤，管理接口按权限码放行）。把判定放进来，
 *    DAO 就会开始依赖会话里的角色信息。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { getModel } from '../../../persistence/db/index.js';
import { sidHash } from './session-store.js';

/**
 * 当前会话的 DB token 哈希
 *
 * 列表接口拿它和行里的 `token` 比对，算出 `is_current`（"这台就是我现在用的"）。
 * 没有 sessionId 时返回 null —— 调用方据此直接判 false，不用自己写三元。
 *
 * @param {string|null} sessionId 会话 ID（cookie 里那个）
 * @returns {string|null} sha256 哈希
 */
function currentTokenHash(sessionId) {
  return sessionId ? sidHash(sessionId) : null;
}

/**
 * 查某个会话是否属于指定用户（且未撤销）
 *
 * 自助踢会话前的**归属校验**：查不到就当作"不存在"，调用方回 404 ——
 * 回 403 等于告诉调用方"这个会话是别人的、确实存在"。
 *
 * @param {string} sessionId 会话 ID
 * @param {number} userId 用户内部 ID
 * @returns {Promise<object|null>} 命中的行（只取 id / token）
 */
async function findOwnedSession(sessionId, userId) {
  const uid = Number(userId);
  if (!sessionId || !Number.isInteger(uid) || uid <= 0) return null;
  const SessionToken = getModel('SessionToken');
  if (!SessionToken) return null;
  return SessionToken.findOne({
    where: { token: sidHash(sessionId), user_id: uid, revoked: false },
    attributes: ['id', 'token'],
    raw: true
  });
}

/**
 * 按行 id 取某用户的设备行
 *
 * 自助踢设备:body 传的是列表里的**行 id**（不是打码后的设备码 ——
 * 拿打码值去和 Redis 里的完整 device_id 比，永远不相等）。
 * `user_id` 必须同时进 where，否则可以用别人的行 id 探测 / 踢设备。
 *
 * @param {number} id 行 id
 * @param {number} userId 用户内部 ID
 * @returns {Promise<object|null>} `{ id, app_id, device_id }`
 */
async function findOwnedDeviceRow(id, userId) {
  const rowId = Number(id);
  const uid = Number(userId);
  if (!Number.isInteger(rowId) || rowId <= 0) return null;
  if (!Number.isInteger(uid) || uid <= 0) return null;
  const SessionToken = getModel('SessionToken');
  if (!SessionToken) return null;
  return SessionToken.findOne({
    where: { id: rowId, user_id: uid },
    attributes: ['id', 'app_id', 'device_id'],
    raw: true
  });
}

/**
 * 自助视角：某用户自己的设备行
 *
 * 与 `listDeviceRows` **刻意不合并**：管理员要 11 个字段（含设备指纹与 updated_at），
 * 自助页只要 8 个（含 token 用来算当前设备）。合成一个带 `attributes` 参数的函数，
 * 就会有人顺手传个空数组或全字段 —— 前者查不出来，后者把指纹也发给用户自己，
 * 都属于"参数化带来的可误用空间"。
 *
 * @param {number} userId 用户内部 ID
 * @returns {Promise<Array<object>>} 原始行（按最后活跃倒序）
 */
async function listUserDeviceRows(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return [];
  const SessionToken = getModel('SessionToken');
  if (!SessionToken) return [];
  return SessionToken.findAll({
    where: { user_id: uid },
    order: [['last_active', 'DESC']],
    attributes: ['id', 'app_id', 'device_id', 'token', 'ip', 'user_agent', 'last_active', 'revoked'],
    raw: true
  });
}

/**
 * 管理员视角：某用户全部设备会话行
 *
 * token 列**会**被取出来（列表要用它算 `is_current`），但调用方必须把它从响应里摘掉 ——
 * 它在下面 `attributes` 里是刻意的，属于"给了就必须用完即弃"的字段。
 *
 * @param {object} params 查询条件
 * @param {number} params.userId 用户内部 ID（数字主键）
 * @param {string} [params.appId] 只看某个应用
 * @param {boolean} [params.revoked] 只看已撤销 / 只看在线的
 * @returns {Promise<Array<object>>} 原始行（按最后活跃倒序）
 */
async function listDeviceRows({ userId, appId, revoked }) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return [];
  const SessionToken = getModel('SessionToken');
  if (!SessionToken) return [];

  const where = { user_id: uid };
  if (appId) where.app_id = appId;
  if (revoked !== undefined) where.revoked = Boolean(revoked);

  return SessionToken.findAll({
    where,
    order: [['last_active', 'DESC']],
    attributes: [
      'id',
      'user_id',
      'app_id',
      'device_id',
      'device_fingerprint',
      'ip',
      'user_agent',
      'last_active',
      'revoked',
      'updated_at',
      'token'
    ],
    raw: true
  });
}

/**
 * 清理某用户已下线的会话记录
 *
 * 🔴 `user_id` 只能来自会话（`request.state.user`），**不接受请求体传值** ——
 *    这是"只能清自己的"这条边界的唯一实现点。
 * 🔴 只删 `revoked = true`：在线会话一条都不能动。
 *
 * @param {number} userId 用户内部 ID
 * @returns {Promise<number>} 删除条数
 */
async function pruneRevokedOfUser(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return 0;
  const SessionToken = getModel('SessionToken');
  if (!SessionToken) return 0;
  return SessionToken.destroy({ where: { user_id: uid, revoked: true } });
}

export {
  currentTokenHash,
  findOwnedSession,
  findOwnedDeviceRow,
  listUserDeviceRows,
  listDeviceRows,
  pruneRevokedOfUser
};
