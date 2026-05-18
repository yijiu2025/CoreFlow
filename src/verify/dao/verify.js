import sequelize from '../../db/index.js';
import Logger from '../../log/index.js';
import emailService from '../../notice/services/email.js';
import captchaService from '../captcha.js';

class VerifyDao {
  /**
   * 生成图形验证码
   */
  async generateCaptcha(captchaStore) {
    return await captchaService.generate(captchaStore);
  }

  /**
   * 验证图形验证码并可选发送邮箱验证码
   */
  async verifyCaptchaAndSendEmail(params, captchaStore, emailCodeStore) {
    const { captchaKey, captchaValue, email, type } = params;

    // 1. 验证图形验证码
    const success = await captchaService.verify(captchaValue, captchaKey, captchaStore);
    if (!success) {
      throw new Error('VERIFY_FAILED:图形验证码错误或已过期');
    }

    // 2. 如果提供了邮箱，则发送邮箱验证码
    if (email) {
      // 业务前置检查（可选，根据 type 判断）
      if (type === 'register') {
        const user = await sequelize.models.User.findOne({ where: { email } });
        if (user) throw new Error('BUSINESS_ERROR:该邮箱已注册，请直接登录');
      }

      // 发送邮件（内部包含 60s 频率限制）
      await this.sendEmailCode(email, captchaKey, emailCodeStore);
      return { message: '验证成功，验证码已发送至邮箱', emailSent: true };
    }

    return { message: '图形验证成功', emailSent: false };
  }

  /**
   * 发送邮箱验证码 (核心逻辑)
   * 支持通过 REDIS_ENABLED 环境变量切换存储方案 (Redis / MySQL)
   */
  async sendEmailCode(email, sessionId, emailCodeStore) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    Logger.info(`[EmailCode] To: ${email}, Code: ${code}, Session: ${sessionId}`);

    if (emailCodeStore && process.env.REDIS_ENABLED === 'true') {
      // ⚡️ Redis 极速模式
      const current = await emailCodeStore.get(email);
      if (current) {
        const lastSentAt = current.sentAt;
        const diff = (Date.now() - lastSentAt) / 1000;
        
        if (diff < 60) {
          throw new Error(`SEND_CODE_FAILED:发送过于频繁，请在 ${Math.ceil(60 - diff)} 秒后再试`);
        }
      }

      // 存储于 Redis，设置 10 分钟 (600秒) 的生存时间 (TTL)
      await emailCodeStore.set(email, {
        code,
        sentAt: Date.now(),
        sessionId
      }, 600);
    } else {
      // 💾 MySQL 降级方案
      let emailCode = await sequelize.models.EmailCode.findOne({
        where: { email }
      });

      if (emailCode) {
        // 60秒冷却时间检查
        const now = Date.now();
        const lastSentAt = new Date(emailCode.updatedAt || emailCode.createdAt).getTime();
        const diff = (now - lastSentAt) / 1000;
        
        if (diff < 60) {
          throw new Error(`SEND_CODE_FAILED:发送过于频繁，请在 ${Math.ceil(60 - diff)} 秒后再试`);
        }

        emailCode.code = code;
        emailCode.status = 0;
        emailCode.session_id = sessionId;
        emailCode.expired_at = new Date(Date.now() + 10 * 60 * 1000); // 10分钟
        await emailCode.save();
      } else {
        await sequelize.models.EmailCode.create({
          email,
          code,
          status: 0,
          session_id: sessionId,
          expired_at: new Date(Date.now() + 10 * 60 * 1000)
        });
      }
    }

    const mailSent = await emailService.sendVerificationCode(email, code);
    if (!mailSent) {
      throw new Error('SEND_CODE_FAILED:邮件发送服务异常，请联系管理员');
    }
    
    return true;
  }

  /**
   * 校验邮箱验证码
   * 支持通过 REDIS_ENABLED 环境变量切换存储方案 (Redis / MySQL)
   */
  async checkEmailCode(email, code, emailCodeStore) {
    if (!email || !code) throw new Error('PARAM_ERROR:邮箱和验证码不能为空');
    
    if (emailCodeStore && process.env.REDIS_ENABLED === 'true') {
      // ⚡️ Redis 极速模式：获取并执行一次性消费 (阅后即焚)
      const info = await emailCodeStore.get(email);
      if (!info || info.code !== code) {
        throw new Error('VERIFY_FAILED:邮箱验证码错误或已过期');
      }
      // 验证成功，瞬间将其删除，杜绝任何并发竞争与重放攻击
      await emailCodeStore.delete(email);
    } else {
      // 💾 MySQL 降级方案：原子校验更新
      const isValid = await sequelize.models.EmailCode.check(email, code);
      if (!isValid) {
        throw new Error('VERIFY_FAILED:邮箱验证码错误或已过期');
      }
    }

    return true;
  }
}

export default new VerifyDao();
