/**
 * 部门数据访问层（sys_dept）
 *
 * 🔴 `ancestors` 是「本部门及下级」查询的唯一依据，必须由本层维护：
 * 新增时 = 父的 ancestors + 父 id；移动时，自身与全部下级的 ancestors 都要重写。
 * 前端只传 `parent_id`，不得自行拼接。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { Op } from 'sequelize';

/**
 * 部门类审计事件（单一清单）
 *
 * 写接口用 `DEPT_AUDIT_TYPES.*` 取事件名、这里用 `DEPT_EVENTS` 查 —— 一处改动
 * 两头同步，避免"写的叫 DEPT_EDIT、查的是 DEPT_UPDATE"这种查不到还不报错的错。
 */
const DEPT_AUDIT_TYPES = { CREATE: 'DEPT_CREATE', UPDATE: 'DEPT_UPDATE', DELETE: 'DEPT_DELETE' };
const DEPT_EVENTS = Object.values(DEPT_AUDIT_TYPES);

/**
 * 把扁平部门列表拼成树
 *
 * @param {Array<object>} rows 扁平部门列表
 * @returns {Array<object>} 树形部门
 */
function buildTree(rows) {
  const map = new Map();
  const roots = [];
  for (const row of rows) map.set(Number(row.id), { ...row, children: [] });
  for (const node of map.values()) {
    const parent = map.get(Number(node.parent_id));
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const sortDeep = list => {
    list.sort((a, b) => Number(a.sort) - Number(b.sort) || Number(a.id) - Number(b.id));
    for (const item of list) sortDeep(item.children);
  };
  sortDeep(roots);
  return roots;
}

class DeptDao {
  /**
   * 查询全部部门（扁平，含成员数）
   *
   * @returns {Promise<Array<object>>} 部门列表
   */
  async listAll() {
    const rows = await getModel('console.SysDept').findAll({
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC']
      ],
      raw: true
    });
    // 各部门成员数：按 dept_id 分组；User 是 paranoid 模型，已删除的用户自动排除
    const User = getModel('User');
    const { Op } = User.sequelize.Sequelize;
    const counts = await User.findAll({
      attributes: ['dept_id', [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'c']],
      where: { dept_id: { [Op.ne]: null } },
      group: ['dept_id'],
      raw: true
    });
    const countMap = new Map(counts.map(r => [Number(r.dept_id), Number(r.c)]));
    return rows.map(r => ({ ...r, user_count: countMap.get(Number(r.id)) || 0 }));
  }

  /**
   * 部门树
   *
   * @returns {Promise<Array<object>>} 树形部门
   */
  async tree() {
    return buildTree(await this.listAll());
  }

  /**
   * 部门下拉选项（启用项）
   *
   * @returns {Promise<Array<object>>} 扁平选项列表
   */
  async options() {
    const rows = await getModel('console.SysDept').findAll({
      where: { status: 1 },
      attributes: ['id', 'parent_id', 'name'],
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC']
      ],
      raw: true
    });
    return rows;
  }

  /**
   * 按 ID 查部门
   *
   * @param {number} id 部门 ID
   * @returns {Promise<object|null>} 部门实例
   */
  async findById(id) {
    return getModel('console.SysDept').findByPk(id);
  }

  /**
   * 计算某父部门下的 ancestors 值
   *
   * @param {number} parentId 父部门 ID（0 表示根）
   * @returns {Promise<string>} ancestors 字符串
   * @throws {Error} 父部门不存在时抛出
   */
  async resolveAncestors(parentId) {
    const pid = Number(parentId) || 0;
    if (pid === 0) return '0';
    const parent = await this.findById(pid);
    if (!parent) throw new Error('PARENT_NOT_FOUND:上级部门不存在');
    return `${parent.ancestors},${parent.id}`;
  }

  /**
   * 创建部门
   *
   * @param {object} payload 部门字段
   * @returns {Promise<object>} 新建的部门实例
   */
  async create(payload) {
    const ancestors = await this.resolveAncestors(payload.parent_id);
    return getModel('console.SysDept').create({ ...payload, ancestors });
  }

  /**
   * 更新部门（父级变化时同步重写自身与全部下级的 ancestors）
   *
   * @param {number} id 部门 ID
   * @param {object} payload 待更新字段
   * @returns {Promise<boolean>} 是否命中记录
   * @throws {Error} 把部门挂到自己或自己的下级时抛出
   */
  async update(id, payload) {
    const dept = await this.findById(id);
    if (!dept) return false;

    const nextParentId = payload.parent_id === undefined ? Number(dept.parent_id) : Number(payload.parent_id);
    const parentChanged = nextParentId !== Number(dept.parent_id);

    if (parentChanged) {
      if (nextParentId === Number(id)) throw new Error('INVALID_PARENT:不能把部门挂到自己下面');
      const parent = nextParentId === 0 ? null : await this.findById(nextParentId);
      if (nextParentId !== 0 && !parent) throw new Error('PARENT_NOT_FOUND:上级部门不存在');
      const nextAncestors = parent ? `${parent.ancestors},${parent.id}` : '0';
      // 防环：新上级不能是自己的后代
      if (parent && `,${parent.ancestors},`.includes(`,${id},`)) {
        throw new Error('INVALID_PARENT:不能把部门挂到自己的下级下面');
      }
      payload.ancestors = nextAncestors;
      await this.rewriteDescendantAncestors(id, dept.ancestors, nextAncestors);
    }

    const [affected] = await getModel('console.SysDept').update(payload, { where: { id } });
    return affected > 0;
  }

  /**
   * 重写全部下级的 ancestors（移动部门时调用）
   *
   * @param {number} id 被移动的部门 ID
   * @param {string} oldAncestors 移动前的上级链
   * @param {string} newAncestors 移动后的上级链
   * @returns {Promise<void>}
   */
  async rewriteDescendantAncestors(id, oldAncestors, newAncestors) {
    const oldPrefix = `${oldAncestors},${id}`;
    const rows = await getModel('console.SysDept').findAll({
      where: { ancestors: { [Op.like]: `${oldPrefix}%` } },
      attributes: ['id', 'ancestors']
    });
    const newPrefix = `${newAncestors},${id}`;
    for (const row of rows) {
      if (Number(row.id) === Number(id)) continue;
      if (!String(row.ancestors).startsWith(oldPrefix)) continue;
      const rewritten = newPrefix + String(row.ancestors).slice(oldPrefix.length);
      await getModel('console.SysDept').update({ ancestors: rewritten }, { where: { id: row.id } });
    }
  }

  /**
   * 统计子部门数量（删除前校验）
   *
   * @param {number} id 部门 ID
   * @returns {Promise<number>} 子部门数量
   */
  async countChildren(id) {
    return getModel('console.SysDept').count({ where: { parent_id: id } });
  }

  /**
   * 统计部门成员数量（删除前校验）
   *
   * @param {number} id 部门 ID
   * @returns {Promise<number>} 成员数量
   */
  async countUsers(id) {
    return getModel('User').count({ where: { dept_id: id } });
  }

  /**
   * 删除部门
   *
   * @param {number} id 部门 ID
   * @returns {Promise<void>}
   */
  async remove(id) {
    await getModel('console.SysDept').destroy({ where: { id } });
  }

  /**
   * 部门变更历史（读审计表）
   *
   * 审计表是一张通用表，没有 `dept_id` 列 —— 部门 id 存在 `details` JSON 里。这里
   * 先用 `event IN (DEPT_*)` 收窄（走 event 索引），再在内存里按 `details.deptId`
   * 过滤：部门变更是"天"级的低频操作，全表扫一遍 DEPT_ 事件也就几百条，比在 JSON
   * 列上拼 `JSON_EXTRACT`（方言/版本差异 + 用不上索引）稳得多。
   *
   * `SCAN_LIMIT` 是护栏而非业务语义：它限制的是**所有部门**的最近事件条数，
   * 不是某一个部门的。真到了这个量级，应该给审计表加 `target_id` 列并建索引。
   *
   * @param {number} deptId 部门 ID
   * @param {object} [options] 选项
   * @param {number} [options.limit=100] 返回条数
   * @returns {Promise<Array<object>>} 变更历史（倒序，含操作人）
   */
  async history(deptId, { limit = 100 } = {}) {
    const AuditLog = getModel('AuditLog');
    const SCAN_LIMIT = 1000;

    const rows = await AuditLog.findAll({
      where: { event: DEPT_EVENTS },
      order: [['id', 'DESC']],
      limit: SCAN_LIMIT,
      raw: true
    });

    /**
     * `details` 是 JSON 列：`raw: true` 时**可能返回字符串**，不 parse 就永远匹配不上
     * （表现是"历史永远是空的"，且不报错）。同一坑见 role.dao 的 normalizePolicy。
     */
    const detailsOf = row => {
      const raw = row.details;
      if (!raw) return null;
      if (typeof raw !== 'string') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    const mine = rows
      .map(row => ({ row, details: detailsOf(row) }))
      .filter(({ details }) => String(details?.deptId ?? '') === String(deptId))
      .slice(0, Number(limit) || 100);
    if (mine.length === 0) return [];

    // 操作人详情批量补（同授权流水口径：账号被删也要标出来，不能凭空消失）
    const operatorIds = Array.from(
      new Set(mine.map(({ row }) => Number(row.user_id)).filter(id => Number.isInteger(id) && id > 0))
    );
    const users =
      operatorIds.length === 0
        ? []
        : await getModel('User').findAll({
            where: { id: operatorIds },
            attributes: ['id', 'username', 'email', 'delete_version'],
            paranoid: false,
            raw: true
          });
    const operatorById = new Map(users.map(user => [Number(user.id), user]));

    return mine.map(({ row, details }) => {
      const operator = row.user_id === null ? null : operatorById.get(Number(row.user_id)) || null;
      return {
        id: Number(row.id),
        event: row.event,
        created_at: row.createdAt,
        operator_id: row.user_id === null ? null : Number(row.user_id),
        operator_name: operator?.username ?? null,
        operator_email: operator?.email ?? null,
        operator_deleted: operator ? Number(operator.delete_version) !== 0 : false,
        // 摘要里的 name 是"当时的名字"：部门改名后历史仍然读得懂
        dept_name: details?.name ?? null,
        changes: Array.isArray(details?.changes) ? details.changes : [],
        ip: row.ip || null
      };
    });
  }
}

const deptDao = new DeptDao();

export { DEPT_AUDIT_TYPES, DEPT_EVENTS };
export default deptDao;
