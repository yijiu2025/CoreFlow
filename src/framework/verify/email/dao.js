/**
 * 邮箱验证码数据访问层
 * 处理频率限制、存储、校验逻辑
 *
 * 安全：验证码存储绑定客户端指纹（IP + UA hash），用码时回查一致性，
 * 防止验证码被截获后在另一客户端冒用（如邮件被劫持后异地消费）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'crypto';
import Logger from '../../log/index.js';
import emailService from './service.js';
import config from '../config.js';

class EmailDao {
  constructor() {
    this.rateLimit = config.common.rateLimit;
    this.codeTtl = config.common.codeTtl;
    this.deviceEnabled = config.device?.enabled === true;
  }

  /**
   * 邮箱脱敏：u***@example.com
   * @param {string} email 完整邮箱
   * @returns {string} 掩码后的邮箱
   */
  maskEmail(email) {
    const [local, domain] = String(email || '').split('@');
    if (!domain) return '***';
    const head = local.slice(0, Math.min(2, local.length));
    return `${head}***@${domain}`;
  }

  /**
   * 计算客户端指纹
   *
   * 基础：SHA-256(IP | UA)，防邮件被劫持后异地消费
   * 增强（DEVICE_FINGERPRINT_ENABLED=true 时）：合并前端 canvas/WebGL 指纹，
   *   抵制代理池换 IP+UA 绕过（正常环境不启用，隐私友好）
   *
   * @param {string} ip 客户端 IP
   * @param {string} ua User-Agent
   * @param {string} [deviceFp] 前端采集的 canvas/WebGL 指纹（启用时）
   * @returns {string} SHA-256 指纹 hex（前 32 位）
   */
  fingerprint(ip, ua, deviceFp) {
    let material = `${ip || ''}|${ua || ''}`;
    if (this.deviceEnabled && deviceFp) {
      material += `|${deviceFp}`;
    }
    return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
  }

  /**
   * 发送邮箱验证码
   * @param {string} email 邮箱地址
   * @param {string} sessionId 会话标识（图形验证码 captchaKey）
   * @param {object} store 存储适配器
   * @param {object} [ctx] 请求上下文 { ip, ua }，用于绑定客户端指纹
   * @returns {Promise<boolean>}
   */
  async sendCode(email, sessionId, store, ctx = {}) {
    const code = emailService.generateCode();
    // 🔴 PII 脱敏：不落完整邮箱（此前 [Verify] 日志含完整 email + sessionId）
    Logger.info(`[Verify] 发送验证码: ${this.maskEmail(email)}`);

    // 频率限制检查
    const current = await store.get(email);
    if (current) {
      const diff = (Date.now() - current.sentAt) / 1000;
      if (diff < this.rateLimit) {
        throw new Error(`SEND_CODE_FAILED:发送过于频繁，请在 ${Math.ceil(this.rateLimit - diff)} 秒后再试`);
      }
    }

    // 存储验证码 + 客户端指纹（IP+UA，启用时合并 device 指纹），用码时回查一致性
    const fingerprint = this.fingerprint(ctx.ip, ctx.ua, ctx.deviceFp);
    await store.set(email, { code, sentAt: Date.now(), sessionId, fingerprint }, this.codeTtl);

    // 发送邮件
    const mailSent = await emailService.send(email, code);
    if (!mailSent) {
      throw new Error('SEND_CODE_FAILED:邮件发送服务异常，请联系管理员');
    }

    return true;
  }

  /**
   * 校验邮箱验证码（一次性消费）
   *
   * 安全校验：
   * 1. 验证码正确性
   * 2. sessionId 一致性（发码时绑定的 captchaKey 必须与用码时回传的一致）
   * 3. 客户端指纹一致性（发码时绑定的 IP+UA 必须与用码时一致，防异地冒用）
   *
   * @param {string} email 邮箱地址
   * @param {string} code 验证码
   * @param {object} store 存储适配器
   * @param {object} [ctx] 请求上下文 { ip, ua, deviceFp, sessionId }
   * @returns {Promise<boolean>}
   */
  async verifyCode(email, code, store, ctx = {}) {
    if (!email || !code) {
      throw new Error('PARAM_ERROR:邮箱和验证码不能为空');
    }

    // 🔴 爆破防护：失败尝试次数上限 5 次，达到即作废验证码（此前 6 位码在 TTL 内可无限重试）
    const MAX_ATTEMPTS = 5;
    const info = await store.get(email);
    if (!info) {
      throw new Error('VERIFY_FAILED:邮箱验证码错误或已过期');
    }

    const attempts = (info.attempts || 0) + 1;
    if (attempts > MAX_ATTEMPTS) {
      await store.delete(email);
      throw new Error('VERIFY_FAILED:尝试次数过多，请重新获取验证码');
    }

    // 记录失败尝试（保留原 TTL：按剩余时间计算，避免失败重试反而延长有效期）
    const recordFailure = async () => {
      const remainingSec = Math.max(1, Math.ceil(this.codeTtl - (Date.now() - info.sentAt) / 1000));
      await store.set(email, { ...info, attempts }, remainingSec);
    };

    if (info.code !== code) {
      await recordFailure();
      throw new Error('VERIFY_FAILED:邮箱验证码错误或已过期');
    }

    // sessionId 一致性校验：发码时绑定的 captchaKey 必须与用码时回传的一致
    // 防止 A 流程发的码被 B 流程复用（即使同 email+code 也要同 captchaKey）
    if (ctx.sessionId && info.sessionId && ctx.sessionId !== info.sessionId) {
      await recordFailure();
      throw new Error('VERIFY_FAILED:邮箱验证码错误或已过期');
    }

    // 客户端指纹一致性校验：发码时绑定的 IP+UA（启用时含 device 指纹）必须与用码时一致
    // 防止验证码被截获后在另一客户端冒用（邮件被劫持后异地消费）
    if (info.fingerprint) {
      const currentFingerprint = this.fingerprint(ctx.ip, ctx.ua, ctx.deviceFp);
      if (info.fingerprint !== currentFingerprint) {
        // 指纹不符：疑似异地冒用，静默拒绝（不暴露具体原因给攻击者）
        await recordFailure();
        throw new Error('VERIFY_FAILED:邮箱验证码错误或已过期');
      }
    }

    // 一次性原子消费：getDel 在 Redis 下是 GETDEL、Map 下同步取删，
    // 并发请求只有一个能取到值，防止同一验证码被多次消费。
    const consumed = await store.getDel(email);
    if (!consumed) {
      throw new Error('VERIFY_FAILED:邮箱验证码错误或已过期');
    }
    return true;
  }
}

const emailDao = new EmailDao();

export default emailDao;
