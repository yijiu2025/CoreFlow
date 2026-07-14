/**
 * 用户应用数据访问层
 *
 * 提供用户注册、登录认证、信息查询等数据操作能力。
 * 使用 RSA 解密前端传输的密码，通过 bcrypt 进行密码哈希存储与验证。
 * 登录成功后通过 PBAC 计算用户策略并签发 JWT Token。
 *
 * @author Claude
 * @since 2026-07-13
 */
import jwt from 'jsonwebtoken';
import sequelize from '../../../db/index.js';
import { decrypt } from '../../oauth21/crypto/encryption.js';
import bcrypt from 'bcryptjs';
import IamDao from '../../admin/dao/iam.dao.js';
import { validatePasswordStrength } from '../../../auth/password-policy.js';

class UserDao {
  /**
   * 检查用户名是否已存在
   * @param {string} username - 用户名
   * @returns {Promise<boolean>} 是否存在
   */
  async checkUsernameExist(username) {
    const isExist = await sequelize.models.User.findOne({
      where: { username }
    });
    return !!isExist;
  }

  /**
   * 检查邮箱是否已存在
   * @param {string} email - 邮箱地址
   * @returns {Promise<boolean>} 是否存在
   */
  async checkEmailExist(email) {
    const isExist = await sequelize.models.User.findOne({ where: { email } });
    return !!isExist;
  }

  /**
   * 创建新用户
   *
   * 校验用户名/邮箱唯一性和角色有效性后，调用 registerUser 完成注册。
   *
   * @param {import('fastify').FastifyRequest} request - Fastify 请求对象
   * @returns {Promise<object>} 新创建的 User 模型实例
   * @throws {Error} 用户名或邮箱为空、邮箱已存在、角色不存在时抛出
   */
  async createUser(request) {
    let { username, email } = request.body;
    if (!username) username = email;
    if (!username) throw new Error('REGISTER_FAILED:用户名或邮箱不能为空');

    if (email && email.trim() !== '') {
      let user = await sequelize.models.User.findOne({ where: { email } });
      if (user) throw new Error('REGISTER_FAILED:邮箱已存在');
    }

    const roleIds = request.body.role_ids || [];
    if (roleIds.length > 0) {
      for (const id of roleIds) {
        const role = await sequelize.models.Role.findByPk(id);
        if (!role) throw new Error(`NOT_FOUND:角色[${id}]不存在`);
      }
    }

    return await this.registerUser(request);
  }

  /**
   * 用户登录认证并签发 Token
   *
   * 流程：
   * 1. 解密前端 RSA 加密的密码
   * 2. 通过 UserIdentity 查找凭证并 bcrypt 验证密码
   * 3. PBAC 计算当前应用下的有效策略
   * 4. 更新全局会话和身份表的登录时间
   * 5. 签发 Access Token（嵌入权限策略）和 Refresh Token
   *
   * @param {import('fastify').FastifyRequest} request - Fastify 请求对象（需包含 body.username, body.password, body.appId）
   * @returns {Promise<{accessToken: string, refreshToken: string}>} Token 对
   * @throws {Error} 用户名/密码为空或验证失败时抛出 AUTH_FAILED
   */
  async getTokens(request) {
    const { username, appId, password: encryptedPassword } = request.body;
    const password = decrypt(encryptedPassword);

    if (!username || !password) {
      throw new Error('AUTH_FAILED:邮箱或密码不能为空');
    }

    const identity = await sequelize.models.UserIdentity.findOne({
      where: { identifier: username, identity_type: 'password' },
      include: [{ model: sequelize.models.User, as: 'user' }]
    });

    if (!identity || !bcrypt.compareSync(password, identity.credential)) {
      throw new Error('AUTH_FAILED:邮箱或密码错误');
    }

    const user = identity.user;

    // [PBAC 核心]：计算当前应用下的有效策略
    const { allows, denies } = await IamDao.buildUserEffectivePolicy(
      user.uid,
      appId || 'GLOBAL'
    );

    if (sequelize.models.UserSession) {
      await sequelize.models.UserSession.upsert({
        user_id: user.id,
        last_login_at: new Date(),
        last_login_ip: request.ip || request.state?.clientInfo?.ip,
        last_login_app: appId || 'DIRECT_LOGIN',
        last_active_at: new Date()
      });
    }

    // 更新身份表的最后登录时间
    identity.last_login_at = new Date();
    await identity.save();

    const accessToken = global.xToken.login(user.uid, {
      appId,
      permissions: { allows, denies } // 将策略压入 Token
    });

    const refreshToken = jwt.sign(
      { uid: user.uid, appId, type: 'refresh' },
      process.env.JWT_SECRET,
      {
        expiresIn: '30d'
      }
    );

    return { accessToken, refreshToken };
  }

  /**
   * 根据 UID 获取用户详细信息（含关联角色）
   * @param {object} ctx - Fastify 请求上下文（ctx.state.user.uid）
   * @returns {Promise<object|null>} User 模型实例（包含 roles 关联）
   */
  async getInformation(ctx) {
    const { uid } = ctx.state.user;
    return await sequelize.models.User.findOne({
      where: { uid },
      include: [
        {
          model: sequelize.models.Role,
          as: 'roles',
          through: { attributes: [] }
        }
      ]
    });
  }

  /**
   * 用户注册（事务操作）
   *
   * 在单个数据库事务中完成：
   * 1. 创建 User 基础信息
   * 2. 创建 UserIdentity 密码凭证
   * 3. 分配指定角色或默认 guest 角色
   *
   * @param {import('fastify').FastifyRequest} request - Fastify 请求对象（需包含 body.email, body.password, body.username?, body.role_ids?）
   * @returns {Promise<object>} 新创建的 User 模型实例
   * @throws {Error} 密码复杂度不足时抛出 REGISTER_FAILED
   */
  async registerUser(request) {
    const { email, password: encryptedPassword, role_ids } = request.body;
    let { username } = request.body;
    if (!username) username = email;

    const password = decrypt(encryptedPassword);

    // 密码复杂度校验
    const validation = validatePasswordStrength(password);
    if (!validation.valid) {
      throw new Error(`REGISTER_FAILED:${validation.errors[0]}`);
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    return await sequelize.transaction(async (t) => {
      const user = await sequelize.models.User.create(
        { username, email },
        { transaction: t }
      );

      await sequelize.models.UserIdentity.create(
        {
          user_id: user.id,
          identity_type: 'password',
          identifier: email,
          credential: hashedPassword
        },
        { transaction: t }
      );

      const roleIds = role_ids || [];
      if (roleIds.length > 0) {
        for (const rid of roleIds) {
          await sequelize.models.UserRole.create(
            {
              user_id: user.id,
              role_id: rid,
              app_id: 'GLOBAL'
            },
            { transaction: t }
          );
        }
      } else {
        const guestRole = await sequelize.models.Role.findOne({
          where: { rank_level: 1, app_id: 'GLOBAL' },
          transaction: t
        });
        if (guestRole) {
          await sequelize.models.UserRole.create(
            {
              user_id: user.id,
              role_id: guestRole.id,
              app_id: 'GLOBAL'
            },
            { transaction: t }
          );
        }
      }

      return user;
    });
  }
}

export default new UserDao();
