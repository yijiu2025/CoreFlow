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
import sequelize from '../../../framework/db/index.js';
import { getModel } from '../../../framework/db/index.js';
import { decrypt } from '../../oauth21/crypto/encryption.js';
import bcrypt from 'bcryptjs';
import IamDao from '../../admin/dao/iam.dao.js';
import { validatePasswordStrength } from '../../../framework/auth/password-policy.js';
import { maskPhone } from '../../../utils/crypto.js';

class UserDao {
  /**
   * 检查用户名是否已存在
   * @param {string} username - 用户名
   * @returns {Promise<boolean>} 是否存在
   */
  async checkUsernameExist(username) {
    const isExist = await getModel('User').findOne({
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
    const isExist = await getModel('User').findOne({ where: { email } });
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
      let user = await getModel('User').findOne({ where: { email } });
      if (user) throw new Error('REGISTER_FAILED:邮箱已存在');
    }

    const roleIds = request.body.role_ids || [];
    if (roleIds.length > 0) {
      for (const id of roleIds) {
        const role = await getModel('Role').findByPk(id);
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
    const { username, appId, password: encryptedPassword, kid } = request.body;
    const password = await decrypt(encryptedPassword, kid);

    if (!username || !password) {
      throw new Error('AUTH_FAILED:邮箱或密码不能为空');
    }

    const identity = await getModel('UserIdentity').findOne({
      where: { identifier: username, identity_type: 'password' },
      include: [{ model: getModel('User'), as: 'user' }]
    });

    if (!identity || !bcrypt.compareSync(password, identity.credential)) {
      throw new Error('AUTH_FAILED:邮箱或密码错误');
    }

    const user = identity.user;

    // [PBAC 核心]：计算当前应用下的有效策略
    const { allows, denies } = await IamDao.buildUserEffectivePolicy(user.uid, appId || 'GLOBAL');

    if (getModel('UserSession')) {
      await getModel('UserSession').upsert({
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

    const refreshToken = jwt.sign({ uid: user.uid, appId, type: 'refresh' }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });

    return { accessToken, refreshToken };
  }

  /**
   * 根据 UID 获取用户详细信息（含关联角色）
   * @param {object} ctx - Fastify 请求上下文（ctx.state.user.uid）
   * @returns {Promise<object|null>} User 模型实例（包含 roles 关联）
   */
  async getInformation(ctx) {
    const { uid } = ctx.state.user;
    return await getModel('User').findOne({
      where: { uid },
      include: [
        {
          model: getModel('Role'),
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
    const { email, password: encryptedPassword, role_ids, kid } = request.body;
    let { username } = request.body;
    if (!username) username = email;

    const password = await decrypt(encryptedPassword, kid);

    // 密码复杂度校验
    const validation = validatePasswordStrength(password);
    if (!validation.valid) {
      throw new Error(`REGISTER_FAILED:${validation.errors[0]}`);
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    try {
      return await sequelize.transaction(async t => {
        const user = await getModel('User').create({ username, email }, { transaction: t });

        await getModel('UserIdentity').create(
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
            await getModel('UserRole').create(
              {
                user_id: user.id,
                role_id: rid,
                app_id: 'GLOBAL'
              },
              { transaction: t }
            );
          }
        } else {
        // 默认 guest 角色（rank_level=1, app_id=GLOBAL），找不到则抛错回滚，
        // 避免注册出"有用户无角色"的脏数据（权限为空无法正常使用）
        const guestRole = await getModel('Role').findOne({
          where: { rank_level: 1, app_id: 'GLOBAL' },
          transaction: t
        });
        if (!guestRole) {
          throw new Error('REGISTER_FAILED:默认角色未初始化，请联系管理员运行角色同步');
        }
        await getModel('UserRole').create(
          {
            user_id: user.id,
            role_id: guestRole.id,
            app_id: 'GLOBAL'
          },
          { transaction: t }
        );
      }

      return user;
    });
    } catch (err) {
      // L4：并发注册同 email，预检过了但事务内 create 撞唯一索引
      // 转 400 业务错误，避免抛 500 + 暴露 DB 错误细节
      const isUniqueViolation =
        err?.name === 'SequelizeUniqueConstraintError' ||
        err?.parent?.code === 'ER_DUP_ENTRY';
      if (isUniqueViolation) {
        throw new Error('REGISTER_FAILED:邮箱已存在');
      }
      throw err;
    }
  }

  /**
   * 重置用户密码（忘记密码/找回密码）
   *
   * 流程：
   * 1. 按 email 查 UserIdentity（identity_type=password）
   * 2. RSA 解密新密码 + 复杂度校验
   * 3. bcrypt 重新哈希 + 更新 credential
   *
   * @param {string} email 邮箱
   * @param {string} encryptedPassword RSA 加密的新密码密文
   * @param {string} [kid] 密钥 ID
   * @returns {Promise<boolean>} 是否重置成功
   * @throws {Error} 用户不存在/复杂度不足时抛 RESET_FAILED
   */
  async updatePassword(email, encryptedPassword, kid) {
    if (!email || !encryptedPassword) {
      throw new Error('RESET_FAILED:邮箱和新密码不能为空');
    }

    const identity = await getModel('UserIdentity').findOne({
      where: { identifier: email, identity_type: 'password' }
    });
    if (!identity) {
      throw new Error('RESET_FAILED:该邮箱未注册或不可重置');
    }

    const password = await decrypt(encryptedPassword, kid);
    const validation = validatePasswordStrength(password);
    if (!validation.valid) {
      throw new Error(`RESET_FAILED:${validation.errors[0]}`);
    }

    identity.credential = bcrypt.hashSync(password, 10);
    await identity.save();
    return true;
  }

  /**
   * 根据用户 UID 查找用户（适配后返回，sub 对应 uid）
   * @param {string} uid 用户唯一标识 (UUID)
   * @returns {Promise<object|null>} 适配后的用户数据或 null
   */
  async findById(uid) {
    const User = getModel('User');
    if (!User) return null;
    const user = await User.findOne({ where: { uid } });
    return user
      ? {
          id: user.uid,
          numericId: user.id,
          username: user.username,
          email: user.email,
          name: user.username,
          avatar: user.avatar,
          uid: user.uid,
          status: user.status
        }
      : null;
  }

  /**
   * 生成唯一的 personal_id（格式 pose_craft_ + 8位字母数字）
   *
   * 碰撞时递归重试，最多 10 次，极端情况用时间戳后缀兜底。
   * @param {number} [attempt=0] - 当前重试次数
   * @returns {Promise<string>} 唯一的 personal_id
   */
  async generateUniquePersonalId(attempt = 0) {
    if (attempt >= 10) {
      return `pose_craft_${Date.now().toString(36)}`;
    }
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < 8; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidate = `pose_craft_${suffix}`;
    const existing = await getModel('User').findOne({
      where: { personal_id: candidate },
      attributes: ['id']
    });
    if (existing) {
      return this.generateUniquePersonalId(attempt + 1);
    }
    return candidate;
  }

  /**
   * 获取用户基础资料（含全新用户默认资料初始化 + 手机号脱敏）
   *
   * 全新用户（无 bio 且无 personal_id）在此初始化个人中心基础资料。
   * 手机号仅返回掩码格式，明文不暴露。
   * @param {number} userId - 用户内部 id
   * @returns {Promise<object|null>} 资料对象或 null（用户不存在）
   */
  async getProfile(userId) {
    const User = getModel('User');
    let user = await User.findOne({ where: { id: userId } });
    if (!user) return null;

    // 全新用户初始化默认资料
    if (!user.bio && !user.personal_id) {
      await user.update({
        gender: 1,
        age: 27,
        city: '甘肃 · 庆阳',
        bio: '✈️已飞0个国家❗️\n梦想是环游世界🌍\n中国留子👧\n个人存款0.000000千万💵\n人生是干饭💤\n梦游国家40+ | 我命由我不由天🌚\n火锅品鉴师🍪 | 5G冲浪达人🏄\npdd资深买手🛍️ | 草莓🍓狂热粉丝\n雅思托福没考📚 清华北大没考📖\n国家级证件持有者(身份证)💳',
        personal_id: await this.generateUniquePersonalId()
      });
      user = await User.findOne({ where: { id: userId } });
    }

    return {
      uid: user.uid,
      username: user.username,
      avatar: user.avatar,
      email: user.email,
      phone: user.phone ? maskPhone(user.phone) : null,
      gender: user.gender,
      age: user.age,
      city: user.city,
      bio: user.bio,
      personal_id: user.personal_id
    };
  }

  /**
   * 更新用户头像，返回旧头像 URL（供调用方清理旧文件）
   * @param {number} userId - 用户内部 id
   * @param {string} newUrl - 新头像 URL
   * @returns {Promise<string|null>} 旧头像 URL 或 null（用户不存在）
   */
  async updateAvatar(userId, newUrl) {
    const User = getModel('User');
    const user = await User.findOne({ where: { id: userId } });
    if (!user) return null;
    const oldAvatar = user.avatar;
    user.avatar = newUrl;
    await user.save();
    return oldAvatar;
  }

  /**
   * 更新用户基础资料（仅允许指定字段，防注入）
   * @param {number} userId - 用户内部 id
   * @param {object} data - 待更新字段（username/avatar/gender/age/city/bio/personal_id）
   * @returns {Promise<object|null>} 更新后资料或 null（用户不存在）
   */
  async updateProfile(userId, data) {
    const User = getModel('User');
    const user = await User.findOne({ where: { id: userId } });
    if (!user) return null;

    const allowedFields = ['username', 'avatar', 'gender', 'age', 'city', 'bio', 'personal_id'];
    const updateData = {};
    for (const k of allowedFields) {
      if (data[k] !== undefined) updateData[k] = data[k];
    }
    await user.update(updateData);

    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      gender: user.gender,
      age: user.age,
      city: user.city,
      bio: user.bio,
      personal_id: user.personal_id
    };
  }
}

export default new UserDao();
