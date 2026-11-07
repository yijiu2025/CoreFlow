import crypto from 'node:crypto';
import { getModel } from '../../../persistence/db/index.js';
import {
  signCookie,
  COOKIE_OPTIONS,
  COOKIE_SID,
  COOKIE_SID_R,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL,
  USER_COOKIE_TTL,
  ROTATED_RETENTION
} from '../context/cookie.js';
import { resolveSessionPermissions } from './session-perm.js';
import {
  sessionStore,
  refreshStore,
  userRefreshStore,
  rotatedStore,
  familyStore,
  userSessionsStore,
  sidHash,
  revokeFamily,
  isSessionUserActive
} from './session-store.js';
// 封禁检查：刷新路径必须拦 login/access 封禁（否则被禁登录用户凭记住我 sid_r
// 无限自动续期，登录封禁形同虚设）。ban.js 只依赖 redis/log/audit，无环。
import { isDisable, BAN_SERVICE_LOGIN, BAN_SERVICE_ACCESS } from '../security/ban.js';
import { runSessionSaga, withSessionTransaction } from './session-saga.js';
import { authSessionConfig } from './session-config.js';
import { createLogger } from '../../../support/log/index.js';

const log = createLogger('framework.auth.session');

/**
 * 刷新会话核心：用 refreshToken 验证 + 轮转新 sid/sid_r。
 * 失败路径不清 cookie，由自动刷新或账号切换调用方决定。
 */
async function refreshSessionCore(refreshToken, request, reply) {
  // 旧 sid_r 再用视为盗用，只吊销对应 family。
  const rotated = await rotatedStore.get(refreshToken);
  if (rotated) {
    request?.log?.warn(
      { familyId: rotated.familyId, userId: rotated.userId },
      '🚨 [Session] sid_r 复用盗用，吊销同 family'
    );
    await revokeFamily(rotated.familyId, rotated.userId);
    return null;
  }

  const oldSessionId = await refreshStore.get(refreshToken);
  const oldSessionData = oldSessionId ? await sessionStore.get(oldSessionId) : null;
  const SessionToken = getModel('SessionToken');
  let record = null;

  if (oldSessionId) {
    record = await SessionToken.findOne({ where: { token: sidHash(oldSessionId), revoked: false } });
  }
  // Redis 未命中时，降级用 refreshToken 哈希查找（兼容旧数据）。
  if (!record) {
    record = await SessionToken.findOne({ where: { token: sidHash(refreshToken), revoked: false } });
  }
  if (!record) return null;

  const User = getModel('User');
  const user = await User.findByPk(record.user_id);
  if (!user) return null;

  let familyId = oldSessionId ? oldSessionData?.familyId : null;
  if (!familyId && record.family_id) familyId = record.family_id;
  if (!familyId) familyId = crypto.randomBytes(16).toString('hex');

  // ── 资格检查（放在 resolveSessionPermissions 之前：被封禁/禁用用户不值得花指纹查询） ──
  // ① 全局硬禁用（status=0）：吊销整个 family（既有行为；isSessionUserActive 对 status
  //    做 Number() 归一——此处原为 `user.status === 0` 严格相等，DB 驱动返回字符串 '0' 时漏拦）
  if (!isSessionUserActive(user)) {
    log.debug('🚫 [Session] 用户已禁用，拒绝刷新并吊销 family: userId=%s', user.id);
    await revokeFamily(familyId, user.id);
    return null;
  }
  // ② login/access 维度封禁：拒绝刷新但**不吊销 family**——login 封禁语义是"只挡新登录，
  //    不动既有会话"；本浏览器刷新失败被清 cookie 即达成目的，其他设备不受牵连
  //    （access 封禁本会在 getSession 请求级拦截，这里提前拦省一次轮转）。
  if ((await isDisable(user.id, BAN_SERVICE_LOGIN)) || (await isDisable(user.id, BAN_SERVICE_ACCESS))) {
    log.warn('🚫 [Session] 用户封禁中，拒绝 sid_r 刷新: userId=%s', user.id);
    return null;
  }

  const { roles, permissions, permFingerprint } = await resolveSessionPermissions(user.id, record.app_id, {
    roles: oldSessionData?.roles,
    permissions: oldSessionData?.permissions,
    permFingerprint: oldSessionData?.permFingerprint
  });

  const newSessionId = crypto.randomBytes(32).toString('hex');
  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  const sessionTtl = LONG_SESSION_TTL;
  const sessionData = {
    userId: user.id,
    uid: user.uid,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    status: user.status,
    appId: record.app_id,
    roles,
    permissions,
    permFingerprint,
    ip: request?.ip || record.ip,
    deviceId: record.device_id,
    // 🔴 基准指纹必须随会话一起写回（2026-11-07 修复）：
    // 漏了这一个字段，刷新后的会话就没有基准 → risk-hooks 传 baselineFingerprint=undefined
    // → detectSessionRisk 命中 `!baselineFingerprint` 分支返回 info/no_baseline →
    // **设备指纹变更检测从此永久失效**（记住我用户每次 30 分钟空闲都会走这条路径重建会话）。
    // 与 createSession（session.js:186）/ DB 恢复（session.js:578）同源：取本行 device_fingerprint。
    deviceFingerprint: record.device_fingerprint || null,
    userAgent: request?.headers?.['user-agent'] || record.user_agent,
    familyId,
    loginAt: Math.floor(record.createdAt.getTime() / 1000),
    lastActiveAt: Math.floor(Date.now() / 1000),
    rememberMe: !!record.remember_me
  };

  // 原子领取旧 sid_r 后执行轮转 Saga。旧凭证只在成功路径失效；
  // 任一步失败都会清除新链并恢复旧链，DB 更新与刷新日志在同一事务提交。
  const userKey = String(user.id);
  const oldRefreshTtl = await refreshStore.ttl(refreshToken);
  const oldSessionTtl = oldSessionId ? await sessionStore.ttl(oldSessionId) : -2;
  let claimedSessionId = null;
  const rotationId = crypto.randomBytes(16).toString('hex');
  const newTokenHash = sidHash(newSessionId);
  const SessionLog = getModel('SessionLog');
  const rotateRecord = transaction =>
    SessionToken.update(
      { token: newTokenHash, family_id: familyId, last_active: new Date() },
      { where: { id: record.id, token: record.token, revoked: false }, transaction }
    ).then(([updated]) => {
      if (updated !== 1) {
        const err = new Error('REFRESH_TOKEN_ALREADY_CONSUMED');
        err.code = 'REFRESH_TOKEN_ALREADY_CONSUMED';
        throw err;
      }
    });

  // Redis 映射已丢失时没有 GETDEL 闸门，先以 DB CAS 领取本轮轮转权。
  // 后续步骤若失败，Saga 最后会用 newTokenHash 条件恢复旧哈希。
  if (!oldSessionId) {
    try {
      await withSessionTransaction(SessionToken, rotateRecord);
    } catch (err) {
      if (err.code === 'REFRESH_TOKEN_ALREADY_CONSUMED') return null;
      throw err;
    }
  }

  const steps = [
    {
      execute: async () => {
        claimedSessionId = await refreshStore.getDel(refreshToken);
        if (claimedSessionId !== oldSessionId) {
          const err = new Error('REFRESH_TOKEN_ALREADY_CONSUMED');
          err.code = 'REFRESH_TOKEN_ALREADY_CONSUMED';
          throw err;
        }
      },
      compensate: async () => {
        if (claimedSessionId) {
          await refreshStore.set(refreshToken, claimedSessionId, oldRefreshTtl > 0 ? oldRefreshTtl : USER_COOKIE_TTL);
        }
      }
    },
    {
      // TTL 取热改值（data/auth_config.json 的 session.rotatedRetentionSeconds），
      // 兜底最小 60 秒防 0/负数导致 Redis TTL 异常
      execute: () =>
        rotatedStore.set(
          refreshToken,
          { familyId, userId: user.id, rotationId },
          Math.max(60, Number(authSessionConfig().rotatedRetentionSeconds) || ROTATED_RETENTION)
        ),
      compensate: async () => {
        const marker = await rotatedStore.get(refreshToken);
        if (marker?.rotationId === rotationId) await rotatedStore.delete(refreshToken);
      }
    },
    {
      execute: () => userRefreshStore.zRem(userKey, [refreshToken]),
      compensate: () => userRefreshStore.zAdd(userKey, Date.now(), refreshToken)
    },
    {
      execute: () => familyStore.zRem(familyId, [refreshToken]),
      compensate: () => familyStore.zAdd(familyId, Date.now(), refreshToken)
    }
  ];

  if (!oldSessionId) {
    steps.unshift({
      execute: async () => {},
      compensate: () =>
        withSessionTransaction(SessionToken, transaction =>
          SessionToken.update(
            { token: record.token, last_active: record.last_active || new Date() },
            { where: { id: record.id, token: newTokenHash, revoked: false }, transaction }
          )
        )
    });
  }

  if (oldSessionId) {
    steps.push(
      {
        execute: () => sessionStore.delete(oldSessionId),
        compensate: async () => {
          if (oldSessionData) {
            await sessionStore.set(oldSessionId, oldSessionData, oldSessionTtl > 0 ? oldSessionTtl : sessionTtl);
          }
        }
      },
      {
        execute: () => userSessionsStore.zRem(userKey, [oldSessionId]),
        compensate: () => userSessionsStore.zAdd(userKey, Date.now(), oldSessionId)
      }
    );
  }

  steps.push(
    {
      execute: () => sessionStore.set(newSessionId, sessionData, sessionTtl),
      compensate: () => sessionStore.delete(newSessionId)
    },
    {
      execute: () => refreshStore.set(newRefreshToken, newSessionId, USER_COOKIE_TTL),
      compensate: () => refreshStore.delete(newRefreshToken)
    },
    {
      execute: async () => {
        await userRefreshStore.zAdd(userKey, Date.now(), newRefreshToken);
        await userRefreshStore.expire(userKey, USER_COOKIE_TTL);
      },
      compensate: () => userRefreshStore.zRem(userKey, [newRefreshToken])
    },
    {
      execute: async () => {
        await familyStore.zAdd(familyId, Date.now(), newRefreshToken);
        await familyStore.expire(familyId, USER_COOKIE_TTL);
      },
      compensate: () => familyStore.zRem(familyId, [newRefreshToken])
    },
    {
      execute: async () => {
        await userSessionsStore.zAdd(userKey, Date.now(), newSessionId);
        await userSessionsStore.expire(userKey, LONG_SESSION_TTL);
      },
      compensate: () => userSessionsStore.zRem(userKey, [newSessionId])
    },
    {
      execute: () =>
        withSessionTransaction(SessionToken, async transaction => {
          // DB 兜底路径已在写 Redis 前完成 CAS；这里只补同事务审计日志。
          if (oldSessionId) await rotateRecord(transaction);
          await SessionLog.create(
            {
              user_id: record.user_id,
              event: 'SESSION_REFRESH',
              app_id: record.app_id,
              ip: record.ip,
              user_agent: record.user_agent,
              details: {
                oldSessionId: oldSessionId || '-',
                newSessionId,
                rotatedRefreshToken: true,
                reason: 'cookie_expired_auto_refresh'
              }
            },
            { transaction }
          );
        })
    }
  );

  try {
    await runSessionSaga(steps, 'refreshSessionCore');
  } catch (err) {
    if (err.code === 'REFRESH_TOKEN_ALREADY_CONSUMED') return null;
    throw err;
  }

  reply.setCookie(COOKIE_SID, signCookie(newSessionId, 0), {
    ...COOKIE_OPTIONS.SID,
    maxAge: sessionTtl
  });
  reply.setCookie(COOKIE_SID_R, signCookie(newRefreshToken, 0), {
    ...COOKIE_OPTIONS.SID_R,
    maxAge: REFRESH_TOKEN_TTL
  });

  return { sessionData, newSessionId, newRefreshToken };
}

export { refreshSessionCore };
