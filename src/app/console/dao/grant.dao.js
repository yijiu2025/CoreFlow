/**
 * 角色授权流水 DAO
 *
 * 只做两件事：**写**一条授权/取消记录，**读**某个用户的授权历史。
 * 流水本身不改不删 —— 需要"修正"时再记一条反向动作，否则历史会自相矛盾。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { getModel } from '../../../framework/persistence/db/index.js';

const grantDao = {
  /**
   * 批量写授权流水
   *
   * @param {object} params 入参
   * @param {number} params.userId 被授权用户 ID
   * @param {string} params.username 被授权用户账号（快照）
   * @param {Array<{ roleId: number, roleCode: string, roleName: string, action: 'grant'|'revoke', appId?: string }>} params.changes 变更项
   * @param {{ id?: number, username?: string }|null} params.operator 操作人（系统自动时传 null）
   * @param {string} [params.remark] 来源说明
   * @param {object} [params.transaction] 事务（与角色写入同事务，避免"改了但没记账"）
   * @returns {Promise<void>}
   */
  async record({ userId, username, changes, operator, remark, transaction }) {
    if (!Array.isArray(changes) || changes.length === 0) return;
    const rows = changes.map(change => ({
      user_id: Number(userId),
      username: String(username ?? ''),
      role_id: Number(change.roleId),
      role_code: String(change.roleCode ?? ''),
      role_name: String(change.roleName ?? ''),
      action: change.action === 'revoke' ? 'revoke' : 'grant',
      operator_id: operator?.id ?? null,
      operator_name: String(operator?.username ?? '系统'),
      app_id: change.appId || 'GLOBAL',
      remark: remark ?? null
    }));
    await getModel('RoleGrantLog').bulkCreate(rows, { transaction });
  },

  /**
   * 某用户的授权历史（倒序分页）
   *
   * @param {number} userId 用户 ID
   * @param {object} query 查询条件
   * @param {number} [query.pageNum=1] 页码
   * @param {number} [query.pageSize=20] 每页条数
   * @param {'grant'|'revoke'|''} [query.action] 只看授予 / 只看取消
   * @returns {Promise<{ rows: object[], total: number }>} 分页结果
   */
  async pageByUser(userId, { pageNum = 1, pageSize = 20, action = '' }) {
    const where = { user_id: Number(userId) };
    if (action === 'grant' || action === 'revoke') where.action = action;

    const { rows, count } = await getModel('RoleGrantLog').findAndCountAll({
      where,
      order: [['id', 'DESC']],
      offset: (Number(pageNum) - 1) * Number(pageSize),
      limit: Number(pageSize),
      raw: true
    });

    return {
      rows: rows.map(r => ({
        id: Number(r.id),
        action: r.action,
        role_id: Number(r.role_id),
        role_code: r.role_code,
        role_name: r.role_name,
        operator_id: r.operator_id === null ? null : Number(r.operator_id),
        operator_name: r.operator_name,
        app_id: r.app_id,
        remark: r.remark,
        // raw:true 返回的是**属性名**（createdAt），不是列名（created_at）
        created_at: r.createdAt
      })),
      total: Number(count || 0)
    };
  },

  /**
   * 某用户的当前生效角色（含授予时间，用于"从什么时候开始有"）
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<Array<{ roleId: number, grantedAt: string|null, grantedBy: string }>>} 角色及首次授予信息
   */
  async currentGrantInfo(userId) {
    const rows = await getModel('RoleGrantLog').findAll({
      where: { user_id: Number(userId), action: 'grant' },
      order: [['id', 'ASC']],
      raw: true
    });
    // 同一角色可能被多次授予（取消后再授）：取**最后一次** grant 作为当前生效起点
    const latest = new Map();
    for (const row of rows) latest.set(Number(row.role_id), row);
    return [...latest.values()].map(row => ({
      roleId: Number(row.role_id),
      grantedAt: row.createdAt,
      grantedBy: row.operator_name
    }));
  }
};

export default grantDao;
