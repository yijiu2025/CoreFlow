/**
 * 认证 API
 * 接入 CoreFlow OAuth21 授权
 */
import service from '@/utils/request';

export const authApi = {
  /** 登录 */
  login: (data: { email: string; password: string; rememberMe?: boolean }) =>
    service.post('/oauth21/v1/auth/login', data),

  /** 注册 */
  register: (data: { email: string; username: string; password: string; code: string }) =>
    service.post('/oauth21/v1/auth/register', data),

  /** 登出（清 API 域 sid/sid_r + 凭证 cookie） */
  clearCookie: () => service.post('/auth/v1/clear-cookie'),

  /** 获取当前用户信息 */
  getUserInfo: () => service.get('/user/v1/userinfo'),

  /** 获取权限 */
  getPermissions: () => service.get('/user/v1/permissions'),

  /** 刷新会话（sid 过期时用 sid_r cookie 换新 sid，后端 POST /auth/v1/refresh-session） */
  refreshToken: () => service.post('/auth/v1/refresh-session'),

  /** 发送验证码 */
  sendCode: (email: string) => service.post('/oauth21/v1/auth/send-email-code', { email }),

  /** 检查邮箱 */
  checkEmail: (email: string) => service.get('/oauth21/v1/auth/check-email', { params: { email } }),

  /** 绑定 Session（iframe 登录场景，用 session_token 换取 sid/sid_r Cookie） */
  bindSession: (sessionToken: string) => service.post('/auth/v1/bind-session', { session_token: sessionToken }),

  // 免密切换账号（发 accountKey=uid，后端用 HMAC(uid) 派生 HttpOnly cookie 名读 refreshToken）
  switchAccount: (accountKey: string) => service.post('/auth/v1/switch-account', { accountKey }),

  // 彻底撤销某账号记住我凭证（"忘掉该账号"，发 accountKey=uid）
  revokeSavedAccount: (accountKey: string) => service.post('/auth/v1/saved-accounts/revoke', { accountKey }),

  /** 绑定 Token（JWT 模式，用 access_token 换取 Cookie） */
  bindToken: (token: string) => service.post('/auth/v1/bind-token', { token }),

  /** 更新记住我状态 */
  updateRememberMe: (rememberMe: boolean) => service.post('/auth/v1/update-remember-me', { rememberMe }),

  /** 获取图形验证码（风险人机验证用） */
  getCaptcha: () => service.get('/verify/v1/generate-captcha'),

  /** 校验图形验证码 */
  verifyCaptcha: (captchaKey: string, captchaValue: string) =>
    service.post('/verify/v1/verify-captcha', { captchaKey, captchaValue }),

  /** 风险人机验证（请求被 __risk__ 拦截后调用，带 x-verify-token 头） */
  verifyChallenge: (verifyToken: string, captchaKey?: string) =>
    service.post('/auth/v1/verify-challenge', { captchaKey }, {
      headers: { 'x-verify-token': verifyToken }
    } as any)
};
