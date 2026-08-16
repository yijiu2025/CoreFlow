/**
 * OAuth 2.1 用户数据访问层
 *
 * 已整合至统一 IAM 平台，彻底消除”身份孤岛”问题。
 * 直接适配主系统的 User & UserIdentity 体系，sub (Subject) 字段对应 User.uid (UUID)。
 *
 * 提供用户查找、密码验证等能力，供授权服务器在用户认证阶段调用。
 *
 * @author Claude
 * @since 2026-07-13
 */
import bcrypt from 'bcryptjs';
import { getModel } from '../../../framework/db/index.js';

const UserDao = {
  /**
   * 根据用户 UID 查找用户 (sub 字段存储的是主系统的 User.uid)
   * @param {string} uid 用户唯一标识 (UUID)
   * @returns {Promise<object|null>} 适配后的用户数据或 null
   */
  async findById(uid) {
    const User = getModel('User');
    if (!User) return null;

    const user = await User.findOne({
      where: { uid }
    });

    return user
      ? {
          id: user.uid, // sub 字段对应 uid
          numericId: user.id, // BIGINT 数字主键（Session 等内部使用）
          username: user.username,
          email: user.email,
          name: user.username,
          avatar: user.avatar,
          uid: user.uid,
          status: user.status // 账号状态（0=禁用，登录/刷新时校验）
        }
      : null;
  },

  /**
   * 根据邮箱查找用户
   * @param {string} email 邮箱
   * @returns {Promise<object|null>} 适配后的用户数据或 null
   */
  async findByEmail(email) {
    const User = getModel('User');
    if (!User) return null;

    const user = await User.findOne({
      where: { email }
    });

    return user
      ? {
          id: user.uid, // sub 字段对应 uid
          numericId: user.id, // BIGINT 数字主键（Session 等内部使用）
          username: user.username,
          email: user.email,
          name: user.username,
          avatar: user.avatar,
          uid: user.uid,
          status: user.status // 账号状态（0=禁用，登录/刷新时校验）
        }
      : null;
  },

  /**
   * 根据用户名/邮箱/标识符查找用户以进行凭证验证
   * @param {string} username 登录标识符
   * @returns {Promise<object|null>} 适配后的用户数据及凭证或 null
   */
  async findByUsername(username) {
    const User = getModel('User');
    const UserIdentity = getModel('UserIdentity');
    if (!User || !UserIdentity) return null;

    // 从统一的凭证表 UserIdentity 中查找密码记录
    const identity = await UserIdentity.findOne({
      where: {
        identifier: username,
        identity_type: 'password'
      },
      include: [{ model: User, as: 'user' }]
    });

    if (!identity || !identity.user) return null;

    return {
      id: identity.user.uid, // sub 字段对应 uid
      numericId: identity.user.id, // BIGINT 数字主键
      username: identity.user.username,
      email: identity.user.email,
      name: identity.user.username,
      avatar: identity.user.avatar,
      uid: identity.user.uid,
      credential: identity.credential // 密码 Hash
    };
  },

  /**
   * 验证用户密码
   * @param {object} user 适配后的用户数据
   * @param {string} password 待验证的明文密码
   * @returns {Promise<boolean>} 是否验证成功
   */
  async verifyPassword(user, password) {
    if (!user || !user.credential) return false;
    return bcrypt.compare(password, user.credential);
  },

  /**
   * 分页查询用户列表（管理端）
   *
   * 排除内部 id（绝不对外暴露）与 phone（AES 密文，列表不返回）。
   * @param {object} [opts]
   * @param {number} [opts.limit=50] 上限 200
   * @param {number} [opts.offset=0]
   * @returns {Promise<object[]>}
   */
  async listUsers({ limit = 50, offset = 0 } = {}) {
    const User = getModel('User');
    return User.findAll({
      limit: Math.min(Number(limit), 200),
      offset: Number(offset),
      attributes: { exclude: ['id', 'phone'] },
      order: [['created_at', 'DESC']]
    });
  }
};

export default UserDao;
