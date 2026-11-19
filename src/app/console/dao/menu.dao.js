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
   * @param {string|null} [options.appId=null] 只取某个应用的菜单（null = 全部应用）
   * @returns {Promise<Array<object>>} 菜单列表
   */
  async listAll({ onlyEnabled = false, appId = null } = {}) {
    const where = onlyEnabled ? { status: 1 } : {};
    // 应用过滤必须在这里做：树是在内存里拼的，先取全表再过滤会留下"父级不在本应用"的孤儿行
    if (appId) where.app_id = appId;
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
   * @param {string|null} [options.appId=null] 只取某个应用的菜单
   * @returns {Promise<Array<object>>} 树形菜单
   */
  async tree({ onlyEnabled = false, appId = null } = {}) {
    return buildTree(await this.listAll({ onlyEnabled, appId }));
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
    const ids = new Set((menuIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0));

    const all = await getModel('console.SysMenu').findAll({ attributes: ['id', 'parent_id'], raw: true });
    const parentOf = new Map(all.map(m => [Number(m.id), Number(m.parent_id)]));
    /** 子节点表：级联取消时要往下走 */
    const childrenOf = new Map();
    for (const [id, parent] of parentOf) {
      if (!Number.isInteger(parent) || parent <= 0) continue;
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent).push(id);
    }
    /** 某节点的全部后代 */
    const descendantsOf = rootId => {
      const out = [];
      const stack = [...(childrenOf.get(Number(rootId)) ?? [])];
      while (stack.length > 0) {
        const id = stack.pop();
        out.push(id);
        for (const child of childrenOf.get(id) ?? []) stack.push(child);
      }
      return out;
    };

    /*
     * 级联取消：显式取消一个节点时，连它的后代一起取消。
     *
     * 为什么必须有这一步（真实故障）：角色原有授权里可能残留着一批"界面上根本看不见"
     * 的按钮（角色 policy 里没有对应权限码，弹窗按 21 项隐藏处理），它们在库里仍是
     * 授权状态。管理员取消「用户管理」页面时只删掉了可见的那几个 id，隐藏按钮留在
     * 提交集合里 —— 紧接着下面"补齐祖先"又把「用户管理」原样补回去，
     * 表现就是"取消勾选 → 保存 → 刷新又勾上"，而且权限实际没被收回。
     *
     * 语义上"取消页面"就等于"取消它下面的一切"，所以先向下清干净，再向上补。
     */
    if (ids.size > 0) {
      const before = new Set(await this.getRoleMenuIds(roleId));
      for (const id of before) {
        if (ids.has(id)) continue; // 仍授权，跳过
        for (const descendant of descendantsOf(id)) ids.delete(descendant);
      }
    }

    /*
     * 补齐祖先：只授权"按钮"而不授权它所在的页面/目录时，侧栏根本渲染不出那一条，
     * 等于这次授权没生效 —— 前端弹窗已有级联，这里再兜一次，因为直接调接口
     * （脚本、旧客户端、别的页面）同样要满足这个不变式。
     *
     * 只向上补，不向下展开：给页面授权而保留按钮不显示是合法状态。
     */
    for (const id of [...ids]) {
      let parent = parentOf.get(id);
      while (Number.isInteger(parent) && parent > 0 && !ids.has(parent)) {
        ids.add(parent);
        parent = parentOf.get(parent);
      }
    }

    const list = [...ids];
    const { sequelize } = SysRoleMenu;
    return sequelize.transaction(async t => {
      await SysRoleMenu.destroy({ where: { role_id: roleId }, transaction: t });
      if (list.length === 0) return 0;
      await SysRoleMenu.bulkCreate(
        list.map(menuId => ({ role_id: roleId, menu_id: menuId })),
        { transaction: t }
      );
      return list.length;
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
   * 把新按钮授权给「已拥有其上级页面」的角色
   *
   * 为什么自动做这一步：按钮型权限一旦存在，前端就要求"被授权才显示"，
   * 新增一个按钮却不授权，会让本来能用的角色突然看不到按钮 —— 看起来像功能坏了。
   * 继承上级页面的授权是唯一没有歧义的选择（能看到页面的人，本来就能看到它原有的按钮）。
   *
   * @param {number} menuId 新按钮 ID
   * @param {number} parentId 上级菜单（页面）ID
   * @returns {Promise<number>} 继承到的角色数
   */
  async grantToRolesHaving(menuId, parentId) {
    const SysRoleMenu = getModel('console.SysRoleMenu');
    const rows = await SysRoleMenu.findAll({
      where: { menu_id: Number(parentId) },
      attributes: ['role_id'],
      raw: true
    });
    const roleIds = [...new Set(rows.map(row => Number(row.role_id)))].filter(id => Number.isInteger(id) && id > 0);
    if (roleIds.length === 0) return 0;
    await SysRoleMenu.bulkCreate(
      roleIds.map(roleId => ({ role_id: roleId, menu_id: Number(menuId) })),
      { ignoreDuplicates: true }
    );
    return roleIds.length;
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
