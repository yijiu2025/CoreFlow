import nodemailer from 'nodemailer';
import Logger from '../../log/index.js';
import noticeDao from '../dao/notice.js';

/**
 * 邮件发送服务 (接入 Nodemailer 并支持动态配置)
 */
class EmailService {
  /**
   * 发送原始邮件
   * @param {string} email 
   * @param {string} subject 
   * @param {string} content 
   */
  async send(email, subject, content) {
    try {
      // 1. 动态获取最新的邮件服务器配置
      const config = await noticeDao.getConfig('email');
      
      if (!config.host || !config.user) {
        throw new Error('SMTP 配置不完整，请在管理后台进行配置');
      }

      // 2. 创建 Transporter
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure, // 465 为 true, 其他通常为 false
        auth: {
          user: config.user,
          pass: config.pass // 授权码
        }
      });

      // 3. 发送邮件
      const info = await transporter.sendMail({
        from: config.from || config.user,
        to: email,
        subject: subject,
        html: content
      });

      Logger.info(`[Notice:Email] 邮件发送成功 To: ${email}, MessageID: ${info.messageId}`);
      return true;
    } catch (error) {
      Logger.error(`[Notice:Email] 邮件发送失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 发送验证码模板邮件
   */
  async sendVerificationCode(email, code) {
    const subject = `【验证中心】您的验证码为：${code}`;
    const content = `
    <div style="padding: 20px; background: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
      <div style="background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); max-width: 500px; margin: 0 auto;">
        <h2 style="color: #4A90E2; margin-top: 0; text-align: center;">验证码校验</h2>
        <p style="color: #666; font-size: 16px;">您正在执行敏感操作，请使用以下验证码完成身份验证：</p>
        <div style="background: #F8FBFF; border: 1px solid #E1EDFF; padding: 25px; text-align: center; font-size: 36px; font-weight: bold; color: #007AFF; letter-spacing: 8px; margin: 30px 0; border-radius: 8px;">
          ${code}
        </div>
        <p style="color: #999; font-size: 13px; border-top: 1px solid #eee; padding-top: 20px;">
          * 该验证码有效期为 10 分钟，请勿泄露给他人。<br>
          * 如果这不是您本人发起的请求，请忽略此邮件。
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #bbb; font-size: 12px;">
        © 2025 Antigravity 自动回复系统
      </div>
    </div>
    `;

    try {
      return await this.send(email, subject, content);
    } catch (error) {
      // 内部错误已在 send 中记录日志
      return false;
    }
  }
}

export default new EmailService();
