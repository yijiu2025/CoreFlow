/**
 * 用户注销申请数据访问层
 *
 * 提供注销申请的增删改查能力。
 *
 * @author yijiu2025
 * @since 2026-08-23
 */
import { getModel } from '../../../framework/db/index.js';
import { Op } from 'sequelize';

/** 注销申请状态 */
export const DEACTIVATION_STATUS = {
  PENDING: 1, // 注销中（待撤销）
  REVOKED: 2, // 已撤销
  EXECUTED: 3 // 已执行（正式注销完成）
};

/** 注销范围 */
export const DEACTIVATION_SCOPE = {
  APP: 'app', // 单个应用
  ALL: 'all' // 全部数据
};

/** 撤销期天数 */
const REVOKE_PERIOD_DAYS = 7;

class UserDeactivationDao {
  /**
   * 创建注销申请
   * @param {object} params - { user_id, uid, scope, app_id?, reason? }
   * @returns {Promise<object>} 创建的申请记录
   * @throws {Error} 已存在活跃申请时抛 DEACTIVATION_FAILED
   */
  async createRequest({ user_id, uid, scope, app_id, reason }) {
    const UserDeactivation = getModel('user.UserDeactivation');
    if (scope === DEACTIVATION_SCOPE.APP && !app_id) {
      throw new Error('DEACTIVATION_FAILED:scope=app 时必须指定 app_id');
    }

    // 防重复申请：同一用户同一范围(app_id)已有 PENDING 申请
    const where = { user_id, status: DEACTIVATION_STATUS.PENDING };
    if (scope === DEACTIVATION_SCOPE.APP) {
      where.scope = DEACTIVATION_SCOPE.APP;
      where.app_id = app_id;
    } else {
      where.scope = DEACTIVATION_SCOPE.ALL;
      where.app_id = { [Op.is]: null };
    }
    const existing = await UserDeactivation.findOne({ where });
    if (existing) {
      const target = scope === DEACTIVATION_SCOPE.ALL ? '全部数据' : `应用 ${app_id}`;
      throw new Error(`DEACTIVATION_FAILED:已存在 ${target} 的注销申请，请先撤销或等待执行`);
    }

    const now = new Date();
    const scheduled_at = new Date(now.getTime() + REVOKE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    return UserDeactivation.create({
      user_id,
      uid,
      scope,
      app_id: scope === DEACTIVATION_SCOPE.APP ? app_id : null,
      status: DEACTIVATION_STATUS.PENDING,
      reason: reason || null,
      requested_at: now,
      scheduled_at
    });
  }

  /**
   * 查用户的活跃注销申请（status=PENDING）
   * @param {number} userId - user_user.id
   * @returns {Promise<Array>} 活跃申请列表
   */
  async findPendingByUser(userId) {
    const UserDeactivation = getModel('user.UserDeactivation');
    return UserDeactivation.findAll({
      where: { user_id: userId, status: DEACTIVATION_STATUS.PENDING },
      order: [['requested_at', 'DESC']]
    });
  }

  /**
   * 查某用户某 app 是否有活跃注销申请（登录拦截用）
   * @param {number} userId
   * @param {string} appId - 当前登录的 app_id
   * @returns {Promise<object|null>} 命中的申请（scope=all 或 scope=app 且 app_id=appId）
   */
  async findBlockingPending(userId, appId) {
    const UserDeactivation = getModel('user.UserDeactivation');
    return UserDeactivation.findOne({
      where: {
        user_id: userId,
        status: DEACTIVATION_STATUS.PENDING,
        [Op.or]: [
          { scope: DEACTIVATION_SCOPE.ALL }, // 全部注销：拦截所有 app 登录
          { scope: DEACTIVATION_SCOPE.APP, app_id: appId } // 某应用注销：仅拦截该 app
        ]
      },
      order: [['requested_at', 'DESC']]
    });
  }

  /**
   * 按 id 查申请
   */
  async findById(id) {
    const UserDeactivation = getModel('user.UserDeactivation');
    return UserDeactivation.findByPk(id);
  }

  /**
   * 列表查询（管理员用）
   * @param {object} opts - { status?, scope?, userId?, page=1, pageSize=20 }
   */
  async list({ status, scope, userId, page = 1, pageSize = 20 } = {}) {
    const UserDeactivation = getModel('user.UserDeactivation');
    const where = {};
    if (status !== undefined && status !== null && status !== '') where.status = Number(status);
    if (scope) where.scope = scope;
    if (userId) where.user_id = userId;

    const { rows, count } = await UserDeactivation.findAndCountAll({
      where,
      order: [['requested_at', 'DESC']],
      limit: Number(pageSize),
      offset: (Number(page) - 1) * Number(pageSize),
      include: [{ association: 'user', attributes: ['id', 'uid', 'username', 'email'] }]
    });

    return { rows, count, page: Number(page), pageSize: Number(pageSize) };
  }

  /**
   * 查已到期可执行的申请（status=PENDING 且 scheduled_at <= now）
   * @param {number} limit - 每批最多处理数量
   * @returns {Promise<Array>}
   */
  async findExecutable(limit = 100) {
    const UserDeactivation = getModel('user.UserDeactivation');
    return UserDeactivation.findAll({
      where: {
        status: DEACTIVATION_STATUS.PENDING,
        scheduled_at: { [Op.lte]: new Date() }
      },
      order: [['scheduled_at', 'ASC']],
      limit: Number(limit)
    });
  }

  /**
   * 撤销申请（用户自助或管理员撤销）
   * @param {number} id - 申请 id
   * @param {number} revokedBy - 撤销操作者 user_id
   * @returns {Promise<[number]>} 受影响行数（0 表示申请不存在或非 PENDING）
   */
  async revoke(id, revokedBy) {
    const UserDeactivation = getModel('user.UserDeactivation');
    const [affected] = await UserDeactivation.update(
      {
        status: DEACTIVATION_STATUS.REVOKED,
        revoked_at: new Date(),
        revoked_by: revokedBy
      },
      { where: { id, status: DEACTIVATION_STATUS.PENDING } } // 仅 PENDING 可撤销
    );
    return affected;
  }

  /**
   * 标记已执行（正式注销完成后）
   */
  async markExecuted(id) {
    const UserDeactivation = getModel('user.UserDeactivation');
    const [affected] = await UserDeactivation.update(
      { status: DEACTIVATION_STATUS.EXECUTED, executed_at: new Date() },
      { where: { id, status: DEACTIVATION_STATUS.PENDING } }
    );
    return affected;
  }
}

export default new UserDeactivationDao();
