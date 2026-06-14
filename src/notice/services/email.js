/**
 * 邮件发送服务
 * 接入 Nodemailer，支持动态配置、连接复用、发送重试、异步队列、模板系统
 */
import nodemailer from 'nodemailer';
import Logger from '../../log/index.js';
import noticeDao from '../../app/notice/dao/notice.js';

/** 缓存的 transporter 和配置哈希 */
let cachedTransporter = null;
let cachedConfigHash = '';

/** 异步发送队列（高并发时不阻塞请求） */
const sendQueue = [];
let isProcessing = false;
const QUEUE_BATCH_SIZE = 10;
const QUEUE_INTERVAL_MS = 1000;

/**
 * 获取或创建 transporter（配置变更时自动重建）
 */
async function getTransporter() {
  const config = await noticeDao.getConfig('email');

  if (!config.host || !config.user) {
    throw new Error('SMTP 配置不完整，请在管理后台进行配置');
  }

  const hash = `${config.host}:${config.port}:${config.user}:${config.pass}`;
  if (cachedConfigHash !== hash || !cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass }
    });
    cachedConfigHash = hash;
  }

  return cachedTransporter;
}

/**
 * 处理发送队列
 */
async function processQueue() {
  if (isProcessing || sendQueue.length === 0) return;
  isProcessing = true;

  const batch = sendQueue.splice(0, QUEUE_BATCH_SIZE);

  for (const task of batch) {
    try {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from:
          (await noticeDao.getConfig('email')).from ||
          (await noticeDao.getConfig('email')).user,
        to: task.email,
        subject: task.subject,
        html: task.content
      });
      Logger.info(
        `[Notice:Email] 发送成功: ${task.email}, MessageID: ${info.messageId}`
      );
      task.resolve(true);
    } catch (err) {
      Logger.error(`[Notice:Email] 发送失败: ${task.email} - ${err.message}`);
      cachedTransporter = null;
      cachedConfigHash = '';
      task.resolve(false);
    }
  }

  isProcessing = false;

  // 队列中还有任务，继续处理
  if (sendQueue.length > 0) {
    setTimeout(processQueue, QUEUE_INTERVAL_MS);
  }
}

/**
 * 渲染模板（替换 {变量} 占位符）
 * @param {string} template 模板字符串
 * @param {object} vars 变量对象
 * @returns {string}
 */
function renderTemplate(template, vars = {}) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

class EmailService {
  /**
   * 发送原始邮件（带重试）
   * @param {string} email 收件人
   * @param {string} subject 主题
   * @param {string} content HTML 内容
   * @param {number} [maxRetries=2] 最大重试次数
   * @returns {Promise<boolean>}
   */
  async send(email, subject, content, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const transporter = await getTransporter();
        const config = await noticeDao.getConfig('email');

        const info = await transporter.sendMail({
          from: config.from || config.user,
          to: email,
          subject,
          html: content
        });

        Logger.info(
          `[Notice:Email] 发送成功: ${email}, MessageID: ${info.messageId}`
        );
        return true;
      } catch (error) {
        if (attempt === maxRetries) {
          Logger.error(
            `[Notice:Email] 发送失败 (已重试${maxRetries}次): ${email} - ${error.message}`
          );
          cachedTransporter = null;
          cachedConfigHash = '';
          return false;
        }
        Logger.warn(
          `[Notice:Email] 发送失败，${attempt + 1}/${maxRetries}次重试: ${email}`
        );
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    return false;
  }

  /**
   * 异步发送（加入队列，不阻塞调用方）
   * @param {string} email 收件人
   * @param {string} subject 主题
   * @param {string} content HTML 内容
   * @returns {Promise<boolean>}
   */
  async sendAsync(email, subject, content) {
    return new Promise((resolve) => {
      sendQueue.push({ email, subject, content, resolve });

      // 队列满时立即处理
      if (sendQueue.length >= QUEUE_BATCH_SIZE) {
        processQueue();
      } else if (!isProcessing) {
        setTimeout(processQueue, QUEUE_INTERVAL_MS);
      }
    });
  }

  /**
   * 使用模板发送邮件
   * @param {string} email 收件人
   * @param {string} templateId 模板 ID（如 'verification_code'）
   * @param {object} vars 模板变量 { code: '123456', ttl: '10' }
   * @returns {Promise<boolean>}
   */
  async sendWithTemplate(email, templateId, vars = {}) {
    const template = await noticeDao.getTemplate(templateId);
    if (!template) {
      Logger.error(`[Notice:Email] 模板不存在: ${templateId}`);
      return false;
    }

    const subject = renderTemplate(template.subject, vars);
    const content = renderTemplate(template.content, vars);
    return await this.send(email, subject, content);
  }

  /**
   * 发送验证码邮件（使用模板）
   * @param {string} email 收件人
   * @param {string} code 验证码
   * @returns {Promise<boolean>}
   */
  async sendVerificationCode(email, code) {
    return await this.sendWithTemplate(email, 'verification_code', {
      code,
      ttl: '10'
    });
  }

  /**
   * 发送通用模板邮件
   * @param {string} email 收件人
   * @param {string} subject 主题
   * @param {string} bodyText 正文文本
   * @returns {Promise<boolean>}
   */
  async sendTemplate(email, subject, bodyText) {
    const content = `
    <div style="padding:20px;background:#f5f5f5;font-family:sans-serif;">
      <div style="background:#fff;padding:40px;border-radius:12px;max-width:600px;margin:0 auto;">
        <div style="color:#333;font-size:15px;line-height:1.8;">${bodyText}</div>
        <div style="text-align:center;margin-top:30px;color:#bbb;font-size:12px;border-top:1px solid #eee;padding-top:15px;">
          © ${new Date().getFullYear()} CoreFlow 自动回复系统
        </div>
      </div>
    </div>`;
    return await this.send(email, subject, content);
  }

  /**
   * 获取队列状态
   * @returns {{ pending: number, processing: boolean }}
   */
  getQueueStatus() {
    return { pending: sendQueue.length, processing: isProcessing };
  }
}

export default new EmailService();
