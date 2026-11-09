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
import { hashPassword, validatePasswordStrength } from '../../../framework/security/auth/index.js';
import { QueryTypes } from 'sequelize';

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
  async page({ pageNum = 1, pageSize = 20, keyword = '', deptId = null, status = null }) {
    const { sequelize } = getModel('User');
    const conditions = ['u.deleted_at IS NULL'];
    const replacements = {};

    if (keyword) {
      conditions.push('(u.username LIKE :keyword OR u.email LIKE :keyword)');
      replacements.keyword = `%${keyword}%`;
    }
    if (deptId !== null && deptId !== undefined && deptId !== '') {
      conditions.push('u.dept_id = :deptId');
      replacements.deptId = Number(deptId);
    }
    if (status !== null && status !== undefined && status !== '') {
      conditions.push('u.status = :status');
      replacements.status = Number(status);
    }
    const whereSql = `WHERE ${conditions.join(' AND ')}`;

    const total = await sequelize.query(`SELECT COUNT(*) AS c FROM user_user u ${whereSql}`, {
      type: QueryTypes.SELECT,
      replacements
    });

    replacements.limit = Number(pageSize);
    replacements.offset = (Number(pageNum) - 1) * Number(pageSize);

    const rows = await sequelize.query(
      `SELECT u.id, u.uid, u.username, u.email, u.avatar, u.status, u.dept_id, u.created_at,
              d.name AS dept_name,
              (SELECT GROUP_CONCAT(r.name ORDER BY r.id SEPARATOR ',')
                 FROM iam_user_role ur JOIN iam_role r ON r.id = ur.role_id
                WHERE ur.user_id = u.id AND ur.delete_version = 0) AS role_names,
              (SELECT GROUP_CONCAT(p.post_name ORDER BY p.id SEPARATOR ',')
                 FROM sys_user_post up JOIN sys_post p ON p.id = up.post_id
                WHERE up.user_id = u.id) AS post_names
         FROM user_user u
         LEFT JOIN sys_dept d ON d.id = u.dept_id
         ${whereSql}
         ORDER BY u.id DESC
         LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements }
    );

    return { rows, total: Number(total[0]?.c || 0) };
  }

  /**
   * 管理端下拉选项（部门树 / 角色 / 岗位 / 默认初始密码提示）
   *
   * @returns {Promise<{depts: Array<object>, roles: Array<object>, posts: Array<object>}>} 选项集合
   */
  async options() {
    const { sequelize } = getModel('User');
    const depts = await sequelize.query(
      'SELECT id, parent_id, name FROM sys_dept WHERE status = 1 ORDER BY sort ASC, id ASC',
      { type: QueryTypes.SELECT }
    );
    const roles = await sequelize.query(
      'SELECT id, code, name, app_id, rank_level FROM iam_role WHERE deleted_at IS NULL ORDER BY rank_level DESC, id ASC',
      { type: QueryTypes.SELECT }
    );
    const posts = await sequelize.query(
      'SELECT id, post_code, post_name FROM sys_post WHERE status = 1 ORDER BY sort ASC, id ASC',
      { type: QueryTypes.SELECT }
    );
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
  async create({ username, email, password, deptId = null, status = 1, roleIds = [], postIds = [] }) {
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

      await this.replaceRoles(user.id, roleIds, t);
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
  async update(id, { username, email, deptId, status, roleIds, postIds }) {
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

      if (Array.isArray(roleIds)) await this.replaceRoles(id, roleIds, t);
      if (Array.isArray(postIds)) await this.replacePosts(id, postIds, t);
      return true;
    });
  }

  /**
   * 覆盖式写入用户角色（软删除语义：旧的置 delete_version 后重建）
   *
   * @param {number} userId 用户 ID
   * @param {number[]} roleIds 角色 ID 数组
   * @param {object} transaction 事务对象
   * @returns {Promise<void>}
   */
  async replaceRoles(userId, roleIds, transaction) {
    const UserRole = getModel('UserRole');
    const ids = Array.from(new Set((roleIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
    await UserRole.update({ delete_version: Date.now() }, { where: { user_id: userId }, transaction });
    if (ids.length === 0) return;
    await UserRole.bulkCreate(
      ids.map(roleId => ({ user_id: userId, role_id: roleId, app_id: 'GLOBAL' })),
      { transaction }
    );
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

  /**
   * 重置用户密码
   *
   * @param {number} id 用户 ID
   * @param {string} password 新明文密码
   * @returns {Promise<boolean>} 是否命中记录
   * @throws {Error} 密码强度不足 / 用户无密码凭证时抛出
   */
  async resetPassword(id, password) {
    const validation = validatePasswordStrength(password);
    if (!validation.valid) throw new Error(`INVALID_PARAM:${validation.errors[0]}`);

    const UserIdentity = getModel('UserIdentity');
    const identity = await UserIdentity.findOne({ where: { user_id: id, identity_type: 'password' } });
    if (!identity) throw new Error('NOT_FOUND:该用户没有密码凭证');

    const hashedPassword = await hashPassword(password);
    await UserIdentity.update({ credential: hashedPassword }, { where: { id: identity.id } });
    return true;
  }

  /**
   * 删除用户（软删除 + 清理关联）
   *
   * @param {number} id 用户 ID
   * @returns {Promise<boolean>} 是否命中记录
   */
  async remove(id) {
    const User = getModel('User');
    const user = await User.findByPk(id);
    if (!user) return false;
    await User.sequelize.transaction(async t => {
      await getModel('UserRole').update({ delete_version: Date.now() }, { where: { user_id: id }, transaction: t });
      await getModel('console.SysUserPost').destroy({ where: { user_id: id }, transaction: t });
      await User.destroy({ where: { id }, transaction: t });
    });
    return true;
  }
}

const consoleUserDao = new ConsoleUserDao();

export default consoleUserDao;
