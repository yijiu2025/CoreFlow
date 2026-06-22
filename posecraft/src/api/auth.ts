/**
 * 认证 API
 * 接入 CoreFlow OAuth21 授权
 */
import service from '@/utils/request'

export const authApi = {
  /** 登录 */
  login: (data: { email: string; password: string; rememberMe?: boolean }) =>
    service.post('/oauth21/v1/auth/login', data),

  /** 注册 */
  register: (data: { email: string; username: string; password: string; code: string }) =>
    service.post('/oauth21/v1/auth/register', data),

  /** 登出 */
  logout: () => service.post('/oauth21/v1/auth/logout'),

  /** 获取当前用户信息 */
  getUserInfo: () => service.get('/user/v1/userinfo'),

  /** 获取权限 */
  getPermissions: () => service.get('/user/v1/permissions'),

  /** 刷新 Token */
  refreshToken: () => service.post('/oauth21/v1/auth/refresh'),

  /** 发送验证码 */
  sendCode: (email: string) =>
    service.post('/oauth21/v1/auth/send-email-code', { email }),

  /** 检查邮箱 */
  checkEmail: (email: string) =>
    service.get('/oauth21/v1/auth/check-email', { params: { email } }),

  /** 绑定 Session（iframe 登录场景，用 session_token 换取 sid/sid_r Cookie） */
  bindSession: (sessionToken: string) =>
    service.post('/auth/v1/bind-session', { session_token: sessionToken }),

  /** 绑定 Token（JWT 模式，用 access_token 换取 Cookie） */
  bindToken: (token: string) =>
    service.post('/auth/v1/bind-token', { token })
}
