import Logger from '../../log/index.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb, getRedis } from '../../auth/als.js';
import { xToken } from '../../auth/xToken.js';

export class SsoUserDao {
  /**
   * SSO 统一登录：验证并获取临时票据 (Ticket)
   */
  async getSsoTicket(ctx, v) {
    const { username, password, email, verification_code, appId } = v.data;

    let user;

    // 1. 验证身份
    if (email) {
      // 邮箱登录
      await this._verifyEmailCode(email, verification_code);
      user = await getDb().user.User.findOne({ where: { email } });
    } else {
      // 用户名密码登录 (直接查 UserIdentity)
      const identity = await getDb().user.UserIdentity.findOne({
        where: { identifier: username, identity_type: 'PASSWORD' }
      });

      // 验证凭证
      if (!identity || identity.credential !== password) {
        throw new Error('AUTH_FAILED:用户名或密码错误');
      }

      user = await getDb().user.User.findByPk(identity.uid);
    }

    if (!user) throw new Error('NOT_FOUND:账号不存在');
    if (user.status === 0) throw new Error('FORBIDDEN:账号已被禁用');

    // 2. 更新登录痕迹
    const { ip } = ctx.state.clientInfo;
    await getDb().sso.SsoUser.upsert({
      uid: user.uid,
      last_login_at: new Date(),
      last_login_ip: ip,
      last_login_app: appId
    });

    // 3. 会话记录与限额
    const MAX_DEVICES = 5;
    const deviceId = v.data.device_id || 'unknown_device';
    const sessionCount = await getDb().sso.SsoSession.count({
      where: { uid: user.uid }
    });

    if (sessionCount >= MAX_DEVICES) {
      const oldestSession = await getDb().sso.SsoSession.findOne({
        where: { uid: user.uid },
        order: [['last_active', 'ASC']]
      });
      if (oldestSession) {
        const redisClient = getRedis();
        if (redisClient && oldestSession.token) {
          // 使用 SHA-256 摘要作为 Key，与 auth/index.js 的黑名单校验保持一致
          const tokenHash = crypto.createHash('sha256').update(oldestSession.token).digest('hex');
          await redisClient.set(`blacklist:token:${tokenHash}`, '1', 'EX', 7 * 24 * 3600);
        }
        await oldestSession.destroy();

        getDb().sso.SsoLog.create({
          uid: user.uid,
          event: 'KICK_OUT',
          app_id: appId,
          ip,
          details: {
            sessionId: oldestSession.id,
            deviceId: oldestSession.device_id
          }
        });

        Logger.auth(ctx, {
          event: 'KICK_OUT',
          uid: user.uid,
          appId,
          details: {
            sessionId: oldestSession.id,
            deviceId: oldestSession.device_id
          }
        });
      }
    }

    const session = await getDb().sso.SsoSession.create({
      uid: user.uid,
      app_id: appId,
      device_id: deviceId,
      ip,
      location: ctx.state.clientInfo.region,
      user_agent: ctx.state.clientInfo.userAgent,
      last_active: new Date()
    });

    const ticket = jwt.sign({ uid: user.uid, appId, sessionId: session.id }, process.env.SSO_SECRET, {
      expiresIn: '5m'
    });

    // 记录日志
    getDb().sso.SsoLog.create({
      uid: user.uid,
      event: 'LOGIN',
      app_id: appId,
      ip: ctx.state.clientInfo.ip,
      location: ctx.state.clientInfo.region,
      user_agent: ctx.state.clientInfo.userAgent,
      details: { deviceId, ticket: ticket.slice(-10) }
    });

    Logger.auth(ctx, {
      event: 'LOGIN',
      uid: user.uid,
      appId,
      details: { deviceId }
    });

    return ticket;
  }

  /**
   * 票据换取永久 Token
   */
  async exchangeTicket(code) {
    try {
      const payload = jwt.verify(code, process.env.SSO_SECRET);
      const token = xToken.login(payload.uid);

      if (payload.sessionId) {
        await getDb().sso.SsoSession.update({ token }, { where: { id: payload.sessionId } });
      }

      getDb().sso.SsoLog.create({
        uid: payload.uid,
        event: 'EXCHANGE',
        app_id: payload.appId,
        details: { sessionId: payload.sessionId }
      });

      return token;
    } catch (err) {
      throw new Error('EXCHANGE_FAILED:票据无效或已过期', { cause: err });
    }
  }

  /**
   * 用户注册
   */
  async register(ctx, data) {
    const { username, password, email, nickname } = data;

    // 1. 查重
    const exists = await getDb().user.User.findOne({ where: { username } });
    if (exists) throw new Error('REGISTER_FAILED:用户名已存在');

    // 2. 事务创建
    const result = await getDb().sequelize.transaction(async (t) => {
      // 创建基础表
      const user = await getDb().user.User.create({ username, email, nickname }, { transaction: t });

      // 创建身份表
      await getDb().user.UserIdentity.create(
        {
          uid: user.uid,
          identity_type: 'PASSWORD',
          identifier: username,
          credential: password // 生产环境应加密
        },
        { transaction: t }
      );

      // 初始化 SSO 痕迹
      await getDb().sso.SsoUser.create(
        {
          uid: user.uid,
          last_login_at: new Date(),
          last_login_app: 'SSO_REGISTER'
        },
        { transaction: t }
      );

      return user;
    });

    getDb().sso.SsoLog.create({
      uid: result.uid,
      event: 'REGISTER',
      ip: ctx.state.clientInfo.ip,
      details: { username }
    });

    Logger.auth(ctx, {
      event: 'REGISTER',
      uid: result.uid,
      details: { username }
    });

    return { uid: result.uid, username: result.username };
  }

  async _verifyEmailCode(email, code) {
    const isValid = await getDb().user.EmailCode.check(email, code);
    if (!isValid) throw new Error('CODE_ERROR:邮箱验证码无效');
  }

  async checkUsernameExist(username) {
    return await getDb().user.User.findOne({
      where: { username }
    });
  }
}
