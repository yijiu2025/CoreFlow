/**
 * 用户注销服务层
 *
 * 业务流程：
 * 1. 提交注销申请（scope=app/all）→ 申请后立即拒登录（登录拦截在 login.service.js）
 * 2. 7 天撤销期内：用户登录时提示"有注销申请待处理"，可撤销；撤销后正常登录
 * 3. 7 天到期：管理员执行正式注销（或定时任务自动执行）
 *
 * 正式注销清理范围：
 * - scope=app：清该 app 的 OAuth 授权(approval/consent/token) + 吊销该 app 的 session_tokens + 踢 Redis 该 app session
 * - scope=all：清所有 app 的上述数据 + 软删 user_user（status=-1, delete_version 设置）+ 踢所有 session
 *
 * @author yijiu2025
 * @since 2026-08-23
 */
import { getModel } from '../../../framework/db/index.js';
import { Op } from 'sequelize';
import deactivationDao from '../dao/deactivation.js';
import { DEACTIVATION_SCOPE, DEACTIVATION_STATUS } from '../dao/deactivation.js';

class DeactivationService {
  /**
   * 提交注销申请
   * @param {object} user - 当前登录用户（含 id, uid）
   * @param {object} body - { scope, app_id?, reason? }
   * @returns {Promise<object>} 创建的申请记录
   */
  async applyDeactivation(user, body) {
    const { scope, app_id, reason } = body;
    if (![DEACTIVATION_SCOPE.APP, DEACTIVATION_SCOPE.ALL].includes(scope)) {
      throw new Error('DEACTIVATION_FAILED:scope 必须为 app 或 all');
    }
    if (scope === DEACTIVATION_SCOPE.APP) {
      const valid = await this.validateAppId(app_id);
      if (!valid) throw new Error(`DEACTIVATION_FAILED:应用 ${app_id} 不存在`);
    }

    return deactivationDao.createRequest({
      user_id: user.id,
      uid: user.uid,
      scope,
      app_id: scope === DEACTIVATION_SCOPE.APP ? app_id : null,
      reason
    });
  }

  /**
   * 校验 app_id 是否为系统已注册的应用
   * 从 oauth_clients 表查（scope=app 注销的是 OAuth 授权关系，需 client 存在）
   */
  async validateAppId(appId) {
    if (!appId) return false;
    const OauthClient = getModel('oauth21.OauthClient');
    if (!OauthClient) return false;
    const count = await OauthClient.count({ where: { client_id: appId } });
    return count > 0;
  }

  /**
   * 撤销注销申请（用户自助）
   * @param {number} userId - 当前用户 id
   * @param {number} deactivationId - 申请 id
   */
  async revokeDeactivation(userId, deactivationId) {
    const req = await deactivationDao.findById(deactivationId);
    if (!req) throw new Error('DEACTIVATION_FAILED:注销申请不存在');
    if (req.user_id !== userId) throw new Error('DEACTIVATION_FAILED:无权撤销他人的申请');
    if (req.status !== DEACTIVATION_STATUS.PENDING) {
      throw new Error('DEACTIVATION_FAILED:该申请已处理，无法撤销');
    }
    const affected = await deactivationDao.revoke(deactivationId, userId);
    if (!affected) throw new Error('DEACTIVATION_FAILED:撤销失败，申请可能已被处理');
    return { id: deactivationId, status: DEACTIVATION_STATUS.REVOKED };
  }

  /**
   * 登录流程内撤销（用户在登录弹窗点"撤销"时调用）
   * 不校验 userId 归属（登录流程已验证身份），直接撤销指定申请。
   * @param {number} deactivationId
   * @param {number} userId - 用于 revoked_by 记录
   */
  async forceRevokeForLogin(deactivationId, userId) {
    const affected = await deactivationDao.revoke(deactivationId, userId);
    if (!affected) throw new Error('DEACTIVATION_FAILED:撤销失败，申请可能已被处理');
    return { id: deactivationId, revoked_by: userId };
  }

  /**
   * 查自己的待撤销申请（个人中心展示用）
   */
  async getMyPending(userId) {
    return deactivationDao.findPendingByUser(userId);
  }

  /**
   * 登录时检查是否被注销申请拦截
   * @param {number} userId
   * @param {string} appId - 当前登录的 app
   * @returns {Promise<object|null>} 命中的申请（前端据此弹"是否撤销"）；无则 null
   */
  async checkLoginBlocked(userId, appId) {
    return deactivationDao.findBlockingPending(userId, appId);
  }

  /**
   * 列表查询（管理员用）
   */
  async listForAdmin(query) {
    return deactivationDao.list(query);
  }

  /**
   * 正式执行注销（管理员触发或定时任务触发）
   *
   * @param {number} id - 申请 id
   * @param {object} ctx - { adminUserId?, force? } 管理员执行时填 adminUserId
   * @returns {Promise<object>} 执行结果
   */
  async executeDeactivation(id, ctx = {}) {
    const req = await deactivationDao.findById(id);
    if (!req) throw new Error('DEACTIVATION_FAILED:注销申请不存在');
    if (req.status !== DEACTIVATION_STATUS.PENDING) {
      throw new Error('DEACTIVATION_FAILED:该申请已处理');
    }

    // 非强制执行时，要求已到期
    if (!ctx.force && new Date(req.scheduled_at) > new Date()) {
      throw new Error('DEACTIVATION_FAILED:申请未到期，无法执行（可使用强制执行）');
    }

    let result;
    if (req.scope === DEACTIVATION_SCOPE.APP) {
      result = await this.executeAppDeactivation(req.user_id, req.uid, req.app_id);
    } else {
      result = await this.executeAllDeactivation(req.user_id, req.uid);
    }

    // 标记申请已执行
    await deactivationDao.markExecuted(id);

    return {
      id,
      scope: req.scope,
      app_id: req.app_id,
      executed_at: new Date(),
      detail: result
    };
  }

  /**
   * 执行单个应用注销：清该 app 的 OAuth 授权 + 吊销 session
   */
  async executeAppDeactivation(userId, uid, appId) {
    const result = { oauth_approval: 0, oauth_consents: 0, oauth_tokens: 0, session_tokens: 0 };

    // 1. 删 OAuth 授权关系（oauth_user_approval：sub=uid AND app_id=appId）
    const OauthApproval = getModel('oauth21.OauthApproval');
    if (OauthApproval) {
      result.oauth_approval = await OauthApproval.destroy({ where: { sub: uid, app_id: appId } });
    }

    // 2. 删 OAuth 同意记录（oauth_consents：sub=uid AND client_id=appId）
    const OauthConsent = getModel('oauth21.OauthConsent');
    if (OauthConsent) {
      result.oauth_consents = await OauthConsent.destroy({ where: { sub: uid, client_id: appId } });
    }

    // 3. 吊销 OAuth 刷新令牌（oauth_tokens：sub=uid AND client_id=appId）
    const OauthToken = getModel('oauth21.OauthToken');
    if (OauthToken) {
      result.oauth_tokens = await OauthToken.update(
        { revoked: true },
        { where: { sub: uid, client_id: appId, revoked: false } }
      );
    }

    // 4. 吊销该 app 的 session_tokens + 踢 Redis 该 app 的活跃 session
    result.session_tokens = await this.revokeSessionsByApp(userId, appId);

    return result;
  }

  /**
   * 执行全部数据注销：清所有 app + 软删 user_user + 踢所有 session
   */
  async executeAllDeactivation(userId, uid) {
    const result = { oauth_approval: 0, oauth_consents: 0, oauth_tokens: 0, session_tokens: 0, user_deleted: false };

    // 1. 清所有 OAuth 授权（sub=uid）
    const OauthApproval = getModel('oauth21.OauthApproval');
    if (OauthApproval) {
      result.oauth_approval = await OauthApproval.destroy({ where: { sub: uid } });
    }
    const OauthConsent = getModel('oauth21.OauthConsent');
    if (OauthConsent) {
      result.oauth_consents = await OauthConsent.destroy({ where: { sub: uid } });
    }
    const OauthToken = getModel('oauth21.OauthToken');
    if (OauthToken) {
      const [affected] = await OauthToken.update({ revoked: true }, { where: { sub: uid, revoked: false } });
      result.oauth_tokens = affected || 0;
    }

    // 2. 吊销所有 session_tokens + 踢所有 Redis session
    result.session_tokens = await this.revokeAllSessions(userId);

    // 3. 软删 user_user（status=-1 已注销，配合 delete_version 软删除钩子）
    const User = getModel('User');
    if (User) {
      const user = await User.findByPk(userId);
      if (user) {
        user.status = -1; // 标记已注销
        await user.save(); // 先保存 status
        await user.destroy(); // 软删除（paranoid + delete_version 钩子）
        result.user_deleted = true;
      }
    }

    return result;
  }

  /**
   * 吊销某用户某 app 的所有 session（DB revoke + Redis 踢下线）
   * @returns {Promise<number>} 吊销的 token 数
   */
  async revokeSessionsByApp(userId, appId) {
    const SessionToken = getModel('session.SessionToken');
    if (!SessionToken) return 0;

    // DB: 标记该 app 的 session_tokens 为 revoked
    const [affected] = await SessionToken.update(
      { revoked: true },
      { where: { user_id: userId, app_id: appId, revoked: false } }
    );

    // Redis: 踢该用户该 app 的活跃 session（逆索引遍历 + 按 appId 过滤）
    await this.kickRedisSessionsByApp(userId, appId);
    return affected || 0;
  }

  /**
   * 吊销某用户所有 app 的 session（DB + Redis）
   */
  async revokeAllSessions(userId) {
    const SessionToken = getModel('session.SessionToken');
    if (!SessionToken) return 0;
    const [affected] = await SessionToken.update({ revoked: true }, { where: { user_id: userId, revoked: false } });

    // Redis: 用 session.js 的 kickAllSessions 踢所有
    try {
      const { kickAllSessions } = await import('../../../framework/auth/session.js');
      if (typeof kickAllSessions === 'function') {
        await kickAllSessions(userId);
      }
    } catch (e) {
      console.warn(`⚠️ [Deactivation] Redis 踢所有 session 失败: ${e.message}`);
    }
    return affected || 0;
  }

  /**
   * 踢某用户某 app 的 Redis 活跃 session
   * 遍历用户逆索引（zset）里的所有 sid，按 session 数据里的 appId 过滤后删除
   */
  async kickRedisSessionsByApp(userId, appId) {
    try {
      const { getStore } = await import('../../../framework/redis/index.js');
      const sessionStore = getStore('session', { timeout: 3000 });
      const userSessionsStore = getStore('userSessions', { timeout: 3000 });
      const { deleteRefreshTokensForSession, sidHash } = await import('../../../framework/auth/session.js');
      const SessionToken = getModel('session.SessionToken');
      const SessionLog = getModel('session.SessionLog');

      // 逆索引 zRangeByScore 拿该用户所有 raw sid
      const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
      const hashes = [];
      for (const sid of sids) {
        const sd = await sessionStore.get(sid);
        // 仅删 appId 匹配的 session（不匹配的保留，其他 app 仍可在线）
        if (sd && sd.appId === appId) {
          const familyId = sd.familyId || null;
          await sessionStore.delete(sid);
          await deleteRefreshTokensForSession(userId, sid, familyId);
          hashes.push(sidHash(sid));
        }
      }
      if (hashes.length && SessionToken) {
        await SessionToken.update({ revoked: true }, { where: { token: { [Op.in]: hashes } } });
      }
      if (SessionLog && hashes.length) {
        await SessionLog.create({
          user_id: userId,
          app_id: appId,
          event: 'KICK',
          details: { reason: 'deactivation_app', count: hashes.length }
        });
      }
    } catch (e) {
      console.warn(`⚠️ [Deactivation] 踢 app=${appId} 的 Redis session 失败: ${e.message}`);
    }
  }
}

export default new DeactivationService();
