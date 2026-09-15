/**
 * Session 踢出 / 吊销（framework/auth 会话子模块）
 *
 * 由 session.js 拆分而来（AUDIT-REPORT-2026-09-12.md §2.3 批次 C）。
 * 收录所有「让已存在的会话立刻失效」的入口：
 *
 * | 入口 | 粒度 | 典型场景 |
 * | ---- | ---- | -------- |
 * | `kickByDeviceType` | 用户 + 应用 + 设备类型 | 单设备单登录：新登录踢掉同类型旧会话 |
 * | `kickByDeviceId`   | 用户 + 应用 + 设备 ID   | 管理端远程踢指定设备（精准，不误伤同类型其它设备） |
 * | `kickSession`      | 单个 sessionId          | 踢某一条会话 |
 * | `kickAllSessions`  | 用户全部会话            | 改密 / 注销等强制全端下线 |
 * | `kickUser`         | 用户（可按 app 过滤）   | 管理员踢人 |
 *
 * 各入口的 Redis 侧清理动作完全同构，统一收敛到 `_revokeOneSession()`（🔵-3）；
 * 差异只在「筛谁」与「DB revoke / 日志的粒度」，故保留在各自入口。
 *
 * 依赖方向：只依赖 `./session-store.js` 与 `./device.js`，**不 import session.js**——
 * 生命周期模块反向依赖本模块（createSession → kickByDeviceType），单向故无环。
 *
 * 日志 tag 沿用 `framework.auth.session`（纯代码组织拆分，不改变日志行为）。
 *
 * @author yijiu2025
 * @since 2026-09-14
 */

import { Op } from 'sequelize';
import { getModel } from '../db/index.js';
import { DEVICE_TYPE } from './device.js';
import { sessionStore, userSessionsStore, sidHash, deleteRefreshTokensForSession } from './session-store.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.session');

/**
 * 吊销单条 session 的 Redis 侧状态（踢出/吊销路径的公共原语）
 *
 * 统一「删 Redis session → 失效 sid_r（删 refreshToken 映射 + 清 family）→ 清 user_sessions 逆索引」，
 * 并返回该 sid 的 DB token 哈希供调用方 revoke。
 *
 * **本函数不写 SessionLog、不 revoke DB**——两者的粒度因调用方而异，刻意留在各入口：
 * - `_kickSession` / `kickSession`：单条，逐条 revoke + 逐条写日志
 * - `kickAllSessions` / `kickUser`：批量，收集 hashes 后一次 `Op.in` revoke + 一条汇总日志
 * 只把「必然重复的 Redis 侧动作」收敛到本函数（AUDIT-REPORT-2026-09-12.md 🔵-3）。
 *
 * 与拆分前的行为一致性：原 `_kickSession` 对 userId 非空的情况无条件执行这两步，
 * 原 `kickSession` 则在 `userId != null` 时才执行——本函数的 `userId != null` 守卫
 * 覆盖两种语义（所有调用方传 userId 时等价）。
 *
 * @param {number|null} userId 用户 ID（null 时跳过需要用户维度的索引/刷新令牌清理）
 * @param {string} sid raw sessionId（user_sessions 索引里的值）
 * @param {object|undefined|null} sd 该 sid 的 Redis session 数据（含 familyId）；取不到时传 null
 * @returns {Promise<string>} sha256(sid)，供 `SessionToken.update({ where: { token } })`
 */
async function _revokeOneSession(userId, sid, sd) {
  const familyId = sd?.familyId || null;
  await sessionStore.delete(sid);
  if (userId != null) {
    await deleteRefreshTokensForSession(userId, sid, familyId);
    await userSessionsStore.zRem(String(userId), [sid]);
  }
  // 所有踢出/吊销路径都经此处，故统一在这唯一落点留痕（debug 级：默认不输出，
  // 排障开 LOG_DEBUG 即可看到「哪条 session 被谁踢掉」——拆分前 6 条路径都无日志）
  log.debug('🔒 [Session] 吊销会话: userId=%s, sid=%s, familyId=%s', userId, sid, familyId);
  return sidHash(sid);
}

// ── 踢出 / 吊销入口 ──

/**
 * 踢单条 session 的公共逻辑
 *
 * 删 Redis session + 失效 sid_r + DB 标记 revoked + 清 user_sessions 索引 + 写 SessionLog。
 * 供 kickByDeviceType / kickByDeviceId / kickUser 等复用，保证踢出路径一致。
 *
 * @param {number} userId 用户 ID
 * @param {string} sid raw sessionId（user_sessions 索引里的值）
 * @param {object} sd 该 sid 的 Redis session 数据（含 familyId/deviceId/deviceType/appId）
 * @param {string} appId 归属应用（写日志用）
 * @param {object} logDetails SessionLog.details 额外字段
 */
async function _kickSession(userId, sid, sd, appId, logDetails) {
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');
  const tokenHash = await _revokeOneSession(userId, sid, sd);
  await SessionToken.update({ revoked: true }, { where: { token: tokenHash } });
  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    app_id: appId,
    details: { ...logDetails, kickedSessionId: sid }
  });
}

/**
 * 踢掉同设备类型的旧会话（单设备单登录，按 deviceType 粗粒度批量踢）
 * @param {number} userId 用户 ID
 * @param {string} appId 应用 ID
 * @param {string} deviceType 设备类型
 */
async function kickByDeviceType(userId, appId, deviceType) {
  const target = deviceType || DEVICE_TYPE.BROWSER;
  const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
  for (const sid of sids) {
    const sd = await sessionStore.get(sid);
    if (!sd) {
      await userSessionsStore.zRem(String(userId), [sid]);
      continue;
    }
    if (sd.appId === appId && (sd.deviceType || DEVICE_TYPE.BROWSER) === target) {
      await _kickSession(userId, sid, sd, appId, { reason: 'single_device_login', deviceType: target });
    }
  }
}

/**
 * 按 device_id 精准踢单设备会话
 *
 * 区别于 kickByDeviceType（按设备类型批量踢，同类型多设备会误踢），
 * 本函数只踢 user_id+device_id 指定的那台设备，用于"管理端远程踢单设备"等场景。
 * session_tokens 有 device_id 索引，但 DB 只存 sha256(sid) 无法反查 raw sid，
 * 故仍走 user_sessions 逆索引遍历，按 sd.deviceId 精确匹配。
 *
 * @param {number} userId 用户 ID
 * @param {string} appId 应用 ID
 * @param {string} deviceId 设备 ID（结构化 WEB-... 形式）
 * @returns {number} 踢出的会话数
 */
async function kickByDeviceId(userId, appId, deviceId) {
  if (!deviceId) return 0;
  let kicked = 0;
  const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
  for (const sid of sids) {
    const sd = await sessionStore.get(sid);
    if (!sd) {
      await userSessionsStore.zRem(String(userId), [sid]);
      continue;
    }
    if (sd.appId === appId && sd.deviceId === deviceId) {
      await _kickSession(userId, sid, sd, appId, { reason: 'kick_by_device_id', deviceId });
      kicked++;
    }
  }
  return kicked;
}

/**
 * 踢掉指定会话
 *
 * 完整踢出（含记住我用户）：删 sid（立即失效）+ 失效 sid_r（阻止 sid_r 自动刷新恢复）
 * + DB revoke（兜底，refreshSession DB 降级也找不到）+ 清用户会话索引。
 * @param {string} sessionId 要踢掉的会话 ID（raw sid）
 * @param {number} userId 操作者用户 ID
 */
async function kickSession(sessionId, userId) {
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');

  // 先读 session 取 familyId（删 Redis 前读取），用于清理该 session 的 sid_r
  const sd = await sessionStore.get(sessionId);

  // 1-3. 删 sid（立即生效，下个请求 401）+ 失效 sid_r（防记住我用户靠 sid_r 自动恢复）
  //      + 清用户会话逆索引：统一走 _revokeOneSession，与其它踢出路径清理集合完全一致
  const tokenHash = await _revokeOneSession(userId, sessionId, sd);

  // 4. DB revoke（兜底：refreshSession DB 降级也找不到未撤销 token）
  await SessionToken.update({ revoked: true }, { where: { token: tokenHash } });

  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    details: { reason: 'user_kicked', kickedSessionId: sessionId }
  });
}

/**
 * 踢掉用户所有会话（含记住我：sid + sid_r + DB 全清）
 * @param {number} userId 用户 ID
 */
async function kickAllSessions(userId) {
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');

  // 用逆索引遍历 raw sid：删 Redis session + 失效 sid_r + DB revoke + 清索引
  const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
  const hashes = [];
  for (const sid of sids) {
    const sd = await sessionStore.get(sid);
    // 逐个吊销 Redis 侧；DB revoke 收集 hashes 后一次批量提交（原实现同样如此，避免 N 次 UPDATE）
    hashes.push(await _revokeOneSession(userId, sid, sd));
  }
  if (hashes.length) {
    await SessionToken.update({ revoked: true }, { where: { token: { [Op.in]: hashes } } });
  }

  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    details: { reason: 'kick_all', count: sids.length }
  });
}

/**
 * 踢用户下线 (管理员操作)
 * @param {number} userId 用户 ID
 * @param {string|null} appId 指定应用 (null = 全部应用)
 */
async function kickUser(userId, appId = null) {
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');

  // 用逆索引遍历 raw sid；按 appId 过滤（null=全部应用）
  const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
  const hashes = [];
  let kicked = 0;
  for (const sid of sids) {
    const sd = await sessionStore.get(sid);
    if (appId) {
      if (!sd) {
        await userSessionsStore.zRem(String(userId), [sid]);
        continue;
      }
      if (sd.appId !== appId) continue;
    }
    // 逐个吊销 Redis 侧；DB revoke 收集 hashes 后一次批量提交（避免 N 次 UPDATE）
    hashes.push(await _revokeOneSession(userId, sid, sd));
    kicked++;
  }
  if (hashes.length) {
    await SessionToken.update({ revoked: true }, { where: { token: { [Op.in]: hashes } } });
  }

  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    app_id: appId || 'ALL',
    details: { kickedCount: kicked }
  });
}

export { kickByDeviceType, kickByDeviceId, kickSession, kickAllSessions, kickUser };
