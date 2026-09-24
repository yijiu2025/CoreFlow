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
  biz_params: '',
  notLoadSsoView: 'false',
  // 不传 notKeepLogin：posecraft 不干预 oauth21 登录页的"保持登录"勾选
  // （oauth21 默认不勾，用户自己勾；勾选结果通过 bind-session 的 accountKey 反向同步 posecraft）
  isMobile: 'false',
  qrCodeFirst: 'false',
  site: '01'
};

/**
 * 构建 SSO 登录完整 URL
 * @param theme 主题（'dark'/'light'），由调用方传 themeStore.isDark 转换；
 *              不传则不带 theme 参数，oauth21 用自己的 localStorage/系统偏好兜底
 *
 * === debug 参数透传 ===
 * oauth21 的「主题 / 版式调试面板」由它自己的 `?debug=theme` 触发（见
 * oauth21/src/components/dev/ThemeDebugPanel.vue）。iframe 内的页面拿不到宿主的
 * query，所以宿主必须显式透传 —— 而从宿主 URL 上带参数进来是**唯一**能用到面板的
 * 途径：弹窗里的 iframe 无法手动改地址（src 由本函数生成）。
 *
 * 透传的是宿主页面 URL 上的 `?debug=`（例如在 posecraft 上访问
 * `http://localhost:5176/posecraft/?debug=theme` 再打开登录弹窗），
 * 这样"在真实宿主环境里调主题"这件事才成立。
 *
 * 只白名单转发 `theme`，不是原样透传任意值：
 *   • 避免把宿主的其他 query 顺手漏进 iframe（可能含敏感业务参数）
 *   • 值必须精确等于 'theme'，与 oauth21 侧的判定口径保持一致
 */
export function buildSsoLoginUrl(theme?: 'dark' | 'light'): string {
  const base: Record<string, string> = { ...SSO_LOGIN_PARAMS, rnd: Math.random().toString() };
  if (theme) base.theme = theme;

  // 宿主 URL 上的 ?debug=theme → 透传给 iframe（仅白名单值）
  if (typeof window !== 'undefined') {
    const hostDebug = new URLSearchParams(window.location.search).get('debug');
    if (hostDebug === 'theme') base.debug = 'theme';
  }

  const params = new URLSearchParams(base);
  return `${SSO_URL}${SSO_LOGIN_PATH}?${params.toString()}`;
}
