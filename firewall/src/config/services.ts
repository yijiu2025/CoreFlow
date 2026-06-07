/**
 * 后端服务地址配置
 *
 * 所有后端服务的 URL 统一在此管理，部署时只需修改此处或对应的环境变量。
 * 环境变量优先级高于默认值。
 */

/** API 服务（防火墙后端） */
export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')

/** WebSocket 服务 */
export const WS_HOST = import.meta.env.VITE_WS_HOST || (import.meta.env.DEV ? 'localhost:3000' : '')

/** SSO 登录服务（OAuth21） */
export const SSO_URL = import.meta.env.VITE_SSO_URL || 'http://localhost:5174'

/** 用户信息服务（获取 userinfo 等） */
export const USER_API_URL = import.meta.env.VITE_USER_API_URL || API_BASE_URL

/** SSO 登录页面路径 */
export const SSO_LOGIN_PATH = '/mini-login'

/** SSO 登录默认参数 */
export const SSO_LOGIN_PARAMS = {
  lang: 'zh_cn',
  appName: 'firewall',
  appEntrance: 'web',
  styleType: 'horizontal',
  bizParams: '',
  notLoadSsoView: 'false',
  notKeepLogin: 'false',
  isMobile: 'false',
  qrCodeFirst: 'false',
  site: '01'
}

/** 构建 SSO 登录完整 URL */
export function buildSsoLoginUrl(): string {
  const params = new URLSearchParams({
    ...SSO_LOGIN_PARAMS,
    rnd: Math.random().toString()
  })
  return `${SSO_URL}${SSO_LOGIN_PATH}?${params.toString()}`
}
