import jwt from 'jsonwebtoken';
import sequelize from '../../db/index.js';
import { decrypt } from '../../oauth21/crypto/encryption.js';
import bcrypt from 'bcryptjs';
import Logger from '../../log/index.js';
import IamDao from '../../admin/dao/iam.dao.js';

class UserDao {
  async checkUsernameExist(username) {
    const isExist = await sequelize.models.User.findOne({ where: { username } });
    return !!isExist;
  }

  async checkEmailExist(email) {
    const isExist = await sequelize.models.User.findOne({ where: { email } });
    return !!isExist;
  }

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
    const { allows, denies } = await IamDao.buildUserEffectivePolicy(user.uid, appId || 'GLOBAL');

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

    const refreshToken = jwt.sign({ uid: user.uid, appId, type: 'refresh' }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });

    return { accessToken, refreshToken };
  }

  async getInformation(ctx) {
    const { uid } = ctx.state.user;
    return await sequelize.models.User.findOne({
      where: { uid },
      include: [{ model: sequelize.models.Role, as: 'roles', through: { attributes: [] } }]
    });
  }

  async registerUser(request) {
    const { email, password: encryptedPassword, role_ids } = request.body;
    let { username } = request.body;
    if (!username) username = email;

    const password = decrypt(encryptedPassword);
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).+$/;
    if (!passwordRegex.test(password)) {
      throw new Error('REGISTER_FAILED:密码必须同时包含数字和字母');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    return await sequelize.transaction(async (t) => {
      const user = await sequelize.models.User.create({ username, email }, { transaction: t });

      await sequelize.models.UserIdentity.create({
        user_id: user.id,
        identity_type: 'password',
        identifier: email,
        credential: hashedPassword
      }, { transaction: t });

      const roleIds = role_ids || [];
      if (roleIds.length > 0) {
        for (const rid of roleIds) {
          await sequelize.models.UserRole.create({
            user_id: user.id,
            role_id: rid,
            app_id: 'GLOBAL'
          }, { transaction: t });
        }
      } else {
        const guestRole = await sequelize.models.Role.findOne({
          where: { rank_level: 1, app_id: 'GLOBAL' },
          transaction: t
        });
        if (guestRole) {
          await sequelize.models.UserRole.create({
            user_id: user.id,
            role_id: guestRole.id,
            app_id: 'GLOBAL'
          }, { transaction: t });
        }
      }

      return user;
    });
  }
}

export default new UserDao();
