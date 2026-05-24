import request from '@/utils/request'
import { rsaEncrypt, generateNonce } from '@/utils/crypto'

/**
 * 登录请求负载类型
 */
export interface LoginPayload {
  phone?: string
  email?: string
  code?: string
  username?: string
  password?: string
  type: 'sms' | 'pwd' | 'email'
}

/**
 * 认证相关接口
 */
export const authApi = {
  /**
   * 安全登录
   * @param payload 登录信息
   */
  async login(payload: LoginPayload & { captchaKey?: string; client_id?: string }) {
    const { captchaKey, client_id, ...rest } = payload
    const payloadStr = JSON.stringify(rest)
    const encrypted = await rsaEncrypt(payloadStr)
    
    return request.post('/oauth2.1/login', {
      encrypted,
      timestamp: Date.now(),
      nonce: generateNonce(),
      scope: 'openid profile email',
      captchaKey,
      client_id
    })
  },

  /**
   * 快捷登录确认授权
   */
  async confirmConsent(consentKey: string) {
    return request.post('/oauth2.1/login/consent/confirm', { consentKey })
  },

  /**
   * 注册请求
   * @param data 注册信息
   */
  async register(data: any) {
    return request.post('/user/v1/register', data)
  },

  /**
   * 发送短信验证码
   * @param phone 手机号
   */
  async sendCode(phone: string) {
    return request.post('/send-code', { phone })
  },

  /**
   * 发送邮箱验证码 (支持图形验证码校验)
   */
  async sendEmailCode(email: string, captchaKey?: string) {
    return request.post('/user/v1/send-email-code', { email, captchaKey })
  },

  /**
   * 校验验证码 (通用)
   * @param account 手机或邮箱
   * @param code 验证码
   */
  async verifyCode(account: string, code: string) {
    return request.post('/verify-code', { account, code })
  },

  /**
   * 校验昵称是否重复
   * @param nickname 昵称
   */
  async checkNickname(nickname: string) {
    return request.get('/user/v1/check-nickname', { params: { nickname } })
  },

  /**
   * 校验邮箱是否重复
   * @param email 邮箱
   */
  async checkEmail(email: string) {
    return request.get('/user/v1/check-email', { params: { email } })
  },

  /**
   * 获取图形验证码 (后端协同)
   */
  async getCaptcha() {
    return request.get('/verify/v1/generate-captcha')
  },

  /**
   * 预验证图形验证码 (如提供 email，后台可同步发送邮件)
   */
  async verifyCaptcha(captchaKey: string, captchaValue: string, email?: string, type?: string) {
    return request.post('/verify/v1/verify-captcha', { captchaKey, captchaValue, email, type })
  },

  /**
   * 获取用户信息
   */
  async getUserInfo() {
    return request.get('/oauth2.1/userinfo')
  },

  /**
   * 刷新 Token (示例)
   */
  async refreshToken() {
    return request.post('/auth/refresh')
  },

  /**
   * 检查授权状态 (获取当前 Cookie 登录用户信息)
   */
  async checkAuthorize(params: Record<string, any>) {
    return request.get('/authorize', { params })
  },

  /**
   * 提交授权 (针对已登录用户)
   */
  async authorizeConsent(data: { sessionId: string; user_id: string; action: 'approve' | 'deny' }) {
    // 因为这会引发 302 跳转，可能需要特殊处理，但目前按普通 POST 发送
    return request.post('/authorize/consent', data)
  }
}
