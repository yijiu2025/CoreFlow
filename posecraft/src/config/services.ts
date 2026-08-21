/**
 * 后端服务地址配置
 */

/** API 服务 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '');

/** SSO 登录服务（OAuth21） */
export const SSO_URL = import.meta.env.VITE_SSO_URL || 'http://localhost:5174';

/** SSO 登录页面路径 */
export const SSO_LOGIN_PATH = '/mini-login';

/** 登录弹窗展示文案（按应用配置，供 LoginModal 引用） */
export const LOGIN_COPY = {
  title: '登录后免费畅享高清视频',
  subtitle: '选择账号一键登录，或登录其他账号'
};

/** SSO 登录默认参数 */
export const SSO_LOGIN_PARAMS = {
  lang: 'zh_cn',
  appName: 'posecraft',
  appEntrance: 'web',
  styleType: 'horizontal',
  biz_params: '',
  notLoadSsoView: 'false',
  // 不传 notKeepLogin：posecraft 不干预 oauth21 登录页的"保持登录"勾选
  // （oauth21 默认不勾，用户自己勾；勾选结果通过 bind-session 的 accountKey 反向同步 posecraft）
  isMobile: 'false',
  qrCodeFirst: 'false',
  site: '01'
};

/** 构建 SSO 登录完整 URL */
export function buildSsoLoginUrl(): string {
  const params = new URLSearchParams({
    ...SSO_LOGIN_PARAMS,
    rnd: Math.random().toString()
  });
  return `${SSO_URL}${SSO_LOGIN_PATH}?${params.toString()}`;
}
