/**
 * Session 管理器（会话生命周期）
 *
 * 负责会话的创建、验证、刷新、切换、销毁与安全基准维护。
 * 所有 Redis 操作统一通过 getStore 管理（自带超时、序列化、降级）。
 *
 * 子模块拆分后，本文件负责会话生命周期；权限恢复见 session-perm.js，公开导出保持兼容。
 * @author yijiu2025
 * @since 2026-08-17
 */

import crypto from 'node:crypto';
import { getModel } from '../db/index.js';
import {
  signCookie,
  verifyCookie,
  COOKIE_OPTIONS,
  COOKIE_SID,
  COOKIE_SID_R,
  SHORT_SESSION_TTL,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL,
  USER_COOKIE_TTL
} from './cookie.js';
// 权限读取统一走带指纹校验的缓存入口（见 perm-cache.js 头部说明），
// 不再直接调 loadUserPermissions —— 后者无失效机制，会让会话长 TTL 掩盖权限变更。
import { getPermissions, computePermFingerprint } from './perm-cache.js';
// 会话恢复时的权限解析（第 3 层指纹在会话路径的落地点），已拆为独立子模块
import { resolveSessionPermissions } from './session-perm.js';
// 设备类型常量与判定统一由 device.js 提供，此处导入为本地绑定并在文件末尾 re-export
import { DEVICE_TYPE, detectDeviceType, computeDeviceFingerprint } from './device.js';
import { createLogger } from '../log/index.js';
// 共享底座（Redis 实例 / 常量 / sidHash / 吊销原语）
import {
  sessionStore,
  refreshStore,
  userRefreshStore,
  rotatedStore,
  familyStore,
  userSessionsStore,
  MAX_REFRESH_TOKENS,
  sidHash,
  deleteRefreshTokensForSession,
  getSessionUser,
  isSessionUserActive,
  revokeDisabledSession
} from './session-store.js';
// 兄弟子模块：createSession 需查配额并踢旧会话
import { checkMaxSessions, pruneActiveDevices } from './session-governance.js';
import { kickByDeviceType } from './session-kick.js';
import { refreshSessionCore } from './session-refresh.js';
import { runSessionSaga, withSessionTransaction } from './session-saga.js';

const log = createLogger('framework.auth.session');

// ── 会话生命周期 ──

/**
 * 创建会话
 * @param {object} params
 * @param {number} params.userId 用户内部 ID
 * @param {string} params.uid 用户 UUID
 * @param {string} params.username 用户名
 * @param {string} params.email 邮箱
 * @param {string} params.avatar 头像
 * @param {number} params.status 用户状态
 * @param {string} params.appId 登录的应用 ID
 * @param {string} params.ip 客户端 IP
 * @param {string} params.deviceId 设备标识
 * @param {string} params.deviceType 设备类型（browser/app/desktop/miniapp/api）
 * @param {string} params.userAgent User-Agent
 * @param {boolean} params.rememberMe 是否长期登录
 * @param {boolean} [params.multiDevice=false] 是否允许多设备登录，true=不踢旧会话，false=同设备类型只允许一个
 * @param {import('fastify').FastifyReply} params.reply Fastify Reply 对象
 * @returns {Promise<{sessionId: string, refreshToken: string|null, familyId: string}>} 会话标识与刷新令牌
 */
async function createSession(params) {
  const {
    userId,
    uid,
    username,
    email,
    avatar,
    status,
    appId,
    ip,
    deviceId,
    deviceType,
    userAgent,
    rememberMe,
    reply
  } = params;

  // 1. 并发会话限制：检查是否超限（不自动踢人，由调用方处理）
  const maxSessionsResult = await checkMaxSessions(userId, appId);
  if (maxSessionsResult) {
    const err = new Error('MAX_SESSIONS_EXCEEDED');
    err.code = 'MAX_SESSIONS_EXCEEDED';
    err.sessions = maxSessionsResult.sessions;
    err.maxSessions = maxSessionsResult.maxSessions;
    throw err;
  }

  // 2. 单设备单登录：踢掉同用户同应用同设备类型的旧会话
  // multiDevice=true 时允许多设备登录，不踢旧会话
  if (!params.multiDevice) {
    await kickByDeviceType(userId, appId, deviceType || DEVICE_TYPE.BROWSER);
  }

  // 2. 加载该用户在该应用的角色和权限
  //
  //    同时取回 permFingerprint 随会话一起落库（Redis session / DB）。
  //    会话恢复（Redis 驱逐重建 / sid_r 刷新）时用它做**增量回源判断**：
  //    指纹未变则沿用会话里的权限，避免每次恢复都打 3 张权限表。
  const { roles, permissions } = await getPermissions(userId, appId);
  const permFingerprint = await computePermFingerprint(userId, appId);

  // 2. 生成 sessionId、refreshToken、familyId
  // familyId 标识同一登录链，供 sid_r 轮转盗用检测后只吊销同 family（不影响该用户其他设备）
  const sessionId = crypto.randomBytes(32).toString('hex');
  const refreshToken = rememberMe ? crypto.randomBytes(32).toString('hex') : null;
  const familyId = crypto.randomBytes(16).toString('hex');

  // 复合设备指纹（device_id + UA + uid，绑定设备+账号）
  // 既写入 Redis session（访问风险检测基准，零 DB 查询），也写入 session_tokens 表（持久备份）
  const deviceFingerprint = computeDeviceFingerprint({
    deviceId,
    userAgent,
    uid,
    platformHint: '' // UA 已含足够信息，platformHint 可选
  });

  // 3. 构造 session 数据
  //    deviceFingerprint 作为访问时风险检测的基准（device_id + UA + uid 算出的复合指纹）
  //    写入 Redis session，访问时 getSession 直接取，避免每次请求查 session_tokens 表
  const sessionData = {
    userId,
    uid,
    username,
    email,
    avatar,
    status,
    appId,
    roles,
    permissions,
    // 权限指纹：会话恢复时比对，不一致即丢会话权限走回源（见 resolveSessionPermissions）
    permFingerprint,
    ip,
    deviceId,
    deviceFingerprint, // 基准指纹，访问时比对当前请求算出的指纹
    deviceType: deviceType || DEVICE_TYPE.BROWSER,
    userAgent,
    familyId,
    loginAt: Math.floor(Date.now() / 1000),
    lastActiveAt: Math.floor(Date.now() / 1000),
    rememberMe: !!rememberMe
  };

  // 4-5. Redis Saga + DB 事务。DB 永远是最后一步：任何 DB 失败都会回滚整笔事务，
  // 并逆序清理已写入的 Redis 凭证，不再留下可被 sid/sid_r 使用的孤儿会话。
  const sessionTtl = rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
  const UserSession = getModel('UserSession');
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');
  const tokenHash = sidHash(sessionId);
  const userKey = String(userId);
  const steps = [
    {
      execute: () => sessionStore.set(sessionId, sessionData, sessionTtl),
      compensate: () => sessionStore.delete(sessionId)
    },
    {
      execute: async () => {
        await userSessionsStore.zAdd(userKey, Date.now(), sessionId);
        await userSessionsStore.expire(userKey, LONG_SESSION_TTL);
      },
      compensate: () => userSessionsStore.zRem(userKey, [sessionId])
    }
  ];

  if (refreshToken) {
    // 清理超出限制的旧 refresh token。新凭证的唯一键已生成，后续 Saga 不会误删旧链。
    const count = await userRefreshStore.zCard(userKey);
    if (count >= MAX_REFRESH_TOKENS) {
      const removeCount = count - MAX_REFRESH_TOKENS + 1;
      const oldTokens = await userRefreshStore.zRangeByScore(userKey, '-inf', '+inf', {
        LIMIT: { offset: 0, count: removeCount }
      });
      for (const oldRt of oldTokens) {
        const oldSessionId = await refreshStore.get(oldRt);
        if (oldSessionId) await sessionStore.delete(oldSessionId);
        await refreshStore.delete(oldRt);
      }
      await userRefreshStore.zRem(userKey, oldTokens);
    }

    steps.push(
      {
        execute: () => refreshStore.set(refreshToken, sessionId, USER_COOKIE_TTL),
        compensate: () => refreshStore.delete(refreshToken)
      },
      {
        execute: async () => {
          await userRefreshStore.zAdd(userKey, Date.now(), refreshToken);
          await userRefreshStore.expire(userKey, USER_COOKIE_TTL);
        },
        compensate: () => userRefreshStore.zRem(userKey, [refreshToken])
      },
      {
        execute: async () => {
          await familyStore.zAdd(familyId, Date.now(), refreshToken);
          await familyStore.expire(familyId, USER_COOKIE_TTL);
        },
        compensate: () => familyStore.zRem(familyId, [refreshToken])
      }
    );
  }

  steps.push({
    execute: () =>
      withSessionTransaction(SessionToken, async transaction => {
        await UserSession.upsert(
          {
            user_id: userId,
            last_login_at: new Date(),
            last_login_ip: ip,
            last_login_app: appId,
            last_active_at: new Date()
          },
          { transaction }
        );

        const tokenValues = {
          app_id: appId,
          device_id: deviceId,
          family_id: familyId,
          device_fingerprint: deviceFingerprint,
          token: tokenHash,
          ip,
          user_agent: userAgent,
          last_active: new Date(),
          revoked: false,
          remember_me: rememberMe
        };

        if (deviceId) {
          try {
            const [tokenRow, created] = await SessionToken.findOrCreate({
              where: { user_id: userId, app_id: appId, device_id: deviceId },
              defaults: { ...tokenValues, device_id_original: deviceId },
              transaction
            });
            if (!created) {
              await tokenRow.update(tokenValues, { transaction });
            } else {
              await pruneActiveDevices(userId, { transaction });
            }
          } catch (err) {
            log.warn('[Session] upsert token 失败，在同一事务内回退 destroy+create:', err);
            await SessionToken.destroy({
              where: { user_id: userId, app_id: appId, device_id: deviceId, revoked: false },
              transaction
            });
            await SessionToken.create(
              { user_id: userId, ...tokenValues, device_id_original: deviceId },
              { transaction }
            );
          }
        } else {
          await SessionToken.create({ user_id: userId, ...tokenValues }, { transaction });
          await pruneActiveDevices(userId, { transaction });
        }

        await SessionLog.create(
          {
            user_id: userId,
            event: 'LOGIN',
            app_id: appId,
            ip,
            user_agent: userAgent,
            details: {
              rememberMe,
              deviceId,
              deviceType: deviceType || DEVICE_TYPE.BROWSER
            }
          },
          { transaction }
        );
      })
  });

  await runSessionSaga(steps, 'createSession');

  // 6. 下发 Cookie（accessCount 从 0 开始）
  const sidValue = signCookie(sessionId, 0);
  reply.setCookie(COOKIE_SID, sidValue, {
    ...COOKIE_OPTIONS.SID,
    maxAge: sessionTtl
  });

  if (refreshToken && rememberMe) {
    const sidRValue = signCookie(refreshToken, 0);
    reply.setCookie(COOKIE_SID_R, sidRValue, {
      ...COOKIE_OPTIONS.SID_R,
      maxAge: REFRESH_TOKEN_TTL
    });
  }

  return { sessionId, refreshToken, familyId };
}

/**
 * 从请求中验证并获取会话数据
 * @param {object} params
 * @param {object} params.cookies 请求的 cookies
 * @returns {object|null} 会话数据或 null
 */
async function getSession(params) {
  const { cookies, reply } = params;

  // 1. 解析 sid cookie
  const sidCookie = cookies[COOKIE_SID];
  if (!sidCookie) return null;

  const parsed = verifyCookie(sidCookie);
  if (!parsed) {
    log.debug('❌ sid Cookie 签名验证失败');
    // 清失效 sid cookie，防下次请求携带坏 cookie 反复 401
    if (reply) reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    return null;
  }

  const { sessionId, accessCount } = parsed;
  log.debug('📋 sid 解析成功: sessionId=%s, accessCount=%s', sessionId, accessCount);

  // 3. Redis 查询
  log.debug('📋 Redis 查询 session: %s', sessionId);
  const raw = await sessionStore.get(sessionId);
  log.debug('📋 Redis 查询 raw: %s', raw);
  if (raw) {
    log.debug('✅ Redis 命中: userId=%s, username=%s', raw.userId, raw.username);

    // Redis 里的 status 是登录时快照；当前状态走共享短缓存，未命中才查 User 表。
    let currentUser;
    try {
      currentUser = await getSessionUser(raw.userId, raw.uid);
    } catch (err) {
      log.warn('[Session] 用户状态校验失败，拒绝本次认证: userId=%s', raw.userId, err);
      return null;
    }
    if (!isSessionUserActive(currentUser)) {
      log.warn('[Session] 用户已禁用或注销，吊销会话: userId=%s', raw.userId);
      await revokeDisabledSession(sessionId, raw);
      if (reply) {
        reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
        reply.clearCookie(COOKIE_SID_R, { ...COOKIE_OPTIONS.SID_R });
      }
      return null;
    }

    let session = raw;
    try {
      const resolved = await resolveSessionPermissions(raw.userId, raw.appId, raw);
      if (resolved.permFingerprint !== raw.permFingerprint) {
        session = { ...raw, ...resolved };
        await sessionStore.set(sessionId, session, raw.rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL);
        log.info('♻️ [Session] 已就地刷新会话权限: userId=%s, appId=%s', raw.userId, raw.appId);
      }
    } catch (err) {
      // 无法证明快照仍有效时 fail-closed，尤其不得使用已自然到期的角色权限。
      log.warn('[Session] 会话权限校验失败，拒绝本次认证: userId=%s', raw.userId, err);
      return null;
    }

    // 续期 + 重新签名 cookie（带 app 隔离的 path）
    const ttl = session.rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
    await sessionStore.expire(sessionId, ttl);
    if (reply) {
      const newSidValue = signCookie(sessionId, accessCount + 1);
      reply.setCookie(COOKIE_SID, newSidValue, {
        ...COOKIE_OPTIONS.SID,
        maxAge: ttl
      });
    }
    log.debug('📋 Session 续期: TTL=%ss', ttl);
    return { ...session, sessionId, accessCount: accessCount + 1 };
  }
  log.debug('❌ Redis 未命中，降级到 DB');

  // 4. Redis 未命中，降级到 DB
  const tokenHash = crypto.createHash('sha256').update(sessionId).digest('hex');
  const SessionToken = getModel('SessionToken');
  const User = getModel('User');

  const token = await SessionToken.findOne({
    where: { token: tokenHash, revoked: false },
    include: [{ model: User, as: 'user', required: true }]
  });

  if (!token) {
    // DB 无有效 token（已 revoked/删除）→ 清 sid cookie 防带失效 sid
    if (reply) reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    return null;
  }

  const user = token.user;
  if (!isSessionUserActive(user)) {
    log.warn('[Session] DB 恢复命中禁用或注销用户，吊销会话: userId=%s', token.user_id);
    await revokeDisabledSession(sessionId, {
      userId: token.user_id,
      familyId: token.family_id,
      token
    });
    if (reply) {
      reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
      reply.clearCookie(COOKIE_SID_R, { ...COOKIE_OPTIONS.SID_R });
    }
    return null;
  }

  // TTL 以 last_active 为锚点（行会幂等复用）；超 LONG 吊销，记住我超 SHORT 交 sid_r，其余超 SHORT 拒绝。
  const isRemember = !!token.remember_me;
  const lastActiveMs = token.last_active ? token.last_active.getTime() : token.createdAt.getTime();
  const shortExpiresAt = lastActiveMs + SHORT_SESSION_TTL * 1000;
  const longExpiresAt = lastActiveMs + LONG_SESSION_TTL * 1000;

  if (Date.now() > longExpiresAt) {
    log.debug('❌ Session 已超过长期 TTL（最近活跃 %s），标记 revoked 并拒绝', token.last_active?.toISOString());
    await token.update({ revoked: true });
    if (reply) reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    return null;
  }

  if (Date.now() > shortExpiresAt) {
    if (isRemember) {
      // 记住我：短期过长期未过，清 sid 交 sid_r 刷新恢复（sid_r 仍在）
      log.debug(
        '⏭️ 记住我会话 Redis 未命中且超短期 TTL（最近活跃 %s），清 sid 交 sid_r 刷新恢复',
        token.last_active?.toISOString()
      );
    } else {
      // 非记住我：短期已过，sid 本就该过期，无 sid_r 可恢复，清 cookie 让前端重登
      log.debug(
        '⏹️ 非记住我会话超短期 TTL（最近活跃 %s），sid 已失效，清 cookie 让前端重登',
        token.last_active?.toISOString()
      );
    }
    if (reply) reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    return null;
  }

  // 短期 TTL 内：重建 Redis 缓存（容灾：Redis 主动驱逐后从 DB 恢复）
  // 权限走指纹校验：会话里若存过指纹且仍一致则沿用，变更过则回源重载
  const { roles, permissions, permFingerprint } = await resolveSessionPermissions(user.id, token.app_id, {
    roles: token.sessionRoles,
    permissions: token.sessionPermissions,
    permFingerprint: token.sessionPermFingerprint
  });

  // 指纹基准直接取本行 device_fingerprint（createSession 写入、updateSessionBaseline 维护）。
  // 行按 (user_id, device_id) 幂等复用，这里命中的就是本会话自己的行，
  // 不需要再按 device_id 查"最新一条"（多一次 DB 查询且可能命中 revoked 旧重复行）。
  // 查不到（极老行）时为 null，detectSessionRisk 走 no_baseline 降级 info 放行。
  const deviceFingerprint = token.device_fingerprint || null;

  const sessionData = {
    userId: user.id,
    uid: user.uid,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    status: user.status,
    appId: token.app_id,
    roles,
    permissions,
    permFingerprint,
    ip: token.ip,
    deviceId: token.device_id,
    familyId: token.family_id || null, // 从 DB 回读登录链标识（防孤儿化，见 refreshSessionCore）
    deviceFingerprint, // 降级补的指纹基准（查不到时为 null，detectSessionRisk 走 info 降级）
    userAgent: token.user_agent,
    loginAt: Math.floor(token.createdAt.getTime() / 1000),
    lastActiveAt: Math.floor(Date.now() / 1000),
    rememberMe: isRemember // 用 DB 存的 remember_me 真值（而非硬编码 false）
  };

  // 重建 TTL 用真值：记住我=长期，非记住我=短期
  const rebuildTtl = isRemember ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
  await sessionStore.set(sessionId, sessionData, rebuildTtl);

  // 重新签名 cookie（带 app 隔离的 path）
  if (reply) {
    const newSidValue = signCookie(sessionId, 0);
    reply.setCookie(COOKIE_SID, newSidValue, {
      ...COOKIE_OPTIONS.SID,
      maxAge: rebuildTtl
    });
  }

  return { ...sessionData, sessionId };
}

/**
 * 刷新会话 (sid 过期时用 sid_r 自动续期)
 * @param {object} params
 * @param {object} params.cookies 请求的 cookies
 * @param {import('fastify').FastifyReply} params.reply Fastify Reply 对象
 * @param {import('fastify').FastifyRequest} [params.request]
 * @returns {Promise<object|null>} 新的会话数据或 null
 */
async function refreshSession({ cookies, reply, request }) {
  // 1. 解析 sid_r cookie
  const sidRCookie = cookies[COOKIE_SID_R];
  if (!sidRCookie) return null;

  const parsed = verifyCookie(sidRCookie);
  if (!parsed) return null;

  const refreshToken = parsed.sessionId; // sid_r cookie 中存储的 payload 是 refreshToken

  const result = await refreshSessionCore(refreshToken, request, reply);
  if (!result) {
    // 刷新失败：清 sid/sid_r cookie 强制重新登录
    reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    reply.clearCookie(COOKIE_SID_R, { ...COOKIE_OPTIONS.SID_R });
    return null;
  }
  return { ...result.sessionData, sessionId: result.newSessionId };
}

/**
 * 用指定 refreshToken 免密切换账号（抖音式）
 *
 * refreshToken 来自前端 localStorage（多账号免切凭证，登录时 bind-session 响应返回），
 * 非 cookie（单 sid cookie 模型下浏览器只存当前账号的 sid_r）。
 * 复用 refreshSessionCore：验证 refreshToken + 轮转新 sid/sid_r。
 *
 * 成功后旧 refreshToken 标记 rotated 失效，调用方必须用返回的新 sessionId/newRefreshToken
 * 更新注册表，否则下次切换会触发盗用检测吊销整个 family。
 *
 * @param {string} refreshToken - 注册表存储的目标账号 refreshToken
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<{sessionId: string, refreshToken: string, user: object} | null>}
 *   null=refreshToken 已轮转/被吊销/用户禁用
 */
async function switchSessionByRefreshToken(refreshToken, request, reply) {
  const result = await refreshSessionCore(refreshToken, request, reply);
  if (!result) return null;
  const { sessionData, newSessionId, newRefreshToken } = result;
  return {
    sessionId: newSessionId,
    refreshToken: newRefreshToken,
    user: {
      id: sessionData.userId,
      uid: sessionData.uid,
      username: sessionData.username,
      name: sessionData.username,
      email: sessionData.email,
      avatar: sessionData.avatar
    }
  };
}

/**
 * 动态切换当前会话的"记住我"状态（update-remember-me 路由调用）
 * - 开启：session TTL→长期，新增长期 refreshToken（入 family）
 * - 关闭：session TTL→30min，删除该 session 的所有 refreshToken
 * Redis 与 cookie 由本函数 + 调用方分别负责：本函数管 Redis，调用方管 cookie
 * @param {number} userId 用户 ID
 * @param {string} sessionId 会话 ID
 * @param {boolean} rememberMe 是否长期登录
 * @returns {Promise<{refreshToken: string|null}>} 开启时返回新 refreshToken（供设 sid_r cookie）
 */
async function updateRememberMe(userId, sessionId, rememberMe) {
  const sessionData = await sessionStore.get(sessionId);
  if (!sessionData) {
    // 控制流判据用 err.code 而非 message（调用方 session-api.service.js 判 code）——
    // message 是给人看的文案，改文案不应影响分支判定（AUDIT-REPORT-2026-09-12.md 🟡-2；
    // 批次 B 只改了 message 未落 code，导致 401 分支永不命中、退化成 500，本次补齐）
    const err = new Error('会话已失效，请重新登录');
    err.code = 'SESSION_NOT_FOUND';
    throw err;
  }
  const familyId = sessionData.familyId || crypto.randomBytes(16).toString('hex');
  sessionData.familyId = familyId;
  sessionData.rememberMe = !!rememberMe;

  // 同步 DB session_tokens 的 remember_me + family_id（按 token=sha256(sessionId) 定位行）
  // 与 updateSessionBaseline 同模式：用 token 锚定，不按 device_id（防 device_id 变更后误定位）。
  // family_id：sessionData 缺失时新建的链标识（DB 重建旧数据）也落库，后续轮转不再孤儿化
  const SessionToken = getModel('SessionToken');
  if (SessionToken) {
    try {
      await SessionToken.update(
        { remember_me: !!rememberMe, family_id: familyId },
        { where: { user_id: userId, token: sidHash(sessionId) } }
      );
    } catch (err) {
      log.warn('[Session] 同步 DB remember_me/family_id 失败:', err);
    }
  }

  if (rememberMe) {
    // 缓存转长期
    await sessionStore.set(sessionId, sessionData, LONG_SESSION_TTL);
    // 新增长期 refresh token（入 family）
    const refreshToken = crypto.randomBytes(32).toString('hex');
    await refreshStore.set(refreshToken, sessionId, USER_COOKIE_TTL);
    await userRefreshStore.zAdd(String(userId), Date.now(), refreshToken);
    await userRefreshStore.expire(String(userId), USER_COOKIE_TTL);
    await familyStore.zAdd(familyId, Date.now(), refreshToken);
    await familyStore.expire(familyId, USER_COOKIE_TTL);
    return { refreshToken };
  }

  // 关闭：缓存转 30min + 删长期 refresh
  await sessionStore.set(sessionId, sessionData, SHORT_SESSION_TTL);
  await deleteRefreshTokensForSession(userId, sessionId, familyId);
  return { refreshToken: null };
}

/**
 * 销毁会话 (登出)
 * @param {object} params
 * @param {string} params.sessionId 会话 ID
 * @param {number} params.userId 用户 ID (用于日志)
 * @param {string} params.appId 应用 ID (用于日志)
 * @param {string} params.ip 客户端 IP
 * @param {import('fastify').FastifyReply} params.reply Fastify Reply 对象
 */
async function destroySession(params) {
  const { sessionId, userId, appId, ip, reply } = params;

  // 1. 删 Redis session + 用户会话索引（当前会话立即失效）
  if (sessionId) {
    await sessionStore.delete(sessionId);
    if (userId != null) await userSessionsStore.zRem(String(userId), [sessionId]);
  }

  // 2. 清 sid + sid_r cookie（彻底结束当前登录态，sid_r 没了 → 前端 401 无法自动 refresh-session 恢复）
  //    注意：不删 refreshToken 映射、不 revoke DB token——保留供前端 localStorage 凭证
  //    主动调 /switch-account 免密切换（refreshToken 是 localStorage 持有的，非 cookie）
  reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
  reply.clearCookie(COOKIE_SID_R, { ...COOKIE_OPTIONS.SID_R });

  // 3. 记录日志
  const SessionLog = getModel('SessionLog');
  await SessionLog.create({
    user_id: userId,
    event: 'LOGOUT',
    app_id: appId,
    ip
  });
}

/**
 * 彻底撤销某账号的记住我凭证（"忘掉该账号"用）
 *
 * 与 destroySession 的软退出相反：删 refreshToken 映射 + family + rotated 标记 + DB revoke token +
 * 清 Redis session。前端 localStorage 持有 refreshToken（多账号凭证），移除账号时前端把
 * 对应 refreshToken 发来，后端据此反查 sessionId/userId/familyId 全套撤销。
 *
 * @param {string} refreshToken - 前端持有的目标账号 refreshToken
 */
async function revokeRememberMe(refreshToken) {
  if (!refreshToken) return;
  const SessionToken = getModel('SessionToken');

  // 1. refreshToken → oldSessionId → session data（userId/familyId）
  const oldSessionId = await refreshStore.get(refreshToken);
  let userId = null;
  let familyId = null;
  if (oldSessionId) {
    const sd = await sessionStore.get(oldSessionId);
    userId = sd?.userId ?? null;
    familyId = sd?.familyId ?? null;
  }

  // 2. 删 refreshToken 映射 + family 集合 + 轮转标记
  await refreshStore.delete(refreshToken);
  if (userId != null) await userRefreshStore.zRem(String(userId), [refreshToken]);
  await rotatedStore.delete(refreshToken);
  if (familyId) await familyStore.zRem(familyId, [refreshToken]);

  // 3. 删 Redis session + 清用户会话索引 + DB revoke token
  if (oldSessionId) {
    await sessionStore.delete(oldSessionId);
    if (userId != null) await userSessionsStore.zRem(String(userId), [oldSessionId]);
    const tokenHash = crypto.createHash('sha256').update(oldSessionId).digest('hex');
    await SessionToken.update({ revoked: true }, { where: { token: tokenHash } });
  }
}

/**
 * 更新会话基准（人机验证通过后调用）
 *
 * 用户在新环境（换设备/UA/IP）完成验证后，把当前请求的新基准写回 Redis session 数据 + DB session_tokens，
 * 后续请求不再报"指纹变了"。
 *
 * @param {string} sessionId - 会话 ID（request.state.user.sessionId）
 * @param {object} newBaseline - { deviceId, deviceFingerprint, ip, userAgent }
 */
async function updateSessionBaseline(sessionId, { deviceId, deviceFingerprint, ip, userAgent }) {
  if (!sessionId) return false;
  const sd = await sessionStore.get(sessionId);
  if (!sd) return false;

  // 记录旧 deviceId：判断是否变更用（变更时 DB 行 device_id 也要更新，避免 orphan）
  const oldDeviceId = sd.deviceId;

  // 更新基准字段
  if (deviceId !== undefined) sd.deviceId = deviceId;
  if (deviceFingerprint !== undefined) sd.deviceFingerprint = deviceFingerprint;
  if (ip !== undefined) sd.ip = ip;
  if (userAgent !== undefined) sd.userAgent = userAgent;
  sd.lastActiveAt = Math.floor(Date.now() / 1000);

  // 写回 Redis（保留原 TTL）
  const sessionTtl = sd.rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
  await sessionStore.set(sessionId, sd, sessionTtl);

  // 同步 DB session_tokens：按 token(=sha256(sessionId)) 定位行，device_id 也一并更新
  // 注意：必须按 token 定位而非 device_id —— 此刻 sd.deviceId 已被上方改成新值，
  // 按 device_id 查会找不到旧行（旧行 device_id 是旧值）→ device_id 永不更新 → orphan。
  // token 与 session 绑定（sid_r 刷新时 record.update({token:newHash}) 换 token 但行不变），
  // 是同一设备链的稳定锚点。device_id 变更场景（用户清 localStorage 生新 ID，验证通过后）
  // 由此把 DB 行 device_id 更新为新值，不新增行（符合"同一设备链更新不新增"语义）。
  // 键名统一 'SessionToken'（点号写法的命名空间前缀不参与 getModel 查找，见 🔵-4）
  const SessionToken = getModel('SessionToken');
  if (SessionToken && sd.userId) {
    try {
      const tokenHash = sidHash(sessionId);
      const updateFields = { last_active: new Date() };
      if (deviceFingerprint !== undefined) updateFields.device_fingerprint = deviceFingerprint;
      if (ip !== undefined) updateFields.ip = ip;
      if (userAgent !== undefined) updateFields.user_agent = userAgent;
      if (deviceId !== undefined && deviceId && deviceId !== oldDeviceId) {
        // deviceId 变更（用户清 localStorage 生新 ID，验证通过后）：旧行 device_id 更新为新值
        // 同一 session 链（token 锚定），不新增行，避免旧 device_id orphan
        // 注意：device_id_original（首次登录原始身份）永不更新，仅审计/恢复兜底用
        updateFields.device_id = deviceId;
      }
      await SessionToken.update(updateFields, {
        where: { user_id: sd.userId, token: tokenHash }
      });
    } catch (err) {
      log.warn('[Session] 更新 session_tokens 基准失败:', err);
    }
  }
  return true;
}

/**
 * 按当前会话查询 DB 中的设备身份（访问时恢复用）
 *
 * 仅在「header + cookie 都无法提供有效设备 ID」的罕见分支被调用
 * （device_id cookie 被单独逐出/拒绝 + localStorage 被清，但 sid 会话还活着），
 * 常规请求不产生额外 DB 查询。
 *
 * 恢复目标优先级：
 *   1. device_id（当前值，与 Redis/DB 风险基准指纹同源——恢复它才能保证指纹比对不误报）
 *   2. device_id_original（首次登录原始 ID，device_id 为空时的兜底锚点）
 *
 * @param {string} sessionId 原始会话 ID（request.state.user.sessionId）
 * @returns {Promise<{deviceId: string, originalDeviceId: string, userAgent: string}|null>}
 */
async function getSessionTokenDevice(sessionId) {
  if (!sessionId) return null;
  try {
    // getModel 必须在 try 内：未命中时它**抛 TypeError** 而非返回假值，
    // 故不再写 `if (!SessionToken) return null` 这种永不触发的死守卫。
    // （键名统一 'SessionToken'，点号写法的命名空间前缀不参与查找 —— 见 🔵-4）
    const SessionToken = getModel('SessionToken');
    const row = await SessionToken.findOne({
      where: { token: sidHash(sessionId), revoked: false },
      attributes: ['device_id', 'device_id_original', 'user_agent']
    });
    if (!row) return null;
    return {
      deviceId: row.device_id || '',
      originalDeviceId: row.device_id_original || '',
      userAgent: row.user_agent || ''
    };
  } catch (err) {
    log.warn('[Session] 查询 session_tokens 设备身份失败:', err);
    return null;
  }
}

// ── 对外导出 ──
// 24 项，与拆分前逐字一致（契约测试 auth-contract.test.js 守护）。
// 被拆出去的符号必须用**带来源子句**的跨模块 re-export 写法——裸 `export { x }`
// 只能导出**本模块的本地绑定**，跨模块写会报 `Export 'x' is not defined in module`。
export {
  // 生命周期（本文件定义）
  createSession,
  getSession,
  refreshSession,
  refreshSessionCore,
  switchSessionByRefreshToken,
  destroySession,
  revokeRememberMe,
  updateRememberMe,
  updateSessionBaseline,
  getSessionTokenDevice,
  // 设备类型透传（自 ./device.js 导入的本地绑定，原 session.js 即如此对外暴露）
  DEVICE_TYPE,
  detectDeviceType
};

// 共享底座（./session-store.js）
export { sidHash, deleteRefreshTokensForSession } from './session-store.js';

// 治理/统计（./session-governance.js）
export {
  checkMaxSessions,
  pruneActiveDevices,
  pruneStaleSessionTokens,
  getSessionStats,
  getLoginTrend,
  logLoginFailure
} from './session-governance.js';

// 踢出/吊销（./session-kick.js）
export { kickSession, kickAllSessions, kickByDeviceId, kickUser } from './session-kick.js';
