/**
 * OAuth 2.1 用户数据访问层
 *
 * 已整合至统一 IAM 平台，彻底消除”身份孤岛”问题。
 * 直接适配主系统的 User & UserIdentity 体系，sub (Subject) 字段对应 User.uid (UUID)。
 *
 * 返回形状契约（2026-11-01 改名手术，有测试钉死 user-dao-shape.test.js）：
 * - `id`   = 数字主键（BIGINT，模型原义）——数字列 FK、权限加载、封禁键
 * - `uid`  = UUID——JWT sub、API 参数、日志
 * 历史上曾把 id 劫持成 uid（id: user.uid）+ 数字主键被迫另立字段名，
 * 同名字段两种语义导致两次同型 bug（审计写库报错 / JWT 用户权限恒空）。
 *
 * 提供用户查找、密码验证等能力，供授权服务器在用户认证阶段调用。
 *
 * @author Claude
 * @since 2026-07-13
 * @since 2026-11-01 恢复 id 数字原义、移除旧数字别名（改名手术）
 */
import { verifyPassword as verifyPasswordHash } from '../../../framework/auth/index.js';
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
          id: user.id, // 数字主键（模型原义，BIGINT）——数字列 FK / 权限加载 / 封禁键用
          uid: user.uid, // 对外唯一标识（UUID）——JWT sub、API 参数、日志用
          username: user.username,
          email: user.email,
          name: user.username,
          avatar: user.avatar,
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
          id: user.id, // 数字主键（模型原义，BIGINT）——数字列 FK / 权限加载 / 封禁键用
          uid: user.uid, // 对外唯一标识（UUID）——JWT sub、API 参数、日志用
          username: user.username,
          email: user.email,
          name: user.username,
          avatar: user.avatar,
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
      id: identity.user.id, // 数字主键（模型原义，BIGINT）
      uid: identity.user.uid, // 对外唯一标识（UUID）
      username: identity.user.username,
      email: identity.user.email,
      name: identity.user.username,
      avatar: identity.user.avatar,
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
    // 别名调用：本方法名与之同名，不别名会被读成递归
    return verifyPasswordHash(password, user.credential);
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
    // 纵深防御：路由层已有 schema，但 DAO 也是公开 API（脚本/内部调用方可能绕过）
    // —— `limit=abc` 会得到 NaN，直接进 SQL 会抛错变 500，故在此归一。
    const lim = Number(limit);
    const off = Number(offset);
    return User.findAll({
      limit: Number.isInteger(lim) && lim > 0 ? Math.min(lim, 200) : 50,
      offset: Number.isInteger(off) && off > 0 ? off : 0,
      attributes: { exclude: ['id', 'phone'] },
      order: [['created_at', 'DESC']]
    });
  }
};

export default UserDao;
