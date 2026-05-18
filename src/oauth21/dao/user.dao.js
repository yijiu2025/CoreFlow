/**
 * OAuth 用户数据访问层
 *
 * 提供用户的增删查改和密码验证操作。
 * 密码使用 bcrypt 哈希存储。
 * 底层通过 Sequelize 模型访问 oauth_users 表。
 */
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import sequelize from '../../db/index.js';

/** 获取 OauthUser 模型（延迟获取，确保模型已加载） */
const getModel = () => sequelize.models.OauthUser;

const UserDao = {
  /**
   * 根据用户 ID 查找用户
   * @param {string} id 用户唯一标识
   * @returns {Promise<object|null>} 用户数据或 null
   */
  async findById(id) {
    const model = getModel();
    const user = await model.findByPk(id);
    return user ? user.toJSON() : null;
  },

  /**
   * 根据用户名查找用户
   * @param {string} username 用户名
   * @returns {Promise<object|null>} 用户数据或 null
   */
  async findByUsername(username) {
    const model = getModel();
    const user = await model.findOne({
      where: { username }
    });
    return user ? user.toJSON() : null;
  },

  /**
   * 根据身份标识（用户名、邮箱或手机号）查找用户
   * @param {string} identity 身份标识
   * @returns {Promise<object|null>} 用户数据或 null
   */
  async findByIdentity(identity) {
    const model = getModel();
    const { Op } = sequelize;
    const user = await model.findOne({
      where: {
        [Op.or]: [
          { username: identity },
          { email: identity },
          { phone: identity }
        ]
      }
    });
    return user ? user.toJSON() : null;
  },

  /**
   * 创建新用户
   * @param {object} params 用户参数
   * @param {string} params.username 用户名
   * @param {string} params.password 明文密码（将被 bcrypt 哈希）
   * @param {string} [params.email] 邮箱
   * @param {string} [params.name] 显示名称
   * @returns {Promise<object>} 创建的用户数据
   */
  async create({ username, password, email, name }) {
    const model = getModel();
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await model.create({
      id,
      username,
      password: hashedPassword,
      email,
      name
    });

    return user.toJSON();
  },

  /**
   * 验证用户密码
   * @param {object} user 用户数据（含 password 字段）
   * @param {string} password 待验证的明文密码
   * @returns {Promise<boolean>} 密码是否匹配
   */
  async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password);
  },

  /**
   * 列出所有用户（不含密码）
   * @returns {Promise<object[]>} 用户列表
   */
  async list() {
    const model = getModel();
    const users = await model.findAll();
    return users.map((u) => {
      const { password, ...rest } = u.toJSON();
      return rest;
    });
  }
};

export default UserDao;
