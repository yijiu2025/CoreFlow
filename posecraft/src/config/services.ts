/**
 * 后端服务地址配置
 */

/** API 服务 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')

/** SSO 登录服务（OAuth21） */
export const SSO_URL = import.meta.env.VITE_SSO_URL || 'http://localhost:5174'

/** SSO 登录页面路径 */
export const SSO_LOGIN_PATH = '/mini-login'

/** SSO 登录默认参数 */
export const SSO_LOGIN_PARAMS = {
  lang: 'zh_cn',
  appName: 'posecraft',
  appEntrance: 'web',
  styleType: 'horizontal',
  biz_params: '',
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
