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
import { getModel, sequelize } from '../../../framework/persistence/db/index.js';
import { Op } from 'sequelize';
import deactivationDao from '../dao/deactivation.js';
import { DEACTIVATION_SCOPE, DEACTIVATION_STATUS } from '../dao/deactivation.js';
import { createLogger } from '../../../framework/support/log/index.js';

const log = createLogger('app.user.services.deactivation.service');

/**
 * 应用私有"账号数据"模型（按 user_id 持有）
 *
 * 注销时这些必须清：它们是账号在该应用里的注册产物（偏好、API Key），
 * 留着等于"账号注销了，但它的密钥还在库里"。
 *
 * 业务内容（作品 / 任务 / 收藏）**不在这里** —— 见 `APP_CONTENT_MODELS`。
 */
const APP_SETTINGS_MODELS = {
  retroweb: ['retroweb.UserSettings', 'retroweb.LlmProfile'],
  posecraft: ['posecraft.UserSettings']
};

/**
 * 业务内容模型（注销时**不清**，仅在结果里回报）
 *
 * 判断依据：这些是用户产出的内容，不是"账号凭证"。清掉不可逆，而它们通常还被
 * 别人引用（分享 / 协作 / 复现），删除账号不该连带毁掉别人的引用。
 * 需要连内容一起清时，由对应应用自己提供清理钩子，而不是在通用注销流程里硬删。
 */
const APP_CONTENT_MODELS = [
  'posecraft.Work',
  'posecraft.Template',
  'posecraft.UserCollect',
  'posecraft.UserLike',
  'posecraft.UserHistory',
  'retroweb.Task',
  'retroweb.Scheme',
  'retroweb.Job'
];

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
   * 管理员发起的注销（后台"删除用户" / "注销某应用"）
   *
   * 与用户自助的区别只有三点，但都很重要：
   * - 记发起人（`requested_by` + 账号快照）—— 本仓最高危的写操作，审计必须能回答"谁点的"；
   * - 撤销期天数由调用方（后台配置）决定，而不是写死 7 天；
   * - 不校验"是不是本人"，改由调用方做职级/范围判定（见 `console/services/user-danger.service.js`）。
   *
   * @param {object} params 参数
   * @param {object} params.target 目标用户（{ id, uid, username }）
   * @param {'all'|'app'} params.scope 注销范围
   * @param {string} [params.appId] scope=app 时必填
   * @param {object} params.actor 发起人（{ id, username }）
   * @param {number} [params.graceDays] 撤销期天数
   * @param {string} [params.reason] 原因
   * @returns {Promise<object>} 创建的申请
   */
  async createAdminRequest({ target, scope, appId, actor, graceDays, reason }) {
    if (![DEACTIVATION_SCOPE.APP, DEACTIVATION_SCOPE.ALL].includes(scope)) {
      throw new Error('DEACTIVATION_FAILED:scope 必须为 app 或 all');
    }
    if (scope === DEACTIVATION_SCOPE.APP) {
      const valid = await this.validateAppId(appId);
      if (!valid) throw new Error(`DEACTIVATION_FAILED:应用 ${appId} 不存在或未注册`);
    }
    return deactivationDao.createRequest({
      user_id: Number(target.id),
      uid: target.uid,
      scope,
      app_id: scope === DEACTIVATION_SCOPE.APP ? appId : null,
      reason,
      requestedBy: actor?.id ?? null,
      requestedByName: actor?.username ?? null,
      graceDays
    });
  }

  /**
   * 撤销某条注销申请（管理员）
   *
   * 只允许撤销 PENDING：已执行的申请撤销没有意义（数据已经清了）。
   *
   * @param {number} userId 目标用户（用于校验归属）
   * @param {number} requestId 申请 ID
   * @param {object} actor 操作人（{ id }）
   * @returns {Promise<object>} 结果
   */
  async cancelRequest(userId, requestId, actor) {
    const req = await deactivationDao.findById(requestId);
    if (!req) throw new Error('NOT_FOUND:注销申请不存在');
    if (Number(req.user_id) !== Number(userId)) throw new Error('INVALID_PARAM:该申请不属于此用户');
    if (Number(req.status) !== DEACTIVATION_STATUS.PENDING) {
      throw new Error('CONFLICT:该申请已撤销或已执行，无法再撤销');
    }
    const affected = await deactivationDao.revoke(requestId, actor?.id ?? null);
    if (!affected) throw new Error('CONFLICT:撤销失败，申请状态已变更');
    return { id: Number(requestId), status: DEACTIVATION_STATUS.REVOKED };
  }

  /**
   * 某用户的活跃注销申请（含发起人）
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<Array<object>>} 申请列表
   */
  async listPending(userId) {
    const rows = await deactivationDao.findPendingByUser(userId);
    return rows.map(row => ({
      id: Number(row.id),
      scope: row.scope,
      app_id: row.app_id,
      reason: row.reason,
      requested_at: row.requested_at,
      scheduled_at: row.scheduled_at,
      requested_by: row.requested_by === null ? null : Number(row.requested_by),
      requested_by_name: row.requested_by_name
    }));
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
    const result = { oauth_approval: 0, oauth_consents: 0, oauth_tokens: 0, session_tokens: 0, app_settings: 0 };

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

    // 5. 清该应用的账号数据（偏好设置 / API Key）。业务内容不清，见 APP_CONTENT_MODELS
    result.app_settings = await this.purgeAppSettings(userId, [appId]);

    return result;
  }

  /**
   * 执行全部数据注销：清所有 app + 软删 user_user + 踢所有 session
   */
  async executeAllDeactivation(userId, uid) {
    const result = {
      oauth_approval: 0,
      oauth_consents: 0,
      oauth_tokens: 0,
      session_tokens: 0,
      user_deleted: false,
      account: { user_roles: 0, inline_policies: 0, user_posts: 0, temp_passwords: 0, app_settings: 0 },
      /** 未清理的业务内容（回报给调用方，界面要如实告知） */
      retained: APP_CONTENT_MODELS.slice()
    };

    // 🔴 破坏性多表写入必须在一个事务内：此前无事务，中途失败会留下「半注销」状态
    //（OAuth 已清、identity 已删、user 未软删 → 用户还能登录部分应用但数据不完整）。
    await sequelize.transaction(async transaction => {
      // 1. 清所有 OAuth 授权（sub=uid）
      const OauthApproval = getModel('oauth21.OauthApproval');
      if (OauthApproval) {
        result.oauth_approval = await OauthApproval.destroy({ where: { sub: uid }, transaction });
      }
      const OauthConsent = getModel('oauth21.OauthConsent');
      if (OauthConsent) {
        result.oauth_consents = await OauthConsent.destroy({ where: { sub: uid }, transaction });
      }
      const OauthToken = getModel('oauth21.OauthToken');
      if (OauthToken) {
        const [affected] = await OauthToken.update(
          { revoked: true },
          { where: { sub: uid, revoked: false }, transaction }
        );
        result.oauth_tokens = affected || 0;
      }

      // 2. 软删 user_user（status=-1 已注销，配合 delete_version 软删除钩子）
      const User = getModel('User');
      if (User) {
        // 先显式软删 user_identity：Sequelize 的 hasMany 关联级联软删（hooks:true）
        // 只在 user.destroy 预加载 include 时才触发，此处未 include，级联不跑，
        // user_identity 会遗留（deleted_at=null/delete_version=0），其唯一索引
        // uk_identity_type_identifier=(identity_type,identifier,delete_version)
        // 占着 (password,email,0) 坑 → 邮箱无法重新注册（ER_DUP_ENTRY 被翻译成"邮箱已存在"）。
        // 逐条 instance.destroy 触发 beforeDestroy 钩子写 delete_version=id，释放唯一索引。
        //
        // 🔴 2026-11-11 起**先抹掉 PII 再软删**：
        // 框架的软删除钩子禁止硬删 paranoid 模型（softDeleteHooks 会抛错），而软删本身
        // 会把「identifier（邮箱 / 账号名）+ credential（密码哈希）」原样留在行里 ——
        // 账号都注销了，这两列没有任何保留价值，留着就是泄露面。
        // 所以：identifier 改成不可反解的占位串、credential 置空，再软删释放唯一索引。
        // （要彻底删行只能绕过钩子写裸 SQL —— 那等于和框架约定对着干，不值得。）
        const UserIdentity = getModel('UserIdentity');
        if (UserIdentity) {
          const identities = await UserIdentity.findAll({ where: { user_id: userId }, transaction });
          for (const id of identities) {
            id.identifier = `purged:${id.id}`;
            id.credential = null;
            id.failed_attempts = 0;
            id.locked_until = null;
            await id.save({ transaction });
            await id.destroy({ transaction });
          }
        }

        // 3. 清账号与授权类数据（角色 / 内联策略 / 岗位 / 临时密码 / 应用偏好）
        result.account = await this.purgeAccountScoped(userId, transaction);

        const user = await User.findByPk(userId, { transaction });
        if (user) {
          /*
           * 主表**不硬删**，但要抹掉个人身份信息：
           *
           * 硬删会让审计（audit_logs.user_id）、授权流水、注销申请里的引用变成悬空 ——
           * 排查"这个账号当年被谁删的"就断了。所以保留行本身，把 PII 清成不可识别的值：
           * username（NOT NULL）改成带 id 的占位名，邮箱 / 手机号 / 头像清空。
           * 唯一索引按 (username, delete_version) 建，软删后 delete_version=id，
           * 不影响同名重新注册。
           */
          user.status = -1; // 标记已注销
          user.username = `已注销用户#${userId}`;
          user.email = null;
          user.phone = null;
          user.avatar = null;
          await user.save({ transaction });
          await user.destroy({ transaction }); // 软删除（paranoid + delete_version 钩子）
          result.user_deleted = true;
        }
      }
    });

    // 3. 事务提交成功后再吊销所有 session（DB revoke + Redis 踢下线）。
    // Redis 无法回滚，故放在事务外；revoke 幂等，失败只记日志不阻断注销。
    result.session_tokens = await this.revokeAllSessions(userId);

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
      const { kickAllSessions } = await import('../../../framework/security/auth/index.js');
      if (typeof kickAllSessions === 'function') {
        await kickAllSessions(userId);
      }
    } catch (e) {
      // error：踢下线失败意味着注销后用户仍持有有效会话，有安全后果
      log.error('⚠️ [Deactivation] Redis 踢所有 session 失败', e);
    }
    return affected || 0;
  }

  /**
   * 踢某用户某 app 的 Redis 活跃 session
   * 遍历用户逆索引（zset）里的所有 sid，按 session 数据里的 appId 过滤后删除
   */
  async kickRedisSessionsByApp(userId, appId) {
    try {
      const { getStore } = await import('../../../framework/persistence/redis/index.js');
      const sessionStore = getStore('session', { timeout: 3000 });
      // 命名空间必须与 session.js 的 userSessionsStore 逐字一致（'user_sessions'）。
      // 曾写成驼峰 'userSessions'，getStore 按 prefix 隔离命名空间 → 读到空 zset →
      // 下方 for 循环零次执行、注销清理静默失效（AUDIT-REPORT-2026-09-12.md 🔴-3）。
      const userSessionsStore = getStore('user_sessions', { timeout: 3000 });
      const { deleteRefreshTokensForSession, sidHash } = await import('../../../framework/security/auth/index.js');
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
      // error：同上，注销后对应 app 的会话仍在，有安全后果
      log.error(`⚠️ [Deactivation] 踢 app=${appId} 的 Redis session 失败`, e);
    }
  }

  /**
   * 清账号与授权类数据（全部注销）
   *
   * 为什么必须补这一段：原实现只清了 OAuth + 凭证 + 会话 + 用户主表。于是注销后
   * 库里还留着这个人的**角色关联、内联策略、岗位、临时密码、各应用偏好与 API Key** ——
   * 它们都带 user_id，账号一旦重建（同一个邮箱重新注册会拿到新 id，但"注销"这件事
   * 在审计上必须是干净的），这些悬空数据就成了无法解释的残留。
   *
   * 🔴 必须在事务内：与 OAuth / 用户软删同成败，不能出现"角色清了但账号还在"。
   *
   * @param {number} userId 用户 ID
   * @param {object} transaction 事务
   * @returns {Promise<object>} 各类清理条数
   */
  async purgeAccountScoped(userId, transaction) {
    const result = { user_roles: 0, inline_policies: 0, user_posts: 0, temp_passwords: 0, app_settings: 0 };

    // iam_user_role：paranoid 模型不能硬删（softDeleteHooks 会抛错），逐条 destroy
    // 才能让钩子把 delete_version 置为 id、释放 (user_id, role_id, app_id) 唯一索引
    const UserRole = getModel('iam.UserRole');
    if (UserRole) {
      const rows = await UserRole.findAll({ where: { user_id: userId }, transaction });
      for (const row of rows) {
        await row.destroy({ transaction });
        result.user_roles += 1;
      }
    }

    // iam_inline_policy：同上
    const InlinePolicy = getModel('iam.InlinePolicy');
    if (InlinePolicy) {
      const rows = await InlinePolicy.findAll({ where: { user_id: userId }, transaction });
      for (const row of rows) {
        await row.destroy({ transaction });
        result.inline_policies += 1;
      }
    }

    // sys_user_post：联合主键、无 paranoid，直接删
    const SysUserPost = getModel('console.SysUserPost');
    if (SysUserPost) {
      result.user_posts = await SysUserPost.destroy({ where: { user_id: userId }, transaction });
    }

    // 临时密码：注销后还能用它登录就太荒唐了
    const UserTempPassword = getModel('user.UserTempPassword');
    if (UserTempPassword) {
      // 连"已作废但未过期"的一起清：它们仍是这个人的凭据残留，没有保留必要
      result.temp_passwords = await UserTempPassword.destroy({
        where: { user_id: userId },
        transaction,
        force: true
      });
    }

    // 各应用的账号数据（偏好 / API Key）
    result.app_settings = await this.purgeAppSettings(userId, Object.keys(APP_SETTINGS_MODELS), transaction);

    return result;
  }

  /**
   * 清指定应用的账号数据
   *
   * @param {number} userId 用户 ID
   * @param {string[]} appIds 应用标识
   * @param {object} [transaction] 事务
   * @returns {Promise<number>} 清理条数
   */
  async purgeAppSettings(userId, appIds, transaction) {
    let total = 0;
    for (const appId of appIds) {
      const modelNames = APP_SETTINGS_MODELS[appId] || [];
      for (const modelName of modelNames) {
        const model = getModel(modelName);
        if (!model) continue;
        // 硬删：偏好与 API Key 属"账号数据"，没有保留审计的价值，留着反而是泄露面
        const deleted = await model.destroy({ where: { user_id: userId }, transaction, force: true });
        total += Number(deleted) || 0;
      }
    }
    return total;
  }
}

const deactivationService = new DeactivationService();

export default deactivationService;
