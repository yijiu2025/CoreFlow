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
import grantDao from './grant.dao.js';
import { hashPassword, validatePasswordStrength } from '../../../framework/security/auth/index.js';

class ConsoleUserDao {
  /**
   * 用户分页（含部门 / 角色 / 岗位）
   *
   * @param {object} params 查询参数
   * @param {number} [params.pageNum=1] 页码
   * @param {number} [params.pageSize=20] 每页条数
   * @param {string} [params.keyword=''] 账号 / 邮箱模糊搜索
   * @param {number|null} [params.deptId=null] 部门过滤
   * @param {number|null} [params.status=null] 状态过滤
   * @returns {Promise<{rows: Array<object>, total: number}>} 分页结果
   */
  async page({ pageNum = 1, pageSize = 20, keyword = '', deptId = null, status = null, scopeAppIds = null }) {
    const User = getModel('User');
    const { Op } = User.sequelize.Sequelize;

    const where = {};
    if (keyword) {
      where[Op.or] = [{ username: { [Op.like]: `%${keyword}%` } }, { email: { [Op.like]: `%${keyword}%` } }];
    }
    if (deptId !== null && deptId !== undefined && deptId !== '') where.dept_id = Number(deptId);
    if (status !== null && status !== undefined && status !== '') where.status = Number(status);

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
    if (Array.isArray(scopeAppIds)) {
      const scopedRoleIds = (
        await getModel('Role').findAll({ where: { app_id: scopeAppIds }, attributes: ['id'], raw: true })
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
      where.id = { [Op.in]: scopedUserIds };
    }

    const offset = (Number(pageNum) - 1) * Number(pageSize);
    const { rows: users, count } = await User.findAndCountAll({
      where,
      attributes: ['id', 'uid', 'username', 'email', 'avatar', 'status', 'dept_id', 'created_at'],
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
      return {
        ...u,
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
  async isEmailTaken(email, excludeId = 0) {
    if (!email) return false;
    const User = getModel('User');
    const { Op } = User.sequelize.Sequelize;
    const row = await User.findOne({ where: { email, id: { [Op.ne]: excludeId } } });
    return !!row;
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

      await this.replaceRoles(user.id, roleIds, t, {
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
  async update(id, { username, email, deptId, status, roleIds, postIds }, actor = null) {
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
    if (added.length === 0 && removed.length === 0) return;

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
