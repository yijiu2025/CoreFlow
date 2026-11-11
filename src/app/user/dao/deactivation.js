/**
 * 用户注销申请数据访问层
 *
 * 提供注销申请的增删改查能力。
 *
 * @author yijiu2025
 * @since 2026-08-23
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { Op } from 'sequelize';

/** 注销申请状态 */
const DEACTIVATION_STATUS = {
  PENDING: 1, // 注销中（待撤销）
  REVOKED: 2, // 已撤销
  EXECUTED: 3 // 已执行（正式注销完成）
};

/** 注销范围 */
const DEACTIVATION_SCOPE = {
  APP: 'app', // 单个应用
  ALL: 'all' // 全部数据
};

/** 撤销期天数 */
const REVOKE_PERIOD_DAYS = 7;

class UserDeactivationDao {
  /**
   * 创建注销申请
   *
   * @param {object} params - { user_id, uid, scope, app_id?, reason?, requestedBy?, requestedByName?, graceDays? }
   *   `requestedBy` / `requestedByName`：管理员从后台发起时填（本仓最高危的写操作，
   *   审计里必须能回答"这条删除是谁点的"）；用户自助时留空。
   *   `graceDays`：撤销期天数，缺省 7；管理员侧按配置传入。
   * @returns {Promise<object>} 创建的申请记录
   * @throws {Error} 已存在活跃申请时抛 DEACTIVATION_FAILED
   */
  async createRequest({ user_id, uid, scope, app_id, reason, requestedBy, requestedByName, graceDays }) {
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
    const days = normalizeGraceDays(graceDays);
    const scheduled_at = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return UserDeactivation.create({
      user_id,
      uid,
      scope,
      app_id: scope === DEACTIVATION_SCOPE.APP ? app_id : null,
      status: DEACTIVATION_STATUS.PENDING,
      reason: reason || null,
      requested_at: now,
      scheduled_at,
      requested_by: requestedBy ?? null,
      requested_by_name: requestedByName ?? null
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
   * 查某用户「会话还没踢干净」的申请
   *
   * 登录时调用：Redis 不可用时注销只 revoke 了 DB，活跃会话可能还活着；
   * `scope=app` 尤其危险 —— 用户本身仍正常，残留会话在那个应用里依然有效。
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<object[]>} 待补踢的申请
   */
  async findKickPendingByUser(userId) {
    const UserDeactivation = getModel('user.UserDeactivation');
    return UserDeactivation.findAll({
      where: { user_id: Number(userId), kick_pending: 1 },
      order: [['id', 'ASC']]
    });
  }

  /**
   * 全库查「会话未踢干净」的申请（定时补踢用）
   *
   * 按 `kick_updated_at` 升序：越久没试过的先试，避免个别反复失败的条目霸占配额。
   *
   * @param {number} [limit=100] 单轮上限
   * @returns {Promise<object[]>} 待补踢的申请
   */
  async findKickPending(limit = 100) {
    const UserDeactivation = getModel('user.UserDeactivation');
    return UserDeactivation.findAll({
      where: { kick_pending: 1 },
      order: [
        ['kick_updated_at', 'ASC'],
        ['id', 'ASC']
      ],
      limit: Math.max(Number(limit) || 100, 1)
    });
  }

  /**
   * 标记「会话未踢干净」
   *
   * 失败原因截断到 255（列宽）：Redis 的错误常常带一大段连接细节，整段塞进去会被截断报错。
   *
   * @param {number} id 申请 ID
   * @param {string} message 失败原因
   * @returns {Promise<void>}
   */
  async markKickPending(id, message) {
    const UserDeactivation = getModel('user.UserDeactivation');
    const error = String(message || 'unknown').slice(0, 255);
    await UserDeactivation.update(
      {
        kick_pending: 1,
        kick_last_error: error,
        kick_updated_at: new Date(),
        kick_attempts: sequelizeLiteral('kick_attempts + 1')
      },
      { where: { id } }
    );
  }

  /**
   * 清除「会话未踢干净」标记（补踢成功）
   *
   * @param {number} id 申请 ID
   * @returns {Promise<void>}
   */
  async clearKickPending(id) {
    const UserDeactivation = getModel('user.UserDeactivation');
    await UserDeactivation.update(
      { kick_pending: 0, kick_last_error: null, kick_updated_at: new Date() },
      { where: { id } }
    );
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

/**
 * 归一化撤销期天数
 *
 * 上限 30 天：缓冲期是"给用户留反悔的时间"，不是"长期挂着不处理"；
 * 下限 1 天：0 天等于立即删除，那就不是本功能要的语义了（真要立即删走 force 执行）。
 *
 * @param {*} value 入参
 * @returns {number} 天数（1 ~ 30）
 */
function normalizeGraceDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return REVOKE_PERIOD_DAYS;
  return Math.min(Math.max(Math.floor(n), 1), 30);
}

/**
 * SQL 片段（`kick_attempts + 1` 这类自增不能走对象字面量）
 *
 * @param {string} expr SQL 片段（仅内部常量，不接受外部输入）
 * @returns {object} Sequelize literal
 */
function sequelizeLiteral(expr) {
  const { literal } = getModel('user.UserDeactivation').sequelize.Sequelize;
  return literal(expr);
}

const userDeactivationDao = new UserDeactivationDao();

export { DEACTIVATION_STATUS, DEACTIVATION_SCOPE, REVOKE_PERIOD_DAYS, normalizeGraceDays };
export default userDeactivationDao;
