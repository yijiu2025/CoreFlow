import jwt from 'jsonwebtoken';
import { getDb } from '../../auth/als.js';
import { uniq } from 'lodash-es';
import { decryptWithPrivateKey } from '../../auth/utils/lib/encrypt.js'; // 适配项目路径
import Logger from '../../log/index.js';

class UserDao {
  /**
   * 检测用户名是否存在
   * @param {*} username
   * @returns boolean
   */
  async checkUsernameExist(username) {
    const isExist = await getDb().user.User.findOne({
      where: {
        username
      }
    });
    return !!isExist;
  }

  /**
   * 检测邮箱是否已存在
   * @param {*} email
   * @returns boolean
   */
  async checkEmailExist(email) {
    const isExist = await getDb().user.User.findOne({
      where: {
        email
      }
    });
    return !!isExist;
  }

  /**
   * 创建用户 (管理后台使用)
   */
  async createUser(v) {
    const username = v.get('body.username');
    const email = v.get('body.email');

    let user = await getDb().user.User.findOne({ where: { username } });
    if (user) throw new Error('REGISTER_FAILED:用户名已存在');

    if (email && email.trim() !== '') {
      user = await getDb().user.User.findOne({ where: { email } });
      if (user) throw new Error('REGISTER_FAILED:邮箱已存在');
    }

    // 处理分组权限逻辑
    const groupIds = v.get('body.group_ids') || [];
    if (groupIds.length > 0) {
      for (const id of groupIds) {
        const group = await getDb().user.Group.findByPk(id);
        if (!group) throw new Error(`NOT_FOUND:分组[${id}]不存在`);
      }
    }

    return await this.registerUser(v);
  }

  /**
   * 获取 Token (登录逻辑)
   */
  async getTokens(v, ctx) {
    const { username, appId } = v.get('body');
    const password = decryptWithPrivateKey(v.get('body.password'));

    if (!username || !password) {
      throw new Error('AUTH_FAILED:用户名或密码不能为空');
    }

    // 1. 验证身份
    const identity = await getDb().user.UserIdentity.findOne({
      where: { identifier: username, identity_type: 'PASSWORD' }
    });

    if (!identity || identity.credential !== password) {
      throw new Error('AUTH_FAILED:用户名或密码错误');
    }

    // 2. 记录登录迹 (SSO 追踪表)
    if (getDb().sso?.SsoUser) {
      await getDb().sso.SsoUser.upsert({
        uid: identity.uid,
        last_login_at: new Date(),
        last_login_ip: ctx.state.clientInfo?.ip,
        last_login_app: appId || 'DIRECT_LOGIN'
      });
    }

    // 3. 记录日志 (数据库日志)
    if (getDb().sso?.SsoLog) {
      await getDb().sso.SsoLog.create({
        uid: identity.uid,
        event: 'LOGIN',
        app_id: appId,
        ip: ctx.state.clientInfo?.ip,
        details: { method: 'UserDao.getTokens' }
      });
    }

    // 4. 生成 Token (携带 appId)
    const accessToken = global.xToken.login(identity.uid, { appId });

    // Refresh Token 逻辑 (携带 appId)
    const refreshToken = jwt.sign({ uid: identity.uid, appId, type: 'refresh' }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });

    return { accessToken, refreshToken };
  }

  /**
   * 更新用户信息
   */
  async updateUser(ctx, v) {
    const user = ctx.state.user; // 从 context 获取当前用户
    if (!user) throw new Error('AUTH_FAILED:请先登录');

    const currentUser = await getDb().user.User.findByPk(user.uid);

    const newUsername = v.get('body.username');
    if (newUsername && currentUser.username !== newUsername) {
      const exit = await getDb().user.User.findOne({
        where: { username: newUsername }
      });
      if (exit) throw new Error('UPDATE_FAILED:用户名已存在');
      currentUser.username = newUsername;
    }

    const newEmail = v.get('body.email');
    if (newEmail && currentUser.email !== newEmail) {
      const exit = await getDb().user.User.findOne({
        where: { email: newEmail }
      });
      if (exit) throw new Error('UPDATE_FAILED:邮箱已存在');
      currentUser.email = newEmail;
    }

    if (v.get('body.nickname')) currentUser.nickname = v.get('body.nickname');
    if (v.get('body.avatar')) currentUser.avatar = v.get('body.avatar');

    await currentUser.save();
    return true;
  }

  async getUserByEmail(email) {
    return await getDb().user.User.findOne({ where: { email } });
  }

  /**
   * 获取用户详细资料 (包含分组)
   */
  async getInformation(ctx) {
    const { uid } = ctx.state.user;
    return await getDb().user.User.findByPk(uid, {
      include: [
        {
          model: getDb().user.Group,
          as: 'groups',
          through: { attributes: [] }
        }
      ]
    });
  }

  /**
   * 获取用户权限列表 (聚合所有分组权限)
   */
  async getPermissions(ctx) {
    const { uid } = ctx.state.user;
    const user = await getDb().user.User.findByPk(uid, {
      include: [
        {
          model: getDb().user.Group,
          as: 'groups',
          include: [
            {
              model: getDb().user.Permission,
              as: 'permissions'
            }
          ]
        }
      ]
    });

    if (!user) return [];

    const permissions = [];
    user.groups.forEach((group) => {
      group.permissions.forEach((p) => {
        permissions.push({
          id: p.id,
          name: p.name,
          module: p.module,
          app_id: p.app_id
        });
      });
    });

    return uniq(permissions, (p) => `${p.module}:${p.name}:${p.app_id}`);
  }

  /**
   * 发送邮箱验证码
   */
  async sendEmailCode(email, sessionId) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[EmailCode] To: ${email}, Code: ${code}, Session: ${sessionId}`);

    // 使用 upsert 简化逻辑
    await getDb().user.EmailCode.upsert({
      email,
      code,
      session_id: sessionId,
      attempts: 0,
      expire: new Date(Date.now() + 10 * 60 * 1000)
    });

    // 调用真实的邮件发送工具 (如果可用)
    return await this.sendVerificationCode(email, code);
  }

  /**
   * 校验邮箱验证码
   */
  async checkEmailCode(v) {
    const { email, verification_code: code, session_id: sessionId } = v.get('body');

    const emailCode = await getDb().user.EmailCode.findOne({
      where: { email, session_id: sessionId }
    });

    if (!emailCode) throw new Error('CODE_ERROR:验证码不存在或已过期');
    if (emailCode.attempts >= 5) throw new Error('CODE_ERROR:尝试次数过多，请重新获取');
    if (new Date() > new Date(emailCode.expire)) throw new Error('CODE_ERROR:验证码已过期');

    if (emailCode.code === code) {
      // 按照用户需求：验证成功后将尝试次数设为 0 表示已验证
      emailCode.attempts = 0;
      await emailCode.save();
      return true;
    } else {
      emailCode.attempts += 1;
      await emailCode.save();
      throw new Error(`CODE_ERROR:验证码错误 (剩余尝试次数: ${5 - emailCode.attempts})`);
    }
  }

  /**
   * 注册用户核心逻辑 (事务)
   */
  async registerUser(v) {
    const username = v.get('body.username');
    const password = decryptWithPrivateKey(v.get('body.password'));
    const email = v.get('body.email');
    const nickname = v.get('body.nickname');
    const groupIds = v.get('body.group_ids') || [];

    return await getDb().sequelize.transaction(async (t) => {
      // 1. 创建基础信息
      const user = await getDb().user.User.create(
        {
          username,
          email,
          nickname
        },
        { transaction: t }
      );

      // 2. 创建身份信息
      await getDb().user.UserIdentity.create(
        {
          uid: user.uid,
          identity_type: 'PASSWORD',
          identifier: username,
          credential: password
        },
        { transaction: t }
      );

      // 3. 绑定分组
      if (groupIds.length > 0) {
        for (const gid of groupIds) {
          await getDb().user.UserGroup.create(
            {
              uid: user.uid,
              group_id: gid
            },
            { transaction: t }
          );
        }
      } else {
        // 默认加入 Guest 分组 (level 2)
        const guestGroup = await getDb().user.Group.findOne({
          where: { level: 2 }
        });
        if (guestGroup) {
          await getDb().user.UserGroup.create(
            {
              uid: user.uid,
              group_id: guestGroup.id
            },
            { transaction: t }
          );
        }
      }

      // 4. 初始化 SSO 追踪
      if (getDb().sso?.SsoUser) {
        await getDb().sso.SsoUser.create(
          {
            uid: user.uid,
            last_login_at: new Date(),
            last_login_app: 'REGISTER'
          },
          { transaction: t }
        );
      }

      return user;
    });
  }

  /**
   * 重置密码
   */
  async resetPassword(v) {
    const email = v.get('body.email');
    const newPassword = decryptWithPrivateKey(v.get('body.new_password'));

    const user = await getDb().user.User.findOne({ where: { email } });
    if (!user) throw new Error('NOT_FOUND:用户不存在');

    await getDb().user.UserIdentity.update(
      { credential: newPassword },
      { where: { uid: user.uid, identity_type: 'PASSWORD' } }
    );

    Logger.info(`Password reset for user: ${user.uid}`);
    return true;
  }

  /**
   * 模拟邮件发送
   */
  async sendVerificationCode(email, code) {
    // 这里未来可以接入 Nodemailer 等真实服务
    Logger.info(`Sending email to ${email} with code ${code}`);
    return true;
  }
}

export { UserDao };
