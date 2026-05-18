/**
 * OAuth 2.1 用户数据访问层 (已整合至统一 IAM 平台)
 *
 * 彻底消除“身份孤岛”问题，直接适配主系统的 User & UserIdentity 体系。
 * OAuth 2.1 授权服务器中的 sub (Subject) 字段全部对应主系统的 User.uid (UUID)。
 */
import bcrypt from 'bcryptjs';
import sequelize from '../../db/index.js';

const UserDao = {
  /**
   * 根据用户 UID 查找用户 (sub 字段存储的是主系统的 User.uid)
   * @param {string} uid 用户唯一标识 (UUID)
   * @returns {Promise<object|null>} 适配后的用户数据或 null
   */
  async findById(uid) {
    const { User } = sequelize.models;
    if (!User) return null;

    const user = await User.findOne({
      where: { uid }
    });

    return user ? {
      id: user.uid, // sub 字段对应 uid
      username: user.username,
      email: user.email,
      name: user.username,
      uid: user.uid
    } : null;
  },

  /**
   * 根据用户名/邮箱/标识符查找用户以进行凭证验证
   * @param {string} username 登录标识符
   * @returns {Promise<object|null>} 适配后的用户数据及凭证或 null
   */
  async findByUsername(username) {
    const { User, UserIdentity } = sequelize.models;
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
      username: identity.user.username,
      email: identity.user.email,
      name: identity.user.username,
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
  }
};

export default UserDao;
