/**
 * 菜单数据访问层（sys_menu / sys_role_menu）
 *
 * 职责边界：
 * - 只做「菜单树」与「角色 → 菜单」的读写，不判定接口权限（那是 PBAC 的事）；
 * - 树形结构在内存里拼装（菜单量级为百级，一次全量查询比递归 SQL 更稳）；
 * - 删除前做引用校验（子菜单 / 角色授权），避免留下孤儿节点。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { getModel } from '../../../framework/persistence/db/index.js';

/**
 * 把扁平菜单列表拼成树
 *
 * 父节点不存在时按根节点处理（数据被人工改动时不至于整棵树消失）。
 *
 * @param {Array<object>} rows 扁平菜单列表（含 parent_id）
 * @returns {Array<object>} 树形菜单
 */
function buildTree(rows) {
  const map = new Map();
  const roots = [];
  for (const row of rows) {
    map.set(Number(row.id), { ...row, children: [] });
  }
  for (const node of map.values()) {
    const parent = map.get(Number(node.parent_id));
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const sortFn = (a, b) => Number(a.sort) - Number(b.sort) || Number(a.id) - Number(b.id);
  const sortDeep = list => {
    list.sort(sortFn);
    for (const item of list) sortDeep(item.children);
  };
  sortDeep(roots);
  return roots;
}

class MenuDao {
  /**
   * 查询全部菜单（扁平）
   *
   * @param {object} [options] 查询选项
   * @param {boolean} [options.onlyEnabled=false] 只取启用的菜单
   * @returns {Promise<Array<object>>} 菜单列表
   */
  async listAll({ onlyEnabled = false } = {}) {
    const where = onlyEnabled ? { status: 1 } : {};
    const rows = await getModel('console.SysMenu').findAll({
      where,
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC']
      ],
      raw: true
    });
    return rows;
  }

  /**
   * 菜单树
   *
   * @param {object} [options] 查询选项
   * @param {boolean} [options.onlyEnabled=false] 只取启用的菜单
   * @returns {Promise<Array<object>>} 树形菜单
   */
  async tree({ onlyEnabled = false } = {}) {
    return buildTree(await this.listAll({ onlyEnabled }));
  }

  /**
   * 某角色已授权的菜单 ID 列表
   *
   * @param {number} roleId 角色 ID
   * @returns {Promise<number[]>} 菜单 ID 数组
   */
  async getRoleMenuIds(roleId) {
    const rows = await getModel('console.SysRoleMenu').findAll({
      where: { role_id: roleId },
      attributes: ['menu_id'],
      raw: true
    });
    return rows.map(r => Number(r.menu_id));
  }

  /**
   * 覆盖式保存角色菜单授权
   *
   * 先删后插在同一事务内完成：菜单授权是「集合语义」，增量对比没有收益，
   * 反而会在并发保存时留下半套授权。
   *
   * @param {number} roleId 角色 ID
   * @param {number[]} menuIds 菜单 ID 数组
   * @returns {Promise<number>} 实际写入的条数
   */
  async setRoleMenus(roleId, menuIds) {
    const SysRoleMenu = getModel('console.SysRoleMenu');
    const ids = Array.from(new Set((menuIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
    const { sequelize } = SysRoleMenu;
    return sequelize.transaction(async t => {
      await SysRoleMenu.destroy({ where: { role_id: roleId }, transaction: t });
      if (ids.length === 0) return 0;
      await SysRoleMenu.bulkCreate(
        ids.map(menuId => ({ role_id: roleId, menu_id: menuId })),
        { transaction: t }
      );
      return ids.length;
    });
  }

  /**
   * 按 ID 查菜单
   *
   * @param {number} id 菜单 ID
   * @returns {Promise<object|null>} 菜单实例
   */
  async findById(id) {
    return getModel('console.SysMenu').findByPk(id);
  }

  /**
   * 创建菜单
   *
   * @param {object} payload 菜单字段
   * @returns {Promise<object>} 新建的菜单实例
   */
  async create(payload) {
    return getModel('console.SysMenu').create(payload);
  }

  /**
   * 更新菜单
   *
   * @param {number} id 菜单 ID
   * @param {object} payload 待更新字段
   * @returns {Promise<boolean>} 是否命中记录
   */
  async update(id, payload) {
    const [affected] = await getModel('console.SysMenu').update(payload, { where: { id } });
    return affected > 0;
  }

  /**
   * 统计子菜单数量（删除前校验）
   *
   * @param {number} id 菜单 ID
   * @returns {Promise<number>} 子菜单数量
   */
  async countChildren(id) {
    return getModel('console.SysMenu').count({ where: { parent_id: id } });
  }

  /**
   * 统计引用该菜单的角色数量（删除前校验）
   *
   * @param {number} id 菜单 ID
   * @returns {Promise<number>} 角色数量
   */
  async countRoleRefs(id) {
    return getModel('console.SysRoleMenu').count({ where: { menu_id: id } });
  }

  /**
   * 删除菜单（含其角色授权）
   *
   * @param {number} id 菜单 ID
   * @returns {Promise<void>}
   */
  async remove(id) {
    const SysRoleMenu = getModel('console.SysRoleMenu');
    const { sequelize } = SysRoleMenu;
    await sequelize.transaction(async t => {
      await SysRoleMenu.destroy({ where: { menu_id: id }, transaction: t });
      await getModel('console.SysMenu').destroy({ where: { id }, transaction: t });
    });
  }
}

const menuDao = new MenuDao();

export default menuDao;
