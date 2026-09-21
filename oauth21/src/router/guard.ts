import type { Router } from 'vue-router';
import { isAuthenticated } from './auth-checker';
import { sanitizeLocalRedirect } from '@/utils/redirect';
import { isMobileViewport } from '@/utils/device';

/** 桌面端未登录跳转目标 */
const DESKTOP_LOGIN = '/login';
/** 移动端未登录跳转目标（全屏移动端页面，而不是把桌面页塞进手机屏幕） */
const MOBILE_LOGIN = '/m/login';

/**
 * 校验重定向目标，防止开放重定向漏洞
 * 具体规则收敛在 @/utils/redirect（与 OAuth 回跳等场景共用一套白名单）
 */
export function sanitizeRedirect(raw: unknown): string {
  return sanitizeLocalRedirect(raw) || DESKTOP_LOGIN;
}

/** 设置路由守卫 */
export function setupAuthGuard(router: Router): void {
  router.beforeEach(to => {
    // authorize / consent 等页面：已登录才能访问
    if (to.meta.requiresAuth || to.meta.guestOnly === false) {
      const isAuthed = isAuthenticated();

      if (!isAuthed) {
        const sanitizedRedirect = sanitizeRedirect(to.fullPath);
        // 按设备形态选登录页：手机上直接进移动端全屏登录页，
        // 避免"桌面登录页塞进手机屏"再靠 CSS 兜底
        //
        // 同时透传原 query（client_id / redirect_uri / scope / state ...）：
        // 只给 redirect 的话登录页拿不到应用上下文，会显示"应用标识缺失"而无法登录，
        // 授权流在这里就断了。redirect 只负责"登录后回哪去"。
        return {
          path: isMobileViewport() ? MOBILE_LOGIN : DESKTOP_LOGIN,
          query: { ...to.query, redirect: sanitizedRedirect }
        };
      }
    }

    // 放行：不返回（或返回 undefined）
  });
}
