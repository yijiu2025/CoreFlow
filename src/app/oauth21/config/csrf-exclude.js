/**
 * CSRF 保护排除路径
 *
 * 这些路径不需要 CSRF 校验：
 * - 公开接口（登录、注册、验证码）
 * - OAuth 2.1 标准端点（token、revoke、authorize）
 * - 第三方回调（device、qr）
 * - WebSocket 连接
 * - 跨域 API 绑定接口
 */
export const CSRF_EXCLUDE_PATHS = [
  // 登录/注册
  '/oauth2.1/login',
  '/oauth2.1/mini-login',
  '/oauth2.1/mini-register',

  // OAuth 2.1 标准端点
  '/oauth2.1/authorize',
  '/oauth2.1/token',
  '/oauth2.1/revoke',
  '/oauth2.1/crypto',

  // 扫码/设备授权
  '/oauth2.1/qr',
  '/oauth2.1/device',

  // 验证码服务
  '/verify/',

  // Session/Token 绑定（跨域 API 调用）
  '/auth/v1/bind-token',
  '/auth/v1/bind-session',

  // WebSocket
  '/api/firewall/v1/monitor/ws'
];
