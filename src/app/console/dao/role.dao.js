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
 * 归一化策略文档
 *
 * 🔴 `QueryTypes.SELECT` 走的是**原始查询**，MySQL 的 JSON 列回来是**字符串**
 *    （模型查询才会自动 parse）。不先解析就 `Array.isArray(policy.Statement)`
 *    永远是 false —— 表现是「角色列表里权限码一列全是 0」，新建/编辑时填的
 *    权限码看起来"没保存"，其实库里存得好好的。
 *
 * 解析失败返回 null 而不是抛：一条脏数据不该让整个角色列表 500。
 *
 * @param {object|string|null} policy 策略文档（对象或 JSON 字符串）
 * @returns {object|null} 策略对象
 */
function normalizePolicy(policy) {
  if (policy === null || policy === undefined) return null;
  if (typeof policy !== 'string') return policy;
  try {
    return JSON.parse(policy);
  } catch {
    return null;
  }
}

/**
 * 从策略文档提取权限码
 *
 * @param {object|string|null} policy 策略文档（接受字符串，见 normalizePolicy）
 * @returns {string[]} 权限码数组
 */
function extractPermissions(policy) {
  const doc = normalizePolicy(policy);
  const statements = Array.isArray(doc?.Statement) ? doc.Statement : [];
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
    const Role = getModel('Role');
    const { Op } = Role.sequelize.Sequelize;

    const where = {};
    if (keyword) {
      where[Op.or] = [{ name: { [Op.like]: `%${keyword}%` } }, { code: { [Op.like]: `%${keyword}%` } }];
    }
    if (appId) where.app_id = appId;

    const offset = (Number(pageNum) - 1) * Number(pageSize);
    const { rows: roles, count } = await Role.findAndCountAll({
      where,
      attributes: ['id', 'app_id', 'code', 'name', 'rank_level', 'description', 'policy', 'created_at'],
      // rank_level 是「职级越高数字越大」，降序 = 高权限在前
      order: [
        ['rank_level', 'DESC'],
        ['id', 'ASC']
      ],
      offset,
      limit: Number(pageSize)
    });

    const list = roles.map(r => r.get({ plain: true }));
    const roleIds = list.map(r => Number(r.id));

    // 成员数：按 role_id 分组统计（不 JOIN 角色表，避免行放大）
    const [memberRows, menuRows] = await Promise.all([
      roleIds.length > 0
        ? getModel('UserRole').findAll({
            where: { role_id: roleIds, delete_version: 0 },
            attributes: [
              'role_id',
              [Role.sequelize.fn('COUNT', Role.sequelize.fn('DISTINCT', Role.sequelize.col('user_id'))), 'c']
            ],
            group: ['role_id'],
            raw: true
          })
        : [],
      getModel('console.SysRoleMenu').findAll({ attributes: ['role_id', 'menu_id'], raw: true })
    ]);

    const memberMap = new Map(memberRows.map(r => [Number(r.role_id), Number(r.c || 0)]));
    const builtinCodes = new Set(roleRegistry.map(r => r.code));
    const menuMap = new Map();
    for (const row of menuRows) {
      const key = Number(row.role_id);
      if (!menuMap.has(key)) menuMap.set(key, []);
      menuMap.get(key).push(Number(row.menu_id));
    }

    return {
      rows: list.map(r => ({
        ...r,
        rank_level: Number(r.rank_level),
        user_count: memberMap.get(Number(r.id)) || 0,
        builtin: builtinCodes.has(r.code),
        permissions: extractPermissions(r.policy),
        menu_ids: menuMap.get(Number(r.id)) || [],
        policy: undefined
      })),
      total: Number(count || 0)
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
   * 给定角色集合里，是否仍有任何一个具备「管理后台」能力
   *
   * 判据：policy 的 Allow Action 中出现 `*` 或以 `admin:` 开头的码。
   * 用途：防**自锁** —— 管理员把自己最后一个管理角色摘掉后，下一次请求就会 403，
   * 而他自己已经没有权限再改回来（只能直连数据库或找另一个管理员）。
   *
   * @param {number[]} roleIds 待保存的角色 ID 数组
   * @returns {Promise<boolean>} 是否仍具备管理能力
   */
  async hasAdminCapability(roleIds) {
    const ids = Array.from(new Set((roleIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
    if (ids.length === 0) return false;
    // Role 是 paranoid 模型，已删除的自动排除；policy 走 JSON 字段，extractPermissions
    // 同时兼容对象与字符串（raw 查询历史返回的是字符串）
    const roles = await getModel('Role').findAll({ where: { id: ids }, attributes: ['policy'], raw: true });
    return roles.some(row => extractPermissions(row.policy).some(code => code === '*' || code.startsWith('admin:')));
  }

  /**
   * 角色 id → 权限码列表
   *
   * 「当前生效的权限」要把角色翻译成权限码展示，而 policy 的解析口径只能有一份
   * （`extractPermissions` 处理 JSON 字符串与对象两种形态）。这里把它暴露出来，
   * 避免调用方各写一遍解析。
   *
   * @param {number[]} roleIds 角色 ID
   * @returns {Promise<Map<number, {code: string, name: string, appId: string, rank: number, permissions: string[]}>>}
   */
  async detailMap(roleIds) {
    const ids = Array.from(new Set((roleIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
    const map = new Map();
    if (ids.length === 0) return map;
    const rows = await getModel('Role').findAll({
      where: { id: ids },
      attributes: ['id', 'code', 'name', 'app_id', 'rank_level', 'policy'],
      raw: true
    });
    for (const row of rows) {
      map.set(Number(row.id), {
        code: row.code,
        name: row.name,
        appId: row.app_id,
        rank: Number(row.rank_level) || 0,
        permissions: extractPermissions(row.policy)
      });
    }
    return map;
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
    const [roles, menus, roleMenus] = await Promise.all([
      getModel('Role').findAll({
        attributes: ['id', 'name', 'code', 'app_id', 'rank_level', 'policy'],
        order: [
          ['rank_level', 'DESC'],
          ['id', 'ASC']
        ],
        raw: true
      }),
      getModel('console.SysMenu').findAll({
        attributes: ['id', 'parent_id', 'name', 'type', 'icon', 'path', 'permission', 'sort', 'visible', 'status'],
        order: [
          ['sort', 'ASC'],
          ['id', 'ASC']
        ],
        raw: true
      }),
      getModel('console.SysRoleMenu').findAll({ attributes: ['role_id', 'menu_id'], raw: true })
    ]);

    const menuMap = new Map();
    for (const row of roleMenus) {
      const key = Number(row.role_id);
      if (!menuMap.has(key)) menuMap.set(key, []);
      menuMap.get(key).push(Number(row.menu_id));
    }

    let users = [];
    let userRoles = [];
    if (includeUsers) {
      const userRows = await getModel('User').findAll({
        attributes: ['id', 'username', 'email', 'status', 'dept_id'],
        order: [['id', 'DESC']],
        limit: 200,
        raw: true
      });
      // 部门名单独批量取（不 JOIN：console.* 模型不给 user 域挂关联）
      const deptIds = Array.from(
        new Set(
          userRows
            .map(u => u.dept_id)
            .filter(v => v !== null && v !== undefined)
            .map(Number)
        )
      );
      const depts =
        deptIds.length > 0
          ? await getModel('console.SysDept').findAll({ where: { id: deptIds }, attributes: ['id', 'name'], raw: true })
          : [];
      const deptNameOf = new Map(depts.map(d => [Number(d.id), d.name]));
      users = userRows.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        status: u.status,
        dept_name: u.dept_id ? deptNameOf.get(Number(u.dept_id)) || null : null
      }));

      const links = await getModel('UserRole').findAll({
        where: { delete_version: 0 },
        attributes: ['user_id', 'role_id'],
        raw: true
      });
      userRoles = links;
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
