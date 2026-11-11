/**
 * 账号高危操作服务（删除 / 单应用注销 / 临时密码）
 *
 * 这三个动作都能"以别人的身份进入系统"或"让别人的数据消失"，所以它们不放普通权限，
 * 而是集中在同一处编排，统一满足四条硬要求：
 *
 * 1. **二次验证**：必须输入操作者**自己的登录密码**。只靠会话不够 —— 会话可能落在
 *    一台没锁屏的机器上；而密码这件事，操作者本人必须现敲一次。
 * 2. **职级与范围**：复用 `access-scope.service` 的判定（不能动超管、不能动同级或更高、
 *    非跨应用管理员只能动本应用的用户），与本仓其它改账号的动作同一口径。
 * 3. **全流程留痕**：发起 / 撤销 / 使用临时密码都写审计，且带上发起人账号快照。
 * 4. **可逆优先**：删除走注销缓冲期（默认 7 天，到期才清理），期间可撤销；
 *    单应用注销同理。立刻抹数据只在 `force` 执行里存在（运维口子，不当接口暴露）。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { Op } from 'sequelize';
import { verifyPassword, logAuditEvent } from '../../../framework/security/auth/index.js';
import deactivationService from '../../user/services/deactivation.service.js';
import tempPasswordService from '../../user/services/temp-password.service.js';
import { getActorScope, getTargetScope, assertCanManageUser, appLabel } from './access-scope.service.js';
import consoleConfig from '../config.js';

/** 审计事件名（列表页据此筛选，别散落成字面量） */
const DANGER_EVENTS = {
  DELETE_REQUEST: 'USER_DELETE_REQUEST',
  DELETE_CANCEL: 'USER_DELETE_CANCEL',
  APP_DEACTIVATE: 'USER_APP_DEACTIVATE',
  TEMP_PASSWORD: 'USER_TEMP_PASSWORD'
};

/**
 * 缓冲期天数（来自 console 配置）
 *
 * @returns {number} 天数
 */
function graceDays() {
  return Number(consoleConfig?.user_deletion?.grace_days) || 7;
}

/**
 * 二次验证：校验操作者自己的登录密码
 *
 * 走 `user_identity`（identity_type=password）而不是 console 的 DAO：密码校验只有
 * 一个真源，任何"另存一份密码"的做法都会在改密后失配。
 *
 * @param {object} actor 操作者（{ id, username }）
 * @param {string} password 明文密码
 * @throws {Error} `FORBIDDEN:xxx`
 */
async function assertStepUp(actor, password) {
  if (!actor?.id) throw new Error('FORBIDDEN:无法确认操作者身份，请重新登录');
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('FORBIDDEN:该操作需要输入你自己的登录密码');
  }
  const UserIdentity = getModel('UserIdentity');
  const identity = await UserIdentity.findOne({
    where: { user_id: Number(actor.id), identity_type: 'password' }
  });
  if (!identity?.credential) {
    throw new Error('FORBIDDEN:你的账号未设置密码，无法完成二次验证');
  }
  const ok = await verifyPassword(password, identity.credential);
  if (!ok) throw new Error('FORBIDDEN:密码不正确，操作已取消');
}

/**
 * 取目标用户
 *
 * @param {number} targetId 用户 ID
 * @returns {Promise<object>} User 实例
 * @throws {Error} `NOT_FOUND:用户不存在`
 */
async function loadTarget(targetId) {
  const User = getModel('User');
  const user = await User.findByPk(Number(targetId));
  if (!user) throw new Error('NOT_FOUND:用户不存在');
  return user;
}

/**
 * 判定「能不能对这个账号做高危操作」
 *
 * 除职级/应用域外，额外禁掉**删除自己**：删除会立刻拒登录，把自己删了就再也进不来，
 * 而且没有"另一个我"能撤销。要退出请用移交权限。
 *
 * @param {object} actor 操作者（{ id, username }）
 * @param {object} target 目标 User 实例
 * @param {string} action 动作名（拼提示语）
 * @returns {Promise<void>}
 */
async function assertCanAct(actor, target, action) {
  if (Number(target.id) === Number(actor?.id)) {
    throw new Error(`FORBIDDEN:不能${action}自己的账号`);
  }
  const [actorScope, targetScope] = await Promise.all([getActorScope(actor.id), getTargetScope(target.id)]);
  assertCanManageUser(actorScope, targetScope, target.id, actor.id, { action });
}

/**
 * 只有超级管理员能做的事
 *
 * 为什么是"超管"而不是"有某个权限码"：本仓的角色通配是 `admin:*`，而 `admin_admin`
 * 持的正是它 —— 想靠权限码把"特别高"表达出来，必须先造一个**不在 `admin:*` 之下**的
 * 命名空间，反而更难理解。这里直接用"是不是超管"表达，语义最清楚：
 *
 * - 删除账号：会立刻拒登录、到期清数据，误操作不可逆（缓冲期内尚可救）；
 * - 签发临时密码：等于把别人账号的临时钥匙交出去，比删除更危险。
 *
 * 单应用注销不在此列：影响面只有一个应用，交给 `admin:user:deactivate` 即可。
 *
 * @param {object} actor 操作者（{ id, username }）
 * @param {string} action 动作名
 * @throws {Error} `FORBIDDEN:xxx`
 */
async function assertSuper(actor, action) {
  const scope = await getActorScope(actor?.id);
  if (!scope.isSuper) {
    throw new Error(`FORBIDDEN:只有超级管理员可以${action}`);
  }
}

/**
 * 写一条审计
 *
 * @param {object} request Fastify 请求（取 ip / ua）
 * @param {string} type 事件名
 * @param {object} actor 操作者
 * @param {object} details 详情
 * @returns {Promise<void>}
 */
async function audit(request, type, actor, details) {
  await logAuditEvent({
    type,
    userId: actor?.id ?? null,
    ip: request.ip,
    userAgent: request.headers['user-agent'] || '',
    appId: 'console',
    details
  });
}

class UserDangerService {
  /**
   * 发起「删除用户」（进入缓冲期，不立刻清数据）
   *
   * @param {object} params 参数
   * @param {import('fastify').FastifyRequest} params.request 请求
   * @param {object} params.actor 操作者（{ id, username }）
   * @param {number} params.targetId 目标用户
   * @param {string} params.password 操作者密码（二次验证）
   * @param {string} params.confirmUsername 手打的目标账号名（防误点）
   * @param {string} [params.reason] 原因
   * @returns {Promise<object>} { id, scheduledAt, graceDays }
   */
  async requestDeletion({ request, actor, targetId, password, confirmUsername, reason }) {
    await assertStepUp(actor, password);
    await assertSuper(actor, '删除账号');
    const target = await loadTarget(targetId);
    await assertCanAct(actor, target, '删除');

    if (String(confirmUsername || '').trim() !== String(target.username)) {
      throw new Error('INVALID_PARAM:请输入该用户的登录名以确认删除');
    }

    const request_ = await deactivationService.createAdminRequest({
      target: { id: target.id, uid: target.uid, username: target.username },
      scope: 'all',
      actor,
      graceDays: graceDays(),
      reason
    });

    await audit(request, DANGER_EVENTS.DELETE_REQUEST, actor, {
      targetId: Number(target.id),
      targetUsername: target.username,
      deactivationId: Number(request_.id),
      scheduledAt: request_.scheduled_at,
      reason: reason || null
    });

    return { id: Number(request_.id), scheduledAt: request_.scheduled_at, graceDays: graceDays() };
  }

  /**
   * 撤销某条注销申请
   *
   * 撤销不要求二次验证：它只会让"即将被删的账号"回到正常，不会造成破坏；
   * 真正危险的是发起。加验证反而会让人在紧急恢复时卡住。
   *
   * @param {object} params 参数
   * @param {import('fastify').FastifyRequest} params.request 请求
   * @param {object} params.actor 操作者
   * @param {number} params.targetId 目标用户
   * @param {number} params.requestId 申请 ID
   * @returns {Promise<object>} 结果
   */
  async cancelDeletion({ request, actor, targetId, requestId }) {
    const target = await loadTarget(targetId);
    await assertCanAct(actor, target, '撤销注销');
    const result = await deactivationService.cancelRequest(target.id, requestId, actor);
    await audit(request, DANGER_EVENTS.DELETE_CANCEL, actor, {
      targetId: Number(target.id),
      targetUsername: target.username,
      deactivationId: Number(requestId)
    });
    return result;
  }

  /**
   * 某用户当前的待执行注销（全部 / 各应用）
   *
   * @param {number} targetId 用户 ID
   * @returns {Promise<object>} { requests }
   */
  async listDeletion(targetId) {
    const requests = await deactivationService.listPending(Number(targetId));
    return { requests };
  }

  /**
   * 批量查「待执行的注销申请」（列表页用）
   *
   * 一页 20 个用户就是 20 次查询的话，翻页会明显变慢 —— 这里一次 IN 查完再分组。
   *
   * @param {number[]} userIds 用户 ID 列表
   * @returns {Promise<Map<number, object>>} userId → 申请（scope=all 优先展示）
   */
  async pendingByUsers(userIds) {
    const ids = (userIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0);
    const map = new Map();
    if (ids.length === 0) return map;

    const UserDeactivation = getModel('user.UserDeactivation');
    const rows = await UserDeactivation.findAll({
      where: { user_id: { [Op.in]: ids }, status: 1 },
      order: [['requested_at', 'DESC']],
      raw: true
    });
    for (const row of rows) {
      const key = Number(row.user_id);
      const hit = map.get(key);
      // scope=all 比单个应用严重，优先展示它（但保留最早那条的时间）
      if (!hit || (hit.scope !== 'all' && row.scope === 'all')) {
        map.set(key, {
          id: Number(row.id),
          scope: row.scope,
          app_id: row.app_id,
          scheduled_at: row.scheduled_at,
          requested_by_name: row.requested_by_name
        });
      }
    }
    return map;
  }

  /**
   * 该用户「会话未踢干净」的记录（Redis 不可用时的残留）
   *
   * 管理端展示用：让管理员知道"注销执行了，但还有会话没清掉"，而不是以为一切干净。
   *
   * @param {number} targetId 用户 ID
   * @returns {Promise<Array<object>>} 记录
   */
  async listPendingKicks(targetId) {
    return deactivationService.listPendingKicks(Number(targetId));
  }

  /**
   * 该用户在各应用里的账号状态
   *
   * 数据来源三处（都不跨域 JOIN，各查一次再合并）：OAuth 授权、OAuth 令牌、会话。
   * 注销子应用看的就是"他在这个应用里还有没有关系" —— 三条都没有的应用不列出来。
   *
   * @param {number} targetId 用户 ID
   * @returns {Promise<Array<object>>} 应用列表
   */
  async listApps(targetId) {
    const target = await loadTarget(targetId);

    const [approvals, tokens, sessions] = await Promise.all([
      safeFindAll('oauth21.OauthApproval', { sub: target.uid, status: 1 }, ['app_id', 'last_auth_at']),
      safeFindAll('oauth21.OauthToken', { sub: target.uid, revoked: false }, ['client_id', 'created_at']),
      safeFindAll('session.SessionToken', { user_id: Number(target.id), revoked: false }, ['app_id', 'updated_at'])
    ]);

    const merged = new Map();
    /**
     * 合并一条
     *
     * @param {string} appId 应用
     * @param {string} key 该来源对应的标记
     * @param {Date|null} at 时间
     */
    const touch = (appId, key, at) => {
      if (!appId) return;
      const hit = merged.get(appId) || {
        app_id: appId,
        authorized: false,
        has_token: false,
        has_session: false,
        last_active_at: null
      };
      hit[key] = true;
      const time = at ? new Date(at).getTime() : 0;
      if (time && (!hit.last_active_at || time > new Date(hit.last_active_at).getTime())) {
        hit.last_active_at = at;
      }
      merged.set(appId, hit);
    };

    for (const row of approvals) touch(row.app_id, 'authorized', row.last_auth_at);
    for (const row of tokens) touch(row.client_id, 'has_token', row.created_at);
    for (const row of sessions) touch(row.app_id, 'has_session', row.updated_at);

    const pending = await deactivationService.listPending(Number(target.id));
    const pendingApps = new Map(pending.filter(item => item.scope === 'app').map(item => [item.app_id, item]));

    return [...merged.values()]
      .map(item => ({
        ...item,
        app_label: appLabel(item.app_id),
        last_active_at: item.last_active_at || null,
        pending: pendingApps.get(item.app_id) || null
      }))
      .sort((a, b) => String(a.app_label).localeCompare(String(b.app_label), 'zh-CN'));
  }

  /**
   * 注销某用户在某应用里的账号（不动主账号）
   *
   * 走的是同一套注销申请：立刻拒绝该应用的登录，到期后清理该应用的 OAuth 授权 /
   * 令牌 / 会话 / 偏好设置，期间可撤销。主账号与其它应用完全不受影响。
   *
   * @param {object} params 参数
   * @param {import('fastify').FastifyRequest} params.request 请求
   * @param {object} params.actor 操作者
   * @param {number} params.targetId 目标用户
   * @param {string} params.appId 应用标识
   * @param {string} params.password 操作者密码
   * @param {string} [params.reason] 原因
   * @returns {Promise<object>} 结果
   */
  async deactivateApp({ request, actor, targetId, appId, password, reason }) {
    await assertStepUp(actor, password);
    const target = await loadTarget(targetId);
    await assertCanAct(actor, target, '注销该用户的应用账号');

    const created = await deactivationService.createAdminRequest({
      target: { id: target.id, uid: target.uid, username: target.username },
      scope: 'app',
      appId,
      actor,
      graceDays: graceDays(),
      reason
    });

    await audit(request, DANGER_EVENTS.APP_DEACTIVATE, actor, {
      targetId: Number(target.id),
      targetUsername: target.username,
      appId,
      deactivationId: Number(created.id),
      scheduledAt: created.scheduled_at
    });

    return { id: Number(created.id), appId, scheduledAt: created.scheduled_at, graceDays: graceDays() };
  }

  /**
   * 签发临时密码
   *
   * 允许操作者看一次明文，之后库里只有哈希 —— 所以响应里那句"仅显示一次"是字面意思。
   *
   * @param {object} params 参数
   * @param {import('fastify').FastifyRequest} params.request 请求
   * @param {object} params.actor 操作者
   * @param {number} params.targetId 目标用户
   * @param {string} params.password 操作者密码（二次验证）
   * @param {number} [params.ttlMinutes] 有效期（分钟）
   * @param {number} [params.maxUses] 可用次数
   * @param {string} [params.reason] 原因
   * @returns {Promise<object>} { password, expiresAt, maxUses }
   */
  async issueTempPassword({ request, actor, targetId, password, ttlMinutes, maxUses, reason }) {
    await assertStepUp(actor, password);
    await assertSuper(actor, '签发临时密码');
    const target = await loadTarget(targetId);
    await assertCanAct(actor, target, '为账号签发临时密码');

    const issued = await tempPasswordService.issue({
      userId: Number(target.id),
      actor,
      ttlMinutes,
      maxUses,
      reason
    });

    await audit(request, DANGER_EVENTS.TEMP_PASSWORD, actor, {
      targetId: Number(target.id),
      targetUsername: target.username,
      tempPasswordId: issued.id,
      expiresAt: issued.expiresAt,
      maxUses: issued.maxUses,
      reason: reason || null
    });

    return issued;
  }

  /**
   * 该用户当前有效的临时密码（不含明文）
   *
   * @param {number} targetId 用户 ID
   * @returns {Promise<Array<object>>} 记录
   */
  async listTempPasswords(targetId) {
    return tempPasswordService.listActive(Number(targetId));
  }
}

/**
 * 安全地查一张表
 *
 * 模型可能在某些部署里没注册（按应用裁剪过 models/），缺表不该让整个页面 500 ——
 * 这个接口是"给人看的辅助信息"，宁可少一段也不要整页打不开。
 *
 * @param {string} modelName 模型名
 * @param {object} where 条件
 * @param {string[]} attributes 字段
 * @returns {Promise<object[]>} 行
 */
async function safeFindAll(modelName, where, attributes) {
  const model = getModel(modelName);
  if (!model) return [];
  try {
    return await model.findAll({ where, attributes, raw: true });
  } catch {
    return [];
  }
}

const userDangerService = new UserDangerService();

export { DANGER_EVENTS, graceDays };
export default userDangerService;
