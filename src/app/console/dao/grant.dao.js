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

    /*
     * 补操作人详情（邮箱 / 部门 / 账号状态）。
     *
     * 流水里只快照了 `operator_name` —— 那是审计要求的下限（账号改名或被删，历史
     * 仍读得懂），但**不足以辨认"这个人是谁"**：同名同姓、只看账号名判断不了是哪个
     * 部门的管理员在授权。
     *
     * 刻意不做 JOIN：`User` 属 user 域、`SysDept` 属 console 域，给它们挂 association
     * 会让两个域的模型互相耦合（口径同 `user.dao` 的列表聚合）。每页 ≤200 行，
     * 两条 IN 查询即可，没有 N+1。
     */
    const operators = await this._operatorMap(rows.map(r => r.operator_id));

    return {
      rows: rows.map(r => {
        const operator = r.operator_id === null ? null : operators.get(Number(r.operator_id)) || null;
        return {
          id: Number(r.id),
          action: r.action,
          role_id: Number(r.role_id),
          role_code: r.role_code,
          role_name: r.role_name,
          operator_id: r.operator_id === null ? null : Number(r.operator_id),
          operator_name: r.operator_name,
          // 操作人详情：账号被删则全为 null，靠 `operator_deleted` 说明原因
          operator_uid: operator?.uid ?? null,
          operator_email: operator?.email ?? null,
          operator_dept: operator?.dept_name ?? null,
          operator_status: operator?.status ?? null,
          operator_deleted: operator?.deleted ?? false,
          app_id: r.app_id,
          remark: r.remark,
          // raw:true 返回的是**属性名**（createdAt），不是列名（created_at）
          created_at: r.createdAt
        };
      }),
      total: Number(count || 0)
    };
  },

  /**
   * 操作人 id → 详情
   *
   * @param {Array<number|null>} operatorIds 操作人 ID 列表（可含 null，系统自动时为空）
   * @returns {Promise<Map<number, {uid: string|null, email: string|null, dept_name: string|null, status: number|null, deleted: boolean}>>}
   */
  async _operatorMap(operatorIds) {
    const ids = Array.from(
      new Set((operatorIds || []).filter(v => v !== null && v !== undefined && v !== '').map(Number))
    );
    if (ids.length === 0) return new Map();

    const users = await getModel('User').findAll({
      where: { id: ids },
      // `deletedAt` 由 paranoid 隐式加，显式列出才会进 raw 结果；`delete_version` 是
      // 本仓软删除的权威列（0 = 活跃，非 0 = 已删除），判定以它为准更稳。
      attributes: ['id', 'uid', 'email', 'status', 'dept_id', 'delete_version'],
      // 🔴 必须带已删除用户：审计里"操作人已被删除"是一条信息，不能让他凭空消失
      paranoid: false,
      raw: true
    });

    const deptNames = await this._deptNameMap(users.map(u => u.dept_id));
    return new Map(
      users.map(u => [
        Number(u.id),
        {
          uid: u.uid ?? null,
          email: u.email ?? null,
          dept_name: u.dept_id ? deptNames.get(Number(u.dept_id)) || null : null,
          status: u.status === null || u.status === undefined ? null : Number(u.status),
          deleted: Number(u.delete_version) !== 0
        }
      ])
    );
  },

  /**
   * 部门 id → 名称
   *
   * @param {Array<number|null>} deptIds 部门 ID 列表（可含 null）
   * @returns {Promise<Map<number, string>>} id → name
   */
  async _deptNameMap(deptIds) {
    const ids = Array.from(new Set((deptIds || []).filter(v => v !== null && v !== undefined && v !== '').map(Number)));
    if (ids.length === 0) return new Map();
    const depts = await getModel('console.SysDept').findAll({
      where: { id: ids },
      attributes: ['id', 'name'],
      raw: true
    });
    return new Map(depts.map(d => [Number(d.id), d.name]));
  },

  /**
   * 按角色聚合的生效区间
   *
   * 流水是"事件流"（授予/取消），但人看审计时问的是"这个角色开了多久、中间断过没"。
   * 事件流要自己脑补配对，所以这里按角色折成**区间**：一次 grant 开区间、下一次
   * revoke 闭区间；没有 revoke 的区间一直开到"现在"。
   *
   * 一次全量读该用户的流水（**不分页**）：区间必须看到首尾才能配对，只读一页会把
   * "上次授予在第二页"误画成从未生效。单人流水是几十条量级，`limit` 只是防脏数据
   * 撑爆内存的护栏。
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<Array<{
   *   role_id: number, role_code: string, role_name: string, app_id: string,
   *   segments: Array<{from: string, to: string|null}>, active: boolean, first_at: string
   * }>>} 角色 → 生效区间（按"当前生效优先、最近活动在前"排序）
   */
  async roleTimeline(userId) {
    const rows = await getModel('RoleGrantLog').findAll({
      where: { user_id: Number(userId) },
      order: [['id', 'ASC']],
      attributes: ['role_id', 'role_code', 'role_name', 'app_id', 'action', 'createdAt'],
      raw: true,
      limit: 2000
    });

    const byRole = new Map();
    for (const row of rows) {
      const key = Number(row.role_id);
      if (!byRole.has(key)) {
        byRole.set(key, {
          role_id: key,
          role_code: row.role_code,
          role_name: row.role_name,
          app_id: row.app_id,
          segments: [],
          active: false,
          first_at: row.createdAt
        });
      }
      const entry = byRole.get(key);
      // 角色改名后流水里的快照会不同：按时间顺序覆盖成"最新一次写法"
      entry.role_code = row.role_code || entry.role_code;
      entry.role_name = row.role_name || entry.role_name;
      entry.app_id = row.app_id || entry.app_id;

      if (row.action === 'grant') {
        // 重复 grant（历史脏数据）不新开区间：保持最早的那次开始时间
        if (!entry.active) {
          entry.segments.push({ from: row.createdAt, to: null });
          entry.active = true;
        }
      } else if (row.action === 'revoke' && entry.active) {
        const open = entry.segments[entry.segments.length - 1];
        open.to = row.createdAt;
        entry.active = false;
      }
    }

    const list = [...byRole.values()];
    // 当前生效的排前面，其余按最后一段结束时间倒序（最近撤销的在上面）
    const lastAt = entry => {
      const last = entry.segments[entry.segments.length - 1];
      return new Date(last?.to || last?.from || entry.first_at).getTime();
    };
    return list.sort((a, b) => Number(b.active) - Number(a.active) || lastAt(b) - lastAt(a));
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
