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
}

const deptDao = new DeptDao();

export default deptDao;
