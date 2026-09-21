/**
 * 设备形态判定（非响应式）
 *
 * 为什么单独抽成 util 而不是只放在 composable 里：
 * - 路由守卫（router/guard.ts）等非组件上下文无法用 composable，但需要同样的判定
 * - composable（useDeviceDetect）只负责把判定结果做成响应式
 *
 * 判定口径（与 Tailwind md 断点保持一致，避免两套标准）：
 * - 视口宽度 < 768px → 移动端
 * - 或 UA 命中真机（含 iPad 的 MaxTouchPoints 兜底）→ 移动端
 *
 * @author yijiu2025
 * @since 2026-09-20
 */

/** 移动端判定阈值（px）：窄于它说明视口放不下桌面双栏布局 */
export const MOBILE_BREAKPOINT = 768;

/**
 * UA 兜底检测：
 * 视口宽度会被桌面浏览器窗口缩放、分屏、DevTools 模拟影响；
 * UA 能识别"真手机/平板"（新版 iPad UA 已不含 iPad，走 MaxTouchPoints 兜底）。
 * UA 命中手机时即使视口宽（折叠屏展开、平板横屏）也优先走移动端页面。
 */
export function detectMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const uaMobile = /Android|iPhone|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  const iPadLike =
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
  return uaMobile || iPadLike;
}

/**
 * 当前是否应按移动端处理（非响应式，一次性判定）
 * SSR / 无 window 环境返回 false（走桌面默认）
 */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  if (detectMobileUA()) return true;
  return window.innerWidth < MOBILE_BREAKPOINT;
}
