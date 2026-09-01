import type { Router } from 'vue-router';
import { isAuthenticated } from './auth-checker';

const DEFAULT_REDIRECT = '/login';

/** 校验重定向目标，防止开放重定向漏洞 */
export function sanitizeRedirect(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return DEFAULT_REDIRECT;
  // 只允许站内相对路径：必须以 / 开头，且不能以 // 或 /\ 开头（协议相对 URL）
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return DEFAULT_REDIRECT;
  }
  return raw;
}

/** 设置路由守卫 */
export function setupAuthGuard(router: Router): void {
  router.beforeEach((to, _from, next) => {
    // authorize 页面：已登录才能访问
    if (to.meta.requiresAuth || to.meta.guestOnly === false) {
      // 这里预留了未来接入 Pinia auth store 的位置
      // const auth = useAuthStore();
      // const isAuthed = auth.isAuthenticated;

      // 使用认证检查器
      const isAuthed = isAuthenticated();

      if (!isAuthed) {
        const redirect = to.fullPath;
        const sanitizedRedirect = sanitizeRedirect(redirect);
        return next({
          path: DEFAULT_REDIRECT,
          query: { redirect: sanitizedRedirect }
        });
      }
    }

    // 允许导航
    next();
  });
}