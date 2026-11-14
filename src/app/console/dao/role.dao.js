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
 * 菜单授权唯一被锁的角色
 *
 * 与「内置（builtin）」是两件事，别混：
 * - `builtin` = 由代码 `defineRoles` 声明 ⇒ 不可删除、不可改 code、不可改权限码；
 *   本仓几乎所有角色都满足（每个 app 都声明了自己的角色）。
 * - **菜单可见性**是纯运行期数据（`sys_role_menu`），除超管外都该允许管理员调整 ——
 *   否则矩阵里一列都点不动，运维只能去改代码。
 *
 * 超管必须锁：它的 policy 是 `admin:*` 全量，勾掉菜单会让它自己看不到后台入口，
 * 而没有任何其他账号能改回来。
 */
const MENU_LOCKED_CODE = 'superadmin';

/**
 * 数据范围归一化
 *
 * 只认 1..5，其它一律回落 1（全部）。方向要清楚：写脏值时宁可"少限制"也不能
 * "意外限制住自己人" —— 后者会让管理员突然看不到数据，且很难定位原因。
 *
 * @param {unknown} value 原始值
 * @returns {number} 1..5
 */
function normalizeScope(value) {
  const n = Number(value);
  return n >= 1 && n <= 5 ? n : 1;
}

/**
 * 受保护角色编码集合（不可删除 / 不可改 code / 不可改权限码）
 *
 * = 由代码 `defineRoles` 声明的角色 ∪ 超管。
 *
 * 🔴 **超管必须显式补进来**：它由 `scripts/setup-superadmin.js` 直接落库，
 *    *不在* `roleRegistry` 里。曾经只有路由层（`api/admin/console/v1/roles.js`
 *    的 `BUILTIN_CODES`）补了这一点，而列表返回给前端的 `builtin` 却按 registry 算 ——
 *    同一个概念两套判据，结果前端把超管当普通角色：显示「删除」按钮、
 *    允许进编辑弹窗改权限码，点了才被后端以 `BUILTIN_PROTECTED` 拒掉。
 *    现在两边都走这里，只有一个真相。
 *
 * @returns {Set<string>} 受保护编码
 */
function protectedRoleCodes() {
  return new Set([...roleRegistry.map(r => r.code), MENU_LOCKED_CODE]);
}

/**
 * 单个编码是否受保护
 *
 * @param {string} code 角色编码
 * @returns {boolean} 是否受保护
 */
function isProtectedRoleCode(code) {
  const value = String(code || '');
  return value === MENU_LOCKED_CODE || roleRegistry.some(r => r.code === value);
}

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
/**
 * 从 policy 文档里取出**生效的允许码**
 *
 * 只收 `Effect: 'Allow'` 的 Action；`Deny` 不进这个集合（它是"减项"，不是能力）。
 * 当前角色策略只写 Allow，但个人内联策略支持 Deny —— 读侧别假设一定没有。
 *
 * @param {object|string|null} policy 策略文档（库里的 JSON 列可能是字符串）
 * @returns {string[]} 权限码（去重）
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
    // 超管也算内置（见 protectedRoleCodes 的说明）
    const builtinCodes = protectedRoleCodes();

    // 自定义数据范围的部门集合：一次查完再分组，不做 N+1
    const deptRows = await getModel('RoleDept').findAll({ attributes: ['role_id', 'dept_id'], raw: true });
    const deptMap = new Map();
    for (const row of deptRows) {
      const key = Number(row.role_id);
      if (!deptMap.has(key)) deptMap.set(key, []);
      deptMap.get(key).push(Number(row.dept_id));
    }
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
        // 菜单授权锁：只有超管（见文件头 MENU_LOCKED_CODE 的说明）
        menuLocked: r.code === MENU_LOCKED_CODE,
        permissions: extractPermissions(r.policy),
        data_scope: Number(r.data_scope || 1),
        // 只有「自定义」档才有意义，其它档一律给空数组，前端不用自己判
        dept_ids: Number(r.data_scope) === 2 ? deptMap.get(Number(r.id)) || [] : [],
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
  async create({
    code,
    name,
    appId = 'GLOBAL',
    rankLevel = 1,
    description = '',
    permissions = [],
    dataScope = 1,
    deptIds = []
  }) {
    const role = await getModel('Role').create({
      code,
      name,
      app_id: appId || 'GLOBAL',
      rank_level: Number(rankLevel) || 1,
      description,
      data_scope: normalizeScope(dataScope),
      policy: buildPolicy(permissions)
    });
    await this.setRoleDepts(role.id, dataScope, deptIds);
    return role;
  }

  /**
   * 更新角色
   *
   * @param {number} id 角色 ID
   * @param {object} payload 待更新字段
   * @returns {Promise<boolean>} 是否命中记录
   */
  async update(id, { name, rankLevel, description, permissions, dataScope, deptIds }) {
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (rankLevel !== undefined) patch.rank_level = Number(rankLevel);
    if (description !== undefined) patch.description = description;
    if (Array.isArray(permissions)) patch.policy = buildPolicy(permissions);
    if (dataScope !== undefined) patch.data_scope = normalizeScope(dataScope);
    if (Object.keys(patch).length > 0) {
      await getModel('Role').update(patch, { where: { id } });
    }
    // 数据范围改成非「自定义」时，关联表必须清空 —— 留着旧部门会在下次切回自定义时诈尸
    if (dataScope !== undefined || Array.isArray(deptIds)) {
      await this.setRoleDepts(id, dataScope ?? patch.data_scope ?? 1, deptIds);
    }
    return true;
  }

  /**
   * 覆盖式保存「自定义数据范围」的部门集合
   *
   * @param {number} roleId 角色 ID
   * @param {number} dataScope 数据范围
   * @param {number[]} deptIds 部门 ID 列表
   * @returns {Promise<number>} 写入条数
   */
  async setRoleDepts(roleId, dataScope, deptIds = []) {
    const RoleDept = getModel('RoleDept');
    const { sequelize } = RoleDept;
    return sequelize.transaction(async t => {
      await RoleDept.destroy({ where: { role_id: Number(roleId) }, transaction: t });
      // 只有"自定义"才有关联部门；其余档位留空表，避免旧数据在切回自定义时复活
      if (normalizeScope(dataScope) !== 2) return 0;
      const ids = Array.from(new Set((deptIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
      if (ids.length === 0) return 0;
      await RoleDept.bulkCreate(
        ids.map(deptId => ({ role_id: Number(roleId), dept_id: deptId })),
        { transaction: t }
      );
      return ids.length;
    });
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

export { MENU_LOCKED_CODE, isProtectedRoleCode, protectedRoleCodes, extractPermissions };
export default roleDao;
