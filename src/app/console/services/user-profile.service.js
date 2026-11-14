/**
 * 用户详情聚合服务（只读为主 + 单条权限编辑）
 *
 * 用户管理页点一行要回答四件事：**这个人是谁、注册了哪些应用、有哪些角色和权限、
 * 最近干了什么**。这些数据分散在 6 张表里（user / iam_role / iam_user_role /
 * sys_role_menu / audit_logs / session_logs / iam_inline_policy），
 * 前端逐个拉会变成 6 个请求且职级判定要重复 6 次 —— 所以收口成一个聚合接口。
 *
 * 职级规则（与需求一致）：
 * - **看**：职级不低于目标即可（同级能互相看）；超管不受限。
 * - **改单条权限**：必须**严格高于**目标职级（同级的两个人不能互相改权限，
 *   否则谁先动手谁就把对方降权了）；超管不受限。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { QueryTypes } from 'sequelize';
import { logAuditEvent } from '../../../framework/security/auth/index.js';
import { describeCurrentAccess } from './user-access.service.js';
import userDangerService from './user-danger.service.js';
import { getActorScope, getTargetScope, appLabel } from './access-scope.service.js';

/** 记录区展示条数（够看出"最近在忙什么"即可，完整流水在日志页） */
const RECENT_LIMIT = 10;

/**
 * 校验「能不能看这个人的详情」
 *
 * @param {number} actorId 操作者
 * @param {number} targetId 目标用户
 * @returns {Promise<void>}
 * @throws {Error} `FORBIDDEN:...`
 */
async function assertCanView(actorId, targetId) {
  if (Number(actorId) === Number(targetId)) return;
  const actor = await getActorScope(actorId);
  if (actor.isSuper) return;
  const target = await getTargetScope(targetId);
  if (actor.maxRank < target.maxRank) {
    throw new Error('FORBIDDEN:不能查看职级高于自己的账号');
  }
}

/**
 * 校验「能不能改这个人的单条权限」
 *
 * @param {number} actorId 操作者
 * @param {number} targetId 目标用户
 * @returns {Promise<void>}
 * @throws {Error} `FORBIDDEN:...`
 */
async function assertCanEditPermissions(actorId, targetId) {
  if (Number(actorId) === Number(targetId)) {
    throw new Error('FORBIDDEN:不能修改自己的权限（会把自己锁在外面）');
  }
  const actor = await getActorScope(actorId);
  if (actor.isSuper) return;
  const target = await getTargetScope(targetId);
  if (actor.maxRank <= target.maxRank) {
    throw new Error('FORBIDDEN:只能调整职级低于自己的账号');
  }
}

/**
 * 读取内联策略（该用户该应用的 Allow / Deny 列表）
 *
 * @param {number} userId 用户 ID
 * @param {string} appId 应用 ID
 * @returns {Promise<{allow: string[], deny: string[]}>}
 */
async function readInline(userId, appId) {
  const row = await getModel('InlinePolicy').findOne({ where: { user_id: Number(userId), app_id: appId } });
  const policy = row?.policy;
  const doc = typeof policy === 'string' ? JSON.parse(policy) : policy;
  const allow = [];
  const deny = [];
  for (const stmt of doc?.Statement ?? []) {
    for (const action of stmt.Action ?? []) {
      if (stmt.Effect === 'Allow') allow.push(action);
      else if (stmt.Effect === 'Deny') deny.push(action);
    }
  }
  return { allow: Array.from(new Set(allow)), deny: Array.from(new Set(deny)) };
}

class UserProfileService {
  /**
   * 用户详情（概览 / 应用 / 角色权限 / 记录）
   *
   * @param {object} params 参数
   * @param {number} params.actorId 操作者用户 ID
   * @param {number} params.targetId 目标用户 ID
   * @returns {Promise<object>} 聚合详情
   */
  async profile({ actorId, targetId }) {
    const id = Number(targetId);
    await assertCanView(actorId, id);

    const User = getModel('User');
    const user = await User.findByPk(id, { raw: true });
    if (!user) throw new Error('NOT_FOUND:用户不存在');

    const [dept, posts, access, apps, ops, logins, inlineRows] = await Promise.all([
      user.dept_id ? getModel('SysDept').findByPk(user.dept_id, { raw: true }) : null,
      this.postsOf(id),
      describeCurrentAccess(id),
      userDangerService.listApps(id),
      this.recentOps(id),
      this.recentLogins(id),
      getModel('InlinePolicy').findAll({ where: { user_id: id }, raw: true })
    ]);

    // 内联策略按应用分组：前端要按"每条权限"显示 允许 / 拒绝 / 继承
    const inline = [];
    for (const row of inlineRows) {
      const { allow, deny } = await readInline(id, row.app_id);
      inline.push({ appId: row.app_id, appLabel: appLabel(row.app_id), allow, deny });
    }

    return {
      user: {
        id: Number(user.id),
        uid: user.uid,
        username: user.username,
        email: user.email || '',
        avatar: user.avatar || '',
        status: Number(user.status),
        deptId: user.dept_id ? Number(user.dept_id) : null,
        deptName: dept?.name || '',
        postNames: posts,
        createdAt: user.created_at,
        deleteVersion: Number(user.delete_version || 0)
      },
      access,
      apps,
      inline,
      recentOps: ops,
      recentLogins: logins,
      /** 当前操作者能否编辑这个人的权限（前端据此决定开关是否可点） */
      canEdit: await this.canEdit(actorId, id)
    };
  }

  /**
   * 岗位名
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<string[]>} 岗位名列表
   */
  async postsOf(userId) {
    const rows = await getModel('SysUserPost').findAll({
      where: { user_id: userId },
      attributes: ['post_id'],
      raw: true
    });
    const ids = rows.map(r => Number(r.post_id)).filter(n => n > 0);
    if (ids.length === 0) return [];
    const posts = await getModel('SysPost').findAll({ where: { id: ids }, attributes: ['name'], raw: true });
    return posts.map(p => p.name);
  }

  /**
   * 最近操作（审计日志）
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<Array<object>>} 最近若干条
   */
  async recentOps(userId) {
    const { sequelize } = getModel('AuditLog');
    const rows = await sequelize.query(
      `SELECT a.event, a.app_id, a.ip, a.created_at,
              JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.costMs')) AS cost_ms
         FROM audit_logs a
        WHERE a.user_id = :userId
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ${RECENT_LIMIT}`,
      { type: QueryTypes.SELECT, replacements: { userId: Number(userId) } }
    );
    return rows.map(r => ({
      event: r.event,
      appId: r.app_id,
      ip: r.ip,
      costMs: r.cost_ms === null ? null : Number(r.cost_ms),
      createdAt: r.created_at
    }));
  }

  /**
   * 最近登录（会话日志）
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<Array<object>>} 最近若干条
   */
  async recentLogins(userId) {
    const { sequelize } = getModel('SessionLog');
    const rows = await sequelize.query(
      `SELECT l.event, l.app_id, l.ip, l.location, l.user_agent, l.created_at
         FROM session_logs l
        WHERE l.user_id = :userId
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ${RECENT_LIMIT}`,
      { type: QueryTypes.SELECT, replacements: { userId: Number(userId) } }
    );
    return rows.map(r => ({
      event: r.event,
      appId: r.app_id,
      ip: r.ip,
      location: r.location || '',
      userAgent: r.user_agent || '',
      failed: String(r.event || '').includes('FAIL'),
      createdAt: r.created_at
    }));
  }

  /**
   * 当前操作者能否改这个人的权限（前端用，不抛错）
   *
   * @param {number} actorId 操作者
   * @param {number} targetId 目标
   * @returns {Promise<boolean>} 可否编辑
   */
  async canEdit(actorId, targetId) {
    try {
      await assertCanEditPermissions(actorId, targetId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 设置某条权限的处置：允许 / 拒绝 / 恢复继承
   *
   * 写的是 `iam_inline_policy`（PBAC 的"个人策略"），与角色 policy 叠加：
   * Deny 优先于 Allow（与 `buildUserEffectivePolicy` 同一口径）。
   *
   * @param {object} params 参数
   * @param {number} params.actorId 操作者用户 ID
   * @param {number} params.targetId 目标用户 ID
   * @param {string} params.appId 应用
   * @param {string} params.code 权限码
   * @param {'allow'|'deny'|'inherit'} params.effect 处置
   * @param {object} [params.request] Fastify 请求（审计用）
   * @returns {Promise<object>} 变更后的该应用内联策略
   */
  async setPermission({ actorId, targetId, appId, code, effect, request }) {
    const id = Number(targetId);
    await assertCanEditPermissions(actorId, id);
    const action = String(code || '').trim();
    if (!action) throw new Error('INVALID_PARAM:权限码不能为空');
    if (!['allow', 'deny', 'inherit'].includes(effect)) throw new Error('INVALID_PARAM:不支持的处置');

    const InlinePolicy = getModel('InlinePolicy');
    const row = await InlinePolicy.findOne({ where: { user_id: id, app_id: appId } });
    const current = typeof row?.policy === 'string' ? JSON.parse(row.policy) : row?.policy;
    const statements = (current?.Statement ?? []).map(stmt => ({
      Effect: stmt.Effect,
      Action: [...(stmt.Action ?? [])]
    }));

    // 先把这个码从所有分支里摘掉，再按需要挂回去 —— 保证一个码只出现在一处
    for (const stmt of statements) {
      stmt.Action = stmt.Action.filter(a => a !== action);
    }
    if (effect !== 'inherit') {
      const targetEffect = effect === 'allow' ? 'Allow' : 'Deny';
      let stmt = statements.find(s => s.Effect === targetEffect);
      if (!stmt) {
        stmt = { Effect: targetEffect, Action: [] };
        statements.push(stmt);
      }
      stmt.Action.push(action);
    }

    const cleaned = statements.filter(stmt => stmt.Action.length > 0);
    const doc = { Version: '2026-06-06', Statement: cleaned };

    if (cleaned.length === 0) {
      // 全摘干净 = 没有任何个人策略，删行而不是留一条空壳
      if (row) await row.destroy();
    } else if (row) {
      row.policy = doc;
      await row.save();
    } else {
      await InlinePolicy.create({ user_id: id, app_id: appId, policy: doc });
    }

    // 权限变了必须留痕：谁能单独改别人的权限，是最需要可追溯的动作之一。
    // 带上 targetUsername：日志列表只显示 `#26` 时，事后根本认不出是谁。
    const targetUser = await getModel('User').findByPk(id, { attributes: ['username'] });
    await logAuditEvent({
      type: 'USER_PERMISSION_INLINE',
      userId: actorId,
      ip: request?.ip,
      userAgent: request?.headers?.['user-agent'] || '',
      appId: 'console',
      details: { targetId: id, targetUsername: targetUser?.username || '', appId, code: action, effect }
    });

    return { appId, appLabel: appLabel(appId), ...(await readInline(id, appId)) };
  }
}

const userProfileService = new UserProfileService();

export default userProfileService;
