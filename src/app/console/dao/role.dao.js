/**
 * 角色数据访问层（iam_role / iam_user_role / sys_role_menu）
 *
 * 两套语义在这里并存，边界必须清楚：
 * - **接口放行** = PBAC `policy`（Allow 的 Action 列表），由 `requirePermission` 消费；
 * - **侧栏可见** = `sys_role_menu`，只决定前端菜单树，不参与接口判定。
 *
 * 内置角色（由 `defineRoles` 声明）不可删除、不可降级职级：它们承载着系统自身的
 * 管理入口，删掉等于把后台锁死。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { roleRegistry, actionMetaRegistry } from '../../../framework/security/pbac/index.js';
import { QueryTypes } from 'sequelize';

/**
 * 由权限码数组构造 PBAC 策略文档
 *
 * @param {string[]} permissions 权限码数组（支持 `admin:*` 通配）
 * @returns {object} 策略文档
 */
function buildPolicy(permissions) {
  const actions = Array.from(new Set((permissions || []).filter(p => typeof p === 'string' && p.trim())));
  return {
    Version: '2026-06-06',
    Statement: actions.length > 0 ? [{ Effect: 'Allow', Action: actions }] : []
  };
}

/**
 * 从策略文档提取权限码
 *
 * @param {object} policy 策略文档
 * @returns {string[]} 权限码数组
 */
function extractPermissions(policy) {
  const statements = Array.isArray(policy?.Statement) ? policy.Statement : [];
  const codes = [];
  for (const st of statements) {
    if (st?.Effect !== 'Allow') continue;
    for (const action of st.Action || []) codes.push(action);
  }
  return Array.from(new Set(codes));
}

class RoleDao {
  /**
   * 角色分页（含成员数与已授权菜单）
   *
   * @param {object} params 查询参数
   * @param {number} [params.pageNum=1] 页码
   * @param {number} [params.pageSize=20] 每页条数
   * @param {string} [params.keyword=''] 名称 / 编码模糊搜索
   * @param {string} [params.appId=''] 应用过滤
   * @returns {Promise<{rows: Array<object>, total: number}>} 分页结果
   */
  async page({ pageNum = 1, pageSize = 20, keyword = '', appId = '' }) {
    const { sequelize } = getModel('Role');
    const conditions = ['r.deleted_at IS NULL'];
    const replacements = {};
    if (keyword) {
      conditions.push('(r.name LIKE :keyword OR r.code LIKE :keyword)');
      replacements.keyword = `%${keyword}%`;
    }
    if (appId) {
      conditions.push('r.app_id = :appId');
      replacements.appId = appId;
    }
    const whereSql = `WHERE ${conditions.join(' AND ')}`;

    const total = await sequelize.query(`SELECT COUNT(*) AS c FROM iam_role r ${whereSql}`, {
      type: QueryTypes.SELECT,
      replacements
    });

    replacements.limit = Number(pageSize);
    replacements.offset = (Number(pageNum) - 1) * Number(pageSize);

    const rows = await sequelize.query(
      `SELECT r.id, r.app_id, r.code, r.name, r.rank_level, r.description, r.policy, r.created_at,
              (SELECT COUNT(DISTINCT ur.user_id) FROM iam_user_role ur
                WHERE ur.role_id = r.id AND ur.delete_version = 0) AS user_count
         FROM iam_role r
         ${whereSql}
         ORDER BY r.rank_level DESC, r.id ASC
         LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements }
    );

    const builtinCodes = new Set(roleRegistry.map(r => r.code));
    const menuRows = await sequelize.query('SELECT role_id, menu_id FROM sys_role_menu', { type: QueryTypes.SELECT });
    const menuMap = new Map();
    for (const row of menuRows) {
      const key = Number(row.role_id);
      if (!menuMap.has(key)) menuMap.set(key, []);
      menuMap.get(key).push(Number(row.menu_id));
    }

    return {
      rows: rows.map(r => ({
        ...r,
        rank_level: Number(r.rank_level),
        user_count: Number(r.user_count || 0),
        builtin: builtinCodes.has(r.code),
        permissions: extractPermissions(r.policy),
        menu_ids: menuMap.get(Number(r.id)) || [],
        policy: undefined
      })),
      total: Number(total[0]?.c || 0)
    };
  }

  /**
   * 权限码目录（供角色表单勾选）
   *
   * @returns {Array<object>} 扁平权限列表
   */
  permissionCatalog() {
    const list = [];
    for (const meta of actionMetaRegistry) {
      for (const action of meta.actions || []) {
        list.push({ domain: meta.domain, domainName: meta.name, ...action });
      }
    }
    return list;
  }

  /**
   * 按 ID 查角色
   *
   * @param {number} id 角色 ID
   * @returns {Promise<object|null>} 角色实例
   */
  async findById(id) {
    return getModel('Role').findByPk(id);
  }

  /**
   * 角色编码是否已存在
   *
   * @param {string} code 角色编码
   * @param {string} appId 应用标识
   * @param {number} [excludeId=0] 排除的角色 ID
   * @returns {Promise<boolean>} 是否重复
   */
  async isCodeTaken(code, appId, excludeId = 0) {
    const Role = getModel('Role');
    const { Op } = Role.sequelize.Sequelize;
    const row = await Role.findOne({ where: { code, app_id: appId || 'GLOBAL', id: { [Op.ne]: excludeId } } });
    return !!row;
  }

  /**
   * 创建角色
   *
   * @param {object} payload 角色字段
   * @returns {Promise<object>} 新建的角色实例
   */
  async create({ code, name, appId = 'GLOBAL', rankLevel = 1, description = '', permissions = [] }) {
    return getModel('Role').create({
      code,
      name,
      app_id: appId || 'GLOBAL',
      rank_level: Number(rankLevel) || 1,
      description,
      policy: buildPolicy(permissions)
    });
  }

  /**
   * 更新角色
   *
   * @param {number} id 角色 ID
   * @param {object} payload 待更新字段
   * @returns {Promise<boolean>} 是否命中记录
   */
  async update(id, { name, rankLevel, description, permissions }) {
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (rankLevel !== undefined) patch.rank_level = Number(rankLevel);
    if (description !== undefined) patch.description = description;
    if (Array.isArray(permissions)) patch.policy = buildPolicy(permissions);
    if (Object.keys(patch).length === 0) return true;
    const [affected] = await getModel('Role').update(patch, { where: { id } });
    return affected > 0;
  }

  /**
   * 删除角色（软删除 + 清理菜单授权）
   *
   * @param {number} id 角色 ID
   * @returns {Promise<boolean>} 是否命中记录
   */
  async remove(id) {
    const Role = getModel('Role');
    const role = await Role.findByPk(id);
    if (!role) return false;
    await Role.sequelize.transaction(async t => {
      await getModel('console.SysRoleMenu').destroy({ where: { role_id: id }, transaction: t });
      await Role.destroy({ where: { id }, transaction: t });
    });
    return true;
  }

  /**
   * 权限关系图（用户 → 角色 → 菜单）
   *
   * @param {boolean} [includeUsers=true] 是否包含用户节点（无用户读权限时传 false）
   * @returns {Promise<object>} 图数据
   */
  async graph(includeUsers = true) {
    const { sequelize } = getModel('Role');
    const roles = await sequelize.query(
      `SELECT r.id, r.name, r.code, r.app_id, r.rank_level, r.policy
         FROM iam_role r WHERE r.deleted_at IS NULL ORDER BY r.rank_level DESC, r.id ASC`,
      { type: QueryTypes.SELECT }
    );
    const menus = await sequelize.query(
      'SELECT id, parent_id, name, type, icon, path, permission, sort, visible, status FROM sys_menu ORDER BY sort ASC, id ASC',
      { type: QueryTypes.SELECT }
    );
    const roleMenus = await sequelize.query('SELECT role_id, menu_id FROM sys_role_menu', { type: QueryTypes.SELECT });

    const menuMap = new Map();
    for (const row of roleMenus) {
      const key = Number(row.role_id);
      if (!menuMap.has(key)) menuMap.set(key, []);
      menuMap.get(key).push(Number(row.menu_id));
    }

    let users = [];
    let userRoles = [];
    if (includeUsers) {
      users = await sequelize.query(
        `SELECT u.id, u.username, u.email, u.status, d.name AS dept_name
           FROM user_user u LEFT JOIN sys_dept d ON d.id = u.dept_id
          WHERE u.deleted_at IS NULL ORDER BY u.id DESC LIMIT 200`,
        { type: QueryTypes.SELECT }
      );
      userRoles = await sequelize.query('SELECT user_id, role_id FROM iam_user_role WHERE delete_version = 0', {
        type: QueryTypes.SELECT
      });
    }

    return {
      users,
      roles: roles.map(r => ({
        ...r,
        rank_level: Number(r.rank_level),
        permissions: extractPermissions(r.policy),
        menuIds: menuMap.get(Number(r.id)) || [],
        policy: undefined
      })),
      menus,
      userRoles: userRoles.map(r => [Number(r.user_id), Number(r.role_id)]),
      usersVisible: includeUsers
    };
  }
}

const roleDao = new RoleDao();

export default roleDao;
