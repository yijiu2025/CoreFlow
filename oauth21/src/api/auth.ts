import request from '@/utils/request';
import { getStableDeviceId } from 'stable-deviceid';
import { rsaEncrypt, clearPublicKeyCache, buildEncryptedLoginPayload } from '@/utils/crypto';

/**
 * 登录请求负载类型
 */
export interface LoginPayload {
  phone?: string;
  email?: string;
  code?: string;
  username?: string;
  password?: string;
  type: 'sms' | 'pwd' | 'email';
}

/**
 * 认证相关接口
 *
 * scope 不由前端携带：scope 是 app 属性（oauth_clients 表已存），后端 directLogin
 * 从 client.scope 兜底 + 做边界校验（请求 scope ⊆ client 注册 scope）。前端写死
 * scope 既冗余又不安全（可篡改）。
 *
 * nonce + timestamp + 加密在 crypto.ts 的 buildEncryptedLoginPayload 里组装，
 * 保持 API 层只做请求转发，不含业务逻辑。
 */
export const authApi = {
  /**
   * 安全登录
   * @param payload 登录信息（不含 scope/nonce/timestamp，这些由 crypto 层组装）
   * 解密失败时自动清除公钥缓存并重试一次（应对服务器重启密钥轮换）
   */
  async login(payload: LoginPayload & { captchaKey?: string; client_id?: string }) {
    const { captchaKey, client_id, ...rest } = payload;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const encrypted = await rsaEncrypt(JSON.stringify(rest));
        return await request.post('/oauth2.1/login', {
          ...buildEncryptedLoginPayload(),
          encrypted,
          captchaKey,
          client_id
        });
      } catch (err: any) {
        if (attempt === 0 && err.message?.includes('解密失败')) {
          // 公钥可能已过期（服务器重启），清除缓存重试
          clearPublicKeyCache();
          continue;
        }
        throw err;
      }
    }
  },

  /**
   * 快捷登录确认授权
   */
  async confirmConsent(consentKey: string) {
    return request.post('/oauth2.1/login/consent/confirm', { consentKey });
  },

  /**
   * 邮箱二次验证登录（环境异常后二次确认）
   * @param verifyToken directLogin 环境异常时返回的临时令牌
   * @param code 用户输入的邮箱验证码
   */
  async verifyEmailLogin(verifyToken: string, code: string) {
    return request.post('/oauth2.1/login/verify-email', { verifyToken, code });
  },

  /**
   * 风险人机验证（请求被 __risk__ 拦截后调用）
   * 带上风险响应返回的 verifyToken，通过后 30 分钟免验。
   * @param verifyToken 风险响应 __risk__.verifyToken
   * @param captchaKey 图形验证码 key（可选，叠加图形码更严格）
   */
  async verifyChallenge(verifyToken: string, captchaKey?: string) {
    return request.post('/auth/v1/verify-challenge', { captchaKey }, {
      // 显式带 x-device-id：与 verified:${userId}:${deviceId} 标记一致，防拦截器跳过
      headers: { 'x-verify-token': verifyToken, 'x-device-id': getStableDeviceId() }
    });
  },

  /**
   * 重发登录二次验证邮箱码（不需图形码，凭 verifyToken）
   */
  async sendLoginVerifyCode(verifyToken: string) {
    return request.post('/verify/v1/send-login-verify-code', { verifyToken });
  },

  /**
   * 注册请求
   * @param data 注册信息
   */
  async register(data: any) {
    return request.post('/user/v1/register', data);
  },

  /**
   * 发送短信验证码
   * @param phone 手机号
   */
  async sendCode(phone: string) {
    return request.post('/send-code', { phone });
  },

  /**
   * 发送邮箱验证码 (支持图形验证码校验)
   */
  async sendEmailCode(email: string, captchaKey?: string) {
    return request.post('/user/v1/send-email-code', { email, captchaKey });
  },

  /**
   * 校验验证码 (通用)
   * @param account 手机或邮箱
   * @param code 验证码
   */
  async verifyCode(account: string, code: string) {
    return request.post('/verify-code', { account, code });
  },

  /**
   * 校验昵称是否重复
   * @param nickname 昵称
   */
  async checkNickname(nickname: string) {
    return request.get('/user/v1/check-nickname', { params: { nickname } });
  },

  /**
   * 校验邮箱是否重复
   * @param email 邮箱
   */
  async checkEmail(email: string) {
    return request.get('/user/v1/check-email', { params: { email } });
  },

  /**
   * 获取图形验证码 (后端协同)
   */
  async getCaptcha() {
    return request.get('/verify/v1/generate-captcha');
  },

  /**
   * 预验证图形验证码 (如提供 email，后台可同步发送邮件)
   */
  async verifyCaptcha(captchaKey: string, captchaValue: string, email?: string, type?: string) {
    return request.post('/verify/v1/verify-captcha', { captchaKey, captchaValue, email, type });
  },

  /**
   * 获取用户信息
   */
  async getUserInfo() {
    return request.get('/user/v1/userinfo');
  },

  /**
   * 检查授权状态 (获取当前 Cookie 登录用户信息)
   * 返回 {action:'login'|'consent', client_name, scope, sessionId, user}
   */
  async checkAuthorize(params: Record<string, any>) {
    return request.get('/oauth2.1/authorize', { params });
  },

  /**
   * 提交授权确认/拒绝 (针对已登录用户)
   * 后端签发 authorization_code 并 302 重定向到 redirect_uri
   */
  async authorizeConsent(data: { sessionId: string; user_id: string; action: 'approve' | 'deny' }) {
    return request.post('/oauth2.1/authorize/consent', data);
  },

  /**
   * 生成登录二维码
   * client_id/scope 存入二维码，移动端扫描时能识别给哪个应用登录
   * 后端返回 qrContent（二维码内容，含 client_id），前端用 QRCode 生成图片
   */
  async generateQR(params?: { client_id?: string }) {
    return request.get('/oauth2.1/qr/generate', { params });
  },

  /**
   * 查询二维码状态（PC 端轮询）
   * 只传 qrKey：client_id 从存储取（防 PC 端调包）
   * confirmed 时后端返回 token 响应（access_token/session_token 等）
   */
  async checkQRStatus(qrKey: string) {
    return request.get('/oauth2.1/qr/status', { params: { qrKey } });
  },

  /**
   * 验证码方式重置密码
   * 校验邮箱码（绑 sessionId=captchaKey + 指纹）后改密码
   * newPassword 为 RSA 加密密文，后端用 kid 解密
   */
  async resetPassword(email: string, code: string, encryptedPassword: string, captchaKey?: string, kid?: string | null) {
    return request.post('/user/v1/reset-password', { email, code, password: encryptedPassword, captchaKey, kid: kid || undefined });
  },

  /**
   * 发送密码重置链接到邮箱
   * 需先通过图形验证码（captchaKey 由前端 GraphicCaptcha 校验后获得）
   * 后端校验 captchaKey 已 verified + 一次性消费 + 绑指纹 + 发邮件
   */
  async sendResetLink(email: string, captchaKey: string) {
    return request.post('/user/v1/send-reset-link', { email, captchaKey });
  },

  /**
   * 通过链接 token 重置密码
   * newPassword 为 RSA 加密密文，后端用 kid 解密
   */
  async resetPasswordByLink(token: string, encryptedPassword: string, kid?: string | null) {
    return request.post('/user/v1/reset-password-by-link', { token, password: encryptedPassword, kid: kid || undefined });
  }
};
