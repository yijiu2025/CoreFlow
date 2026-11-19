/**
 * 用户数据访问层（管理后台视角）
 *
 * 与 `app/user` 的区别：
 * - 本层面向**管理端列表与维护**，带部门 / 角色 / 岗位聚合列，字段一律脱敏（不返回手机号密文）；
 * - 创建用户走管理端语义：明文密码 → 服务端哈希（不经前端加密链路，管理端本身就是可信输入）；
 * - 删除走模型软删除（`paranoid`），并同时清理角色 / 岗位关联，避免留下悬空引用。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { getDeclaredDefaultRole, NORMAL_RANK_MAX } from '../../../framework/security/pbac/index.js';
import grantDao from './grant.dao.js';
import { hashPassword, validatePasswordStrength } from '../../../framework/security/auth/index.js';
import { mergeAppScopes } from '../services/data-scope.service.js';

/**
 * 超管角色编码
 *
 * 🔴 与 `role.dao.js` 的 `MENU_LOCKED_CODE`、`access-scope.service.js` 的
 *    `SUPER_ROLE_CODE` 同值（三处都表达"这个角色普通管理员动不了"），改动必须同步。
 *    这里单独用它做**筛选补集**：超管是 GLOBAL 角色、不归属任何应用，
 *    但它在每个应用里都有全部权限（policy 为 `*`）。
 */
const SUPER_ROLE_CODE = 'superadmin';

/**
 * 用过「含某段设备码」的所有用户
 *
 * 设备码在 `SessionToken.device_id` 上（一个用户可能多端、一台设备可能多账号），
 * 所以要先换算成 user_id 集合，再落到 users 的 where 上。
 *
 * 🔴 `LIKE '%片段%'` 用不上 device_id 的普通索引（前导通配符），是全表扫。会话表规模
 *    在万级以内、且这是低频的"找人"操作，可以接受；真要更快就得上倒排/前缀表。
 *
 * @param {string} fragment 设备码片段
 * @returns {Promise<number[]>} 去重后的用户 ID（空数组表示没有账号用过这台设备）
 */
async function userIdsByDevice(fragment) {
  const SessionToken = getModel('SessionToken');
  const { Op } = SessionToken.sequelize.Sequelize;
  const rows = await SessionToken.findAll({
    where: { device_id: { [Op.like]: `%${fragment}%` } },
    attributes: ['user_id'],
    raw: true
  });
  return [...new Set(rows.map(r => Number(r.user_id)))];
}

class ConsoleUserDao {
  /**
   * 用户分页（含部门 / 角色 / 岗位）
   *
   * @param {object} params 查询参数
   * @param {number} [params.pageNum=1] 页码
   * @param {number} [params.pageSize=20] 每页条数
   * @param {string} [params.keyword=''] 账号 / 邮箱 / 设备码模糊搜索（三者任一命中）
   * @param {number|null} [params.deptId=null] 部门过滤
   * @param {number|null} [params.status=null] 状态过滤
   * @param {string|null} [params.appId=null] 子应用过滤（该应用里有角色的人 + 超管）
   * @returns {Promise<{rows: Array<object>, total: number}>} 分页结果
   */
  async page({
    pageNum = 1,
    pageSize = 20,
    keyword = '',
    deptId = null,
    status = null,
    appId = null,
    deviceId = '',
    scopeAppIds = null,
    /**
     * 操作者职级：**不用于过滤行，只用于算每行的 `manageable`**
     *
     * 2026-11-19 起「低职级看不到高职级」作废：看得见是管理台的常态
     * （"搜不到人"比"看得到动不了"更让人困惑），限制改到**操作**上。
     * `null` = 不限制（超管 / 脚本调用），此时所有行都可操作。
     */
    actorRank = null,
    dataScope = null
  }) {
    const User = getModel('User');
    const { Op } = User.sequelize.Sequelize;

    const where = {};
    if (keyword) {
      /*
       * 一个关键词搜三样：账号 / 邮箱 / 设备码。
       *
       * 设备码不在 users 表上（它在 SessionToken.device_id），先查出"用过含这段码的设备"
       * 的 user_id，再作为 OR 的一支。这样列表只要一个输入框 —— 用户并不知道自己想搜的
       * 是"某个人"还是"某台机器"，逼他先选一个框只会让人猜错。
       *
       * 与 `deviceId` 参数的区别：`deviceId` 是**必须命中设备**（AND，精确排查某台机器）；
       * `keyword` 是**任一项命中**（OR）。两者同时给时取交集，正好是"先按设备锁定、再按名字缩小"。
       */
      const deviceUserIds = await userIdsByDevice(keyword);
      const or = [{ username: { [Op.like]: `%${keyword}%` } }, { email: { [Op.like]: `%${keyword}%` } }];
      if (deviceUserIds.length) or.push({ id: { [Op.in]: deviceUserIds } });
      where[Op.or] = or;
    }
    if (deptId !== null && deptId !== undefined && deptId !== '') where.dept_id = Number(deptId);

    /*
     * 行级数据范围（数据权限）
     *
     * 与上面的 `deptId` 是两件事：`deptId` 是**用户主动筛**，`dataScope` 是**角色强制的可见边界**。
     * 两者都落到 where 上，天然取交集：即使前端传了一个越权的 deptId，也只能在
     * 自己范围内再筛一次，不会突破边界。
     */
    if (dataScope && dataScope.mode !== 'all') {
      if (dataScope.mode === 'self') {
        where.id = Number(dataScope.actorId);
      } else {
        const ids = (dataScope.deptIds ?? []).filter(n => Number.isInteger(n) && n > 0);
        where.dept_id = ids.length > 0 ? { [Op.in]: ids } : { [Op.in]: [-1] };
      }
    }

    /**
     * 叠加一层「可见用户 ID」限制
     *
     * 数据范围 self、待注销、应用域、子应用筛选都可能落到 `where.id`：直接赋值会让
     * 后一个覆盖前一个（曾经"待注销 + 应用域"就只剩后者生效）。这里统一取交集；
     * 交集为空写成 `IN (-1)`（恒不命中），比提前 return 少一条分支、也不会漏改。
     *
     * @param {number[]} ids 目标用户 ID
     * @returns {void}
     */
    const restrictToUserIds = ids => {
      const next = [...new Set(ids.map(Number).filter(n => Number.isInteger(n) && n > 0))];
      const existing = where.id?.[Op.in];
      let merged = next;
      if (Array.isArray(existing)) merged = next.filter(id => existing.includes(id));
      else if (typeof existing === 'number') merged = next.filter(id => id === existing);
      where.id = { [Op.in]: merged.length > 0 ? merged : [-1] };
    };

    /*
     * 状态过滤
     *
     * 🔴 `-2`（待注销）**不是 `User.status` 的取值**。`status` 只有 1 正常 / 0 冻结 /
     *    -1 已注销；"待注销"是注销申请单（`user_deactivation.status = 1` 注销中）的
     *    派生状态。以前直接把 -2 丢进 `where.status`，SQL 条件恒不成立，于是选「待注销」
     *    永远返回空 —— 看起来像筛选坏了，其实是拿错了字段。
     *
     * 申请单与用户是两道事实，必须单独查一次再取交集；和下面的应用域过滤一样，
     * 交集要在**分页之前**落到 where 上，否则总数与页大小都会失真。
     */
    const PENDING_DELETION = -2;
    const wantedStatus = status !== null && status !== undefined && status !== '' ? Number(status) : null;
    if (wantedStatus !== null && wantedStatus !== PENDING_DELETION) where.status = wantedStatus;

    if (wantedStatus === PENDING_DELETION) {
      const rows = await getModel('user.UserDeactivation').findAll({
        where: { status: 1 },
        attributes: ['user_id'],
        raw: true
      });
      const pendingIds = [...new Set(rows.map(r => Number(r.user_id)))];
      if (pendingIds.length === 0) return { rows: [], total: 0 };
      restrictToUserIds(pendingIds);
    }

    /*
     * 按设备码找人
     *
     * 设备码在 `session_tokens.device_id`（会话的 DB 兜底记录），不在用户表 ——
     * 一个设备可能登过多个账号、一个账号也有多台设备，所以这条路必须落到
     * "哪些用户用过这台设备"，再与其它条件取交集。
     *
     * 🔴 **不看 `revoked`**：排查"这台设备都登过谁"时，历史会话才是线索；
     *    只留未撤销的，等于只能看到"此刻还登着的那个人"。
     * 🔴 同样要在**分页之前**落到 where（走 restrictToUserIds），否则总数与页大小失真。
     */
    if (deviceId) {
      // restrictToUserIds 在交集为空时写 `IN (-1)`（恒不命中），这里不必再提前 return
      restrictToUserIds(await userIdsByDevice(deviceId));
    }

    /*
     * 应用域过滤（"只能管理注册了本应用的用户"）。
     *
     * 必须在**分页之前**落到 where 上：先取一页再在内存里筛，页大小与总数都会失真
     * （用户看到"第 1/3 页"但每页只剩两条）。`scopeAppIds = null` = 不限（超管 /
     * 跨应用管理员），空数组 = 一个也没有。
     *
     * 两步主键查询（角色 → 关联）而不是 JOIN：`User` 属 user 域、`Role` 属 iam 域，
     * 跨域挂 association 会耦合两个 app 的模型（同本文件其余聚合列的口径）。
     */
    /*
     * 数据范围的**应用维度**（`iam_role_app`）与角色应用域取交集。
     *
     * 两者语义不同：`scopeAppIds` 是"我有角色、因此能管"的动作域；
     * `dataScope.appIds` 是角色上配置的"只准看这些应用的账号"。都配了就听更严的那个
     * —— 交集为空即"一条也看不到"，而不是退回不限。
     */
    const effectiveAppIds = mergeAppScopes(scopeAppIds, dataScope?.appIds ?? null);

    if (Array.isArray(effectiveAppIds)) {
      const scopedRoleIds = (
        await getModel('Role').findAll({ where: { app_id: effectiveAppIds }, attributes: ['id'], raw: true })
      ).map(r => Number(r.id));
      if (scopedRoleIds.length === 0) return { rows: [], total: 0 };

      const scopedUserIds = [
        ...new Set(
          (
            await getModel('UserRole').findAll({
              where: { role_id: scopedRoleIds, delete_version: 0 },
              attributes: ['user_id'],
              raw: true
            })
          ).map(l => Number(l.user_id))
        )
      ];
      if (scopedUserIds.length === 0) return { rows: [], total: 0 };
      restrictToUserIds(scopedUserIds);
    }

    /*
     * 子应用筛选：只看「在这个应用里有角色」的用户。
     *
     * 与应用域是两件事：应用域是**权限边界**（不可越过），这里是管理员主动收窄的
     * **查询条件**（"看看 posecraft 的人"）。两者都落到 where.id 上取交集 ——
     * 越权传别家 appId 时交集自然为空，不需要再加一层判权。
     *
     * `GLOBAL` 角色不归属任何应用，因此不参与：选具体应用时不该把"只有全局角色"
     * 的人混进来（想看他们就不选应用）。
     */
    if (appId) {
      /*
       * 该应用的角色 + **超管**。
       *
       * 🔴 只补超管、不补全部 GLOBAL 角色：超管是 GLOBAL 角色、不归属任何应用，
       *    但它在每个应用里都有全部权限 —— 只按 `app_id` 取角色的话，管理员筛
       *    「管理后台」会看不见自己（他只有 GLOBAL 的 superadmin），看起来像数据丢了。
       *    而 GLOBAL 的会员等级类角色（普通用户/VIP）不该被任何应用筛选带出来，
       *    否则"按应用查"等于全表。
       */
      const [appRoleRows, superRoleRows] = await Promise.all([
        getModel('Role').findAll({ where: { app_id: appId }, attributes: ['id'], raw: true }),
        getModel('Role').findAll({ where: { code: SUPER_ROLE_CODE }, attributes: ['id'], raw: true })
      ]);
      const roleIds = [...new Set([...appRoleRows, ...superRoleRows].map(r => Number(r.id)))];
      if (roleIds.length === 0) return { rows: [], total: 0 };

      const appUserIds = [
        ...new Set(
          (
            await getModel('UserRole').findAll({
              where: { role_id: roleIds, delete_version: 0 },
              attributes: ['user_id'],
              raw: true
            })
          ).map(l => Number(l.user_id))
        )
      ];
      if (appUserIds.length === 0) return { rows: [], total: 0 };
      restrictToUserIds(appUserIds);
    }

    const offset = (Number(pageNum) - 1) * Number(pageSize);
    const { rows: users, count } = await User.findAndCountAll({
      where,
      attributes: ['id', 'uid', 'username', 'email', 'avatar', 'status', 'dept_id', 'rank_level', 'created_at'],
      order: [['id', 'DESC']],
      offset,
      limit: Number(pageSize)
    });

    const list = users.map(u => u.get({ plain: true }));
    const userIds = list.map(u => Number(u.id));

    // 部门 / 角色 / 岗位各自批量取，**不用 JOIN 也不挂跨域关联**：
    // `console.*` 模型不属于 user 域，给它挂 association 会让两个 app 的模型互相耦合。
    // 三次 IN 查询（每页 ≤200 行）比一条带四个子查询的 SQL 更好维护，也没有 N+1。
    const [deptNames, roleInfo, postInfo] = await Promise.all([
      this._deptNameMap(list.map(u => u.dept_id)),
      this._roleInfoMap(userIds),
      this._postInfoMap(userIds)
    ]);

    const rows = list.map(u => {
      const roles = roleInfo.get(Number(u.id)) || { ids: [], names: [] };
      const posts = postInfo.get(Number(u.id)) || { ids: [], names: [] };
      const rankLevel = Number(u.rank_level) || 0;
      /*
       * 可操作性由**职级**决定（不是可见性）：
       * `actorRank` 为空 = 超管 / 脚本，全部可操作；否则必须严格高于目标职级。
       * 同职级不能互相管理 —— 与 `assertCanManageUser` 的 `>=` 判据同源。
       */
      const manageable = actorRank === null || actorRank === undefined || actorRank > rankLevel;
      return {
        ...u,
        rank_level: rankLevel,
        manageable,
        dept_name: u.dept_id ? deptNames.get(Number(u.dept_id)) || null : null,
        role_names: roles.names.length > 0 ? roles.names.join(',') : null,
        post_names: posts.names.length > 0 ? posts.names.join(',') : null,
        // 表单回填用 ID：名字会重名 / 可改名 / 可能含逗号，反查必错
        role_ids: roles.ids.length > 0 ? roles.ids.join(',') : null,
        post_ids: posts.ids.length > 0 ? posts.ids.join(',') : null
      };
    });

    return { rows, total: Number(count || 0) };
  }

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
  }

  /**
   * 用户 → 角色（id 与名称，按 role_id 升序，与原 GROUP_CONCAT 顺序一致）
   *
   * @param {number[]} userIds 用户 ID 列表
   * @returns {Promise<Map<number, {ids: number[], names: string[]}>>} 用户 ID → 角色信息
   */
  async _roleInfoMap(userIds) {
    const map = new Map();
    if (!userIds || userIds.length === 0) return map;

    const links = await getModel('UserRole').findAll({
      where: { user_id: userIds, delete_version: 0 },
      attributes: ['user_id', 'role_id'],
      raw: true
    });
    if (links.length === 0) return map;

    const roleIds = Array.from(new Set(links.map(l => Number(l.role_id))));
    const roles = await getModel('Role').findAll({
      where: { id: roleIds },
      attributes: ['id', 'name'],
      raw: true
    });
    const nameOf = new Map(roles.map(r => [Number(r.id), r.name]));

    const byUser = new Map();
    for (const link of links) {
      const uid = Number(link.user_id);
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(Number(link.role_id));
    }
    for (const [uid, ids] of byUser) {
      const sorted = ids.slice().sort((a, b) => a - b);
      map.set(uid, {
        ids: sorted,
        names: sorted.map(id => nameOf.get(id)).filter(Boolean)
      });
    }
    return map;
  }

  /**
   * 用户 → 岗位（id 与名称，按 post_id 升序）
   *
   * @param {number[]} userIds 用户 ID 列表
   * @returns {Promise<Map<number, {ids: number[], names: string[]}>>} 用户 ID → 岗位信息
   */
  async _postInfoMap(userIds) {
    const map = new Map();
    if (!userIds || userIds.length === 0) return map;

    const links = await getModel('console.SysUserPost').findAll({
      where: { user_id: userIds },
      attributes: ['user_id', 'post_id'],
      raw: true
    });
    if (links.length === 0) return map;

    const postIds = Array.from(new Set(links.map(l => Number(l.post_id))));
    const posts = await getModel('console.SysPost').findAll({
      where: { id: postIds },
      attributes: ['id', 'post_name'],
      raw: true
    });
    const nameOf = new Map(posts.map(p => [Number(p.id), p.post_name]));

    const byUser = new Map();
    for (const link of links) {
      const uid = Number(link.user_id);
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(Number(link.post_id));
    }
    for (const [uid, ids] of byUser) {
      const sorted = ids.slice().sort((a, b) => a - b);
      map.set(uid, {
        ids: sorted,
        names: sorted.map(id => nameOf.get(id)).filter(Boolean)
      });
    }
    return map;
  }

  /**
   * 管理端下拉选项（部门树 / 角色 / 岗位 / 默认初始密码提示）
   *
   * @returns {Promise<{depts: Array<object>, roles: Array<object>, posts: Array<object>}>} 选项集合
   */
  async options() {
    const [depts, roles, posts] = await Promise.all([
      getModel('console.SysDept').findAll({
        where: { status: 1 },
        attributes: ['id', 'parent_id', 'name'],
        order: [
          ['sort', 'ASC'],
          ['id', 'ASC']
        ],
        raw: true
      }),
      // Role 是 paranoid 模型，已删除的对自动排除（不用手写 deleted_at IS NULL）
      getModel('Role').findAll({
        attributes: ['id', 'code', 'name', 'app_id', 'rank_level'],
        order: [
          ['rank_level', 'DESC'],
          ['id', 'ASC']
        ],
        raw: true
      }),
      getModel('console.SysPost').findAll({
        where: { status: 1 },
        attributes: ['id', 'post_code', 'post_name'],
        order: [
          ['sort', 'ASC'],
          ['id', 'ASC']
        ],
        raw: true
      })
    ]);
    return { depts, roles, posts };
  }

  /**
   * 按内部 ID 查用户
   *
   * @param {number} id 用户内部 ID
   * @returns {Promise<object|null>} 用户实例
   */
  async findById(id) {
    return getModel('User').findByPk(id);
  }

  /**
   * 邮箱是否已被占用
   *
   * @param {string} email 邮箱
   * @param {number} [excludeId=0] 排除的用户 ID
   * @returns {Promise<boolean>} 是否重复
   */
  /**
   * 按**全局 uid** 取用户（会话里只有 uid，没有内部 id）
   *
   * `/session/*` 系列接口都从 `request.state.user.uid` 出发，原先各自
   * `getModel('User').findOne({ where: { uid } })` 写了四遍 —— 字段口径一旦不同，
   * "同一个账号在不同接口里取到的列不一样"这种问题很难查。
   *
   * @param {string} uid 全局唯一标识
   * @param {string[]} [attributes] 需要的列
   * @returns {Promise<object|null>} 原始行
   */
  async findByUid(uid, attributes = ['id']) {
    const key = String(uid || '').trim();
    if (!key) return null;
    return getModel('User').findOne({ where: { uid: key }, attributes, raw: true });
  }

  /**
   * 取该用户的密码凭证
   *
   * @param {number} userId 用户内部 ID
   * @returns {Promise<object|null>} `{ id, credential }` 或 null
   */
  async findPasswordIdentity(userId) {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return null;
    return getModel('UserIdentity').findOne({
      where: { user_id: id, identity_type: 'password' },
      attributes: ['id', 'credential'],
      raw: true
    });
  }

  /**
   * 覆盖密码凭证
   *
   * 🔴 哈希由调用方算（scrypt 是 CPU 密集操作，不该占着 DAO 的连接上下文）。
   *
   * @param {number} identityId 凭证行 ID
   * @param {string} hashed 已哈希的新凭证
   * @returns {Promise<boolean>} 是否命中记录
   */
  async updatePasswordIdentity(identityId, hashed) {
    const id = Number(identityId);
    if (!Number.isInteger(id) || id <= 0) return false;
    const [affected] = await getModel('UserIdentity').update({ credential: hashed }, { where: { id } });
    return affected > 0;
  }

  /**
   * 按 ID 取用户的部分字段快照（`raw`）
   *
   * 审计 / 权限判定只需要几个字段（账号、邮箱、部门、状态），
   * 走 `findById` 会把整行连同软删标志一起拉出来。这里统一走 DAO，
   * 业务层不再直接 `getModel('User').findByPk(...)` —— 字段口径只有一处。
   *
   * @param {number} id 用户 ID
   * @param {string[]} [attributes] 需要的列
   * @returns {Promise<object|null>} 快照（不存在时 null）
   */
  async findBrief(id, attributes = ['id', 'username', 'status', 'dept_id']) {
    const targetId = Number(id);
    if (!Number.isInteger(targetId) || targetId <= 0) return null;
    return getModel('User').findByPk(targetId, { attributes, raw: true });
  }

  async isEmailTaken(email, excludeId = 0) {
    if (!email) return false;
    const User = getModel('User');
    const { Op } = User.sequelize.Sequelize;
    const row = await User.findOne({ where: { email, id: { [Op.ne]: excludeId } } });
    return !!row;
  }

  /**
   * 补齐 GLOBAL 基础角色（与注册口径对齐）
   *
   * 🔴 为什么必须有：`app/user/dao/user.js#registerUser` 在没给角色时会补
   *    `user_normal`，而后台建号（含批量导入）原先只写提交的 `roleIds`。于是
   *    "管理员导入的账号"与"自己注册的账号"权限不一样：前者没有 `user:base:*`，
   *    登录后改不了资料、传不了头像，看起来像导入没生效。
   *
   * 只在**一个 GLOBAL 角色都没有**时补：管理员显式勾了 GLOBAL 角色（VIP / 小黑屋）
   * 时尊重他的选择，不额外塞普通角色。
   *
   * 查不到基础角色时**不阻断建号**：账号没有角色仍可登录，等管理员补授即可。
   *
   * @param {number[]} roleIds 提交的角色 ID
   * @param {object} transaction 事务
   * @returns {Promise<number[]>} 补全后的角色 ID
   */
  async withGlobalBaseRole(roleIds, transaction) {
    const ids = Array.from(new Set((roleIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
    const Role = getModel('Role');

    if (ids.length > 0) {
      const rows = await Role.findAll({
        where: { id: ids },
        attributes: ['id', 'app_id'],
        raw: true,
        transaction
      });
      // GLOBAL 角色的 app_id 可能因历史写入为 NULL，按"归属全局"处理
      if (rows.some(row => (row.app_id || 'GLOBAL') === 'GLOBAL')) return ids;
    }

    const code = getDeclaredDefaultRole('GLOBAL') || 'user_normal';
    const base = await Role.findOne({
      where: { app_id: 'GLOBAL', code, delete_version: 0 },
      attributes: ['id', 'rank_level'],
      raw: true,
      transaction
    });
    if (!base) return ids;

    /*
     * 自动补的角色**不经过** `assertGrantable`（它只校验 CSV 提交的那批），
     * 所以这里必须自己守一道：万一 GLOBAL 的默认角色被配成管理档，补进去就是
     * 绕过职级闸发管理员。宁可这次不补，也不发。
     */
    if (Number(base.rank_level) > NORMAL_RANK_MAX) return ids;

    return [...ids, Number(base.id)];
  }

  /**
   * 创建用户（用户 + 凭证 + 角色 + 岗位，单事务）
   *
   * @param {object} payload 用户字段
   * @param {string} payload.username 账号
   * @param {string} [payload.email] 邮箱
   * @param {string} payload.password 明文密码
   * @param {number|null} [payload.deptId] 部门 ID
   * @param {number} [payload.status=1] 状态
   * @param {number[]} [payload.roleIds] 角色 ID 数组
   * @param {number[]} [payload.postIds] 岗位 ID 数组
   * @returns {Promise<object>} 新建的用户实例
   * @throws {Error} 参数非法 / 邮箱重复 / 密码强度不足时抛出
   */
  async create({ username, email, password, deptId = null, status = 1, roleIds = [], postIds = [] }, actor = null) {
    if (!username || !String(username).trim()) throw new Error('INVALID_PARAM:账号不能为空');
    if (!password) throw new Error('INVALID_PARAM:密码不能为空');

    const validation = validatePasswordStrength(password);
    if (!validation.valid) throw new Error(`INVALID_PARAM:${validation.errors[0]}`);
    if (await this.isEmailTaken(email)) throw new Error('DUPLICATE:邮箱已存在');

    /*
     * 没有邮箱时登录标识就是账号名（`UserIdentity.identifier = email || username`），
     * 而 `user_user.username` 只是展示名、**不唯一**。于是"两个张三都没填邮箱"
     * 会在写凭证时撞 `(identity_type, identifier, delete_version)` 唯一索引，
     * 抛出来的是 Sequelize 的 Validation error —— 批量导入里表现为一行看不懂的失败原因。
     * 这里提前查一次，换成能照着改的提示。
     */
    if (!email) {
      const taken = await getModel('UserIdentity').findOne({
        where: {
          identity_type: 'password',
          identifier: String(username).trim(),
          delete_version: 0
        },
        attributes: ['id'],
        raw: true
      });
      if (taken) {
        throw new Error('DUPLICATE:账号已被占用（该账号没有邮箱，只能用账号名登录，因此不能重名）');
      }
    }

    // 哈希放在事务外：scrypt 是 CPU 密集操作，不应占用数据库连接
    const hashedPassword = await hashPassword(password);

    const User = getModel('User');
    return User.sequelize.transaction(async t => {
      const user = await User.create(
        { username: String(username).trim(), email: email || null, dept_id: deptId, status },
        { transaction: t }
      );

      await getModel('UserIdentity').create(
        {
          user_id: user.id,
          identity_type: 'password',
          identifier: email || String(username).trim(),
          credential: hashedPassword
        },
        { transaction: t }
      );

      await this.replaceRoles(user.id, await this.withGlobalBaseRole(roleIds, t), t, {
        username: user.username,
        operator: actor,
        remark: actor?.remark || '新建用户时指定'
      });
      await this.replacePosts(user.id, postIds, t);

      return user;
    });
  }

  /**
   * 更新用户基础信息与关联（角色 / 岗位整体覆盖）
   *
   * @param {number} id 用户 ID
   * @param {object} payload 待更新字段
   * @returns {Promise<boolean>} 是否命中记录
   * @throws {Error} 邮箱重复时抛出
   */
  async update(id, { username, email, deptId, status, rankLevel, roleIds, postIds }, actor = null) {
    const User = getModel('User');
    const user = await User.findByPk(id);
    if (!user) return false;
    if (email && (await this.isEmailTaken(email, id))) throw new Error('DUPLICATE:邮箱已存在');

    return User.sequelize.transaction(async t => {
      const patch = {};
      if (username !== undefined) patch.username = String(username).trim();
      if (email !== undefined) patch.email = email || null;
      if (deptId !== undefined) patch.dept_id = deptId === '' ? null : deptId;
      if (status !== undefined) patch.status = Number(status);
      /*
       * 人员职级：这是**人**的层级，与角色权重无关（见 `syncRankFromRoles`）。
       * 传 `undefined` 表示"这次不改"；显式传数字才写 —— 表单全量回传时不会误伤。
       * 上限校验在接口层做（`assertCanSetRank`），DAO 只负责落库。
       */
      if (rankLevel !== undefined && rankLevel !== null) patch.rank_level = Number(rankLevel);
      if (Object.keys(patch).length > 0) await User.update(patch, { where: { id }, transaction: t });

      if (Array.isArray(roleIds)) {
        await this.replaceRoles(id, roleIds, t, {
          username: patch.username ?? user.username,
          operator: actor,
          remark: actor?.remark || '编辑用户'
        });
      }
      if (Array.isArray(postIds)) await this.replacePosts(id, postIds, t);
      return true;
    });
  }

  /**
   * 覆盖式写入用户角色
   *
   * 🔴 三条约束叠在一起，决定了这里**只能用 destroy/restore，不能自己 UPDATE**：
   *    1. `iam_user_role` 有表级唯一索引 `(user_id, role_id)`（**不含 delete_version**）
   *       ⇒ 同一对用户角色全表只能有一行，**「先软删再 bulkCreate」必然撞唯一约束**
   *       （曾经就是这么写的：接口 500 Validation error，用户只是点了下保存）；
   *    2. `softDeleteHooks` 的 `beforeUpdate` 禁止手改 `delete_version`
   *       （只允许 0 或 === id），手写 `update({delete_version})` 直接被拒；
   *    3. 正确通道是 `destroy()` → 钩子置 `delete_version = id`、`restore()` → 置回 0。
   *
   * 于是语义变成「恢复式写入」：每对 (user, role) 永远只有一行，
   * 取消勾选走软删、重新勾选走恢复，没有才新建。与读取口径
   * （`delete_version = 0` 才算有效）完全一致。
   *
   * @param {number} userId 用户 ID
   * @param {number[]} roleIds 角色 ID 数组
   * @param {object} transaction 事务对象
   * @returns {Promise<void>}
   */
  /**
   * 按当前角色同步人员职级（**只升不降**）
   *
   * 现实里"给他一个 XX 管理员角色"通常也意味着"他是这一级了"，所以授角色顺带抬职级。
   * 但**收回高角色不自动降级** —— 那属于人事决定，得在用户编辑页显式改，
   * 否则一次误操作撤销角色会把人降级，而管理员根本没意识到。
   *
   * 🔴 必须在同一事务里：角色写完就提交、职级却不跟着变，会出现
   *    "他有 80 级角色但职级还是 10"的中间态（正是拆分前的老问题）。
   *
   * @param {number} userId 用户 ID
   * @param {object|null} [transaction] 事务
   * @returns {Promise<{from: number, to: number, changed: boolean}>} 变化结果
   */
  async syncRankFromRoles(userId, transaction = null) {
    const targetId = Number(userId);
    if (!Number.isInteger(targetId) || targetId <= 0) return { from: 0, to: 0, changed: false };

    const links = await getModel('UserRole').findAll({
      where: { user_id: targetId, delete_version: 0 },
      attributes: ['role_id'],
      paranoid: false,
      raw: true,
      transaction
    });
    const roleIdsNow = Array.from(new Set(links.map(link => Number(link.role_id)).filter(id => id > 0)));

    let roleMax = 0;
    if (roleIdsNow.length > 0) {
      const rows = await getModel('Role').findAll({
        where: { id: roleIdsNow, delete_version: 0 },
        attributes: ['rank_level'],
        raw: true,
        transaction
      });
      roleMax = rows.reduce((max, row) => Math.max(max, Number(row.rank_level) || 0), 0);
    }

    const user = await getModel('User').findByPk(targetId, { attributes: ['rank_level'], transaction });
    const current = Number(user?.rank_level) || 0;
    if (roleMax <= current) return { from: current, to: current, changed: false };

    await getModel('User').update({ rank_level: roleMax }, { where: { id: targetId }, transaction });
    return { from: current, to: roleMax, changed: true };
  }

  async replaceRoles(userId, roleIds, transaction, context = {}) {
    const UserRole = getModel('UserRole');
    const ids = Array.from(new Set((roleIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
    const keep = new Set(ids);

    // paranoid: false —— 软删的行也必须拿到，否则「重新勾选同一角色」会走 create 撞唯一索引
    const existing = await UserRole.findAll({ where: { user_id: userId }, paranoid: false, transaction });

    // 🔴 旧集合必须在**改动之前**快照：下面的 destroy/restore 会就地修改这些实例，
    //    等到循环之后再读 `delete_version` 就已经是新值了 —— 那样 revoke 永远记不上
    //    （实测：撤销角色成功、库里也确实软删了，但流水里一条 revoke 都没有）。
    const before = new Set(
      existing.filter(r => Number(r.delete_version) === 0 && r.deletedAt === null).map(r => Number(r.role_id))
    );

    for (const row of existing) {
      const rid = Number(row.role_id);
      const logicalActive = Number(row.delete_version) === 0;
      const physicallyDeleted = row.deletedAt !== null && row.deletedAt !== undefined;

      if (!keep.has(rid)) {
        if (logicalActive && !physicallyDeleted) await row.destroy({ transaction });
        continue;
      }

      // 需要在本次结果里的
      if (physicallyDeleted) {
        // 走 paranoid 的恢复：清 deleted_at 并把 delete_version 置 0
        await row.restore({ transaction });
      } else if (!logicalActive) {
        // 极少数脏数据：deleted_at 为空但 delete_version 非 0。
        // 归 0 是钩子允许的终态（beforeUpdate 只在「非 0 且非 id」时拒绝）。
        await row.update({ delete_version: 0 }, { transaction });
      }
    }

    const known = new Set(existing.map(r => Number(r.role_id)));
    for (const rid of ids) {
      if (known.has(rid)) continue;
      await UserRole.create({ user_id: userId, role_id: rid, app_id: 'GLOBAL' }, { transaction });
    }

    // 授权流水：只记**本次真正变化**的那些角色（before 是改动前的快照，见上方）
    const added = ids.filter(rid => !before.has(rid));
    const removed = [...before].filter(rid => !keep.has(rid));
    if (added.length === 0 && removed.length === 0) {
      // 角色集合没变，但角色权重可能被管理员调整过 —— 顺手对齐一次（只升不降）
      await this.syncRankFromRoles(userId, transaction);
      return;
    }

    const roles = await getModel('Role').findAll({
      where: { id: [...added, ...removed] },
      attributes: ['id', 'code', 'name', 'app_id'],
      paranoid: false,
      raw: true,
      transaction
    });
    const meta = new Map(roles.map(r => [Number(r.id), r]));
    const changes = [
      ...added.map(rid => ({
        roleId: rid,
        roleCode: meta.get(rid)?.code ?? '',
        roleName: meta.get(rid)?.name ?? `#${rid}`,
        appId: meta.get(rid)?.app_id ?? 'GLOBAL',
        action: 'grant'
      })),
      ...removed.map(rid => ({
        roleId: rid,
        roleCode: meta.get(rid)?.code ?? '',
        roleName: meta.get(rid)?.name ?? `#${rid}`,
        appId: meta.get(rid)?.app_id ?? 'GLOBAL',
        action: 'revoke'
      }))
    ];
    await grantDao.record({
      userId,
      username: context.username ?? '',
      changes,
      operator: context.operator ?? null,
      remark: context.remark,
      transaction
    });

    // 授角色顺带抬职级（详见 syncRankFromRoles）
    await this.syncRankFromRoles(userId, transaction);
  }

  /**
   * 某用户当前生效的角色 ID
   *
   * 批量授权要基于"现状"算并集或差集，所以需要这个读口；口径与 replaceRoles
   * 的 `before` 完全一致（delete_version === 0 且未被物理删除）。
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<number[]>} 角色 ID 数组
   */
  async activeRoleIds(userId) {
    const rows = await getModel('UserRole').findAll({ where: { user_id: userId }, paranoid: false });
    return rows.filter(r => Number(r.delete_version) === 0 && r.deletedAt === null).map(r => Number(r.role_id));
  }

  /**
   * 覆盖式写入用户岗位
   *
   * @param {number} userId 用户 ID
   * @param {number[]} postIds 岗位 ID 数组
   * @param {object} transaction 事务对象
   * @returns {Promise<void>}
   */
  async replacePosts(userId, postIds, transaction) {
    const SysUserPost = getModel('console.SysUserPost');
    const ids = Array.from(new Set((postIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
    await SysUserPost.destroy({ where: { user_id: userId }, transaction });
    if (ids.length === 0) return;
    await SysUserPost.bulkCreate(
      ids.map(postId => ({ user_id: userId, post_id: postId })),
      { transaction }
    );
  }

  /**
   * 更新用户状态
   *
   * @param {number} id 用户 ID
   * @param {number} status 状态（1 正常 / 0 冻结 / -1 注销）
   * @returns {Promise<boolean>} 是否命中记录
   */
  async updateStatus(id, status) {
    const [affected] = await getModel('User').update({ status: Number(status) }, { where: { id } });
    return affected > 0;
  }
}

const consoleUserDao = new ConsoleUserDao();

export default consoleUserDao;
