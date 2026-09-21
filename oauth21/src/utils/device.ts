/**
 * 设备形态判定（非响应式）
 *
 * 为什么单独抽成 util 而不是只放在 composable 里：
 * - 路由守卫（router/guard.ts）等非组件上下文无法用 composable，但需要同样的判定
 * - composable（useDeviceDetect）只负责把判定结果做成响应式
 *
 * 判定口径（三级，UA 降为中间兜底，两侧都由宽度说话）：
 *   1. 视口 ≥ 1024px（DESKTOP_MIN_WIDTH）→ 电脑版
 *   2. 视口 < 768px（MOBILE_BREAKPOINT）或 UA 命中真机 → 移动端
 *
 * 为什么把"宽视口"提到 UA 之前（2026-09-21 线上问题）：
 *   UA 判定曾是最高优先级且"命中即恒定"，于是 iPad / 折叠屏展开 / 手机开
 *   "桌面版网站"这些"UA 说自己是手机、屏幕却有 1024px+ 宽"的场景会永远停在
 *   移动端版式，而移动端页面当时没有宽度上限 → 输入框和按钮被拉满整屏，
 *   用户侧看到的就是"手机端页面宽度过宽"。
 *   宽度比 UA 更贴近"这块屏幕放不放得下桌面布局"这个真问题，所以宽度优先。
 *
 * @author yijiu2025
 * @since 2026-09-20
 * @revised 2026-09-21 宽视口优先于 UA，并新增 DESKTOP_MIN_WIDTH / isDesktopViewport
 */

/** 移动端判定阈值（px）：窄于它说明视口放不下桌面双栏布局 */
export const MOBILE_BREAKPOINT = 768;

/**
 * 桌面端判定阈值（px）：宽于等于它说明屏幕放得下完整桌面布局，
 * 即使 UA 报的是手机/平板也走电脑版。
 * 取值对齐 Tailwind 的 lg 断点（与桌面版 AuthContainer 的设计断点同源）。
 */
export const DESKTOP_MIN_WIDTH = 1024;

/**
 * UA 兜底检测：
 * 视口宽度会被桌面浏览器窗口缩放、分屏、DevTools 模拟影响；
 * UA 能识别"真手机/平板"（新版 iPad UA 已不含 iPad，走 MaxTouchPoints 兜底）。
 *
 * 注意：UA 命中**不再等于**"恒定移动端" —— 只有当视口窄于 DESKTOP_MIN_WIDTH
 * 时才会被采纳（见 isMobileViewport 的判定顺序）。
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

/** 视口是否已宽到该用电脑版（只看宽度，不看 UA） */
export function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

/**
 * 当前是否应按移动端处理（非响应式，一次性判定）
 * SSR / 无 window 环境返回 false（走桌面默认）
 */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDesktopViewport()) return false;
  if (detectMobileUA()) return true;
  return window.innerWidth < MOBILE_BREAKPOINT;
}
