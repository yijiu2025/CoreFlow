import { onMounted, onUnmounted, readonly, ref, type Ref } from 'vue';
import { DESKTOP_MIN_WIDTH, MOBILE_BREAKPOINT, detectMobileUA } from '@/utils/device';

/**
 * 响应式设备形态识别（视口宽度为主，UA 兜底）
 *
 * 用途：登录/注册分发器在 URL 未显式携带 isMobile 参数时，
 * 根据屏幕宽度自动切换到手机端页面（窄窗口 / 真机直接打开 /register 不再难看）。
 *
 * 优先级约定（与分发器一致）：
 *   显式 query.isMobile === 'true'  >  本 composable 自动识别  >  桌面默认
 *
 * 判定顺序（与 @/utils/device 的 isMobileViewport 保持同一套口径）：
 *   宽视口(≥DESKTOP_MIN_WIDTH) → 电脑版 ＞ 窄视口(<MOBILE_BREAKPOINT) ＞ UA 命中
 *
 * 实现：
 * - 判定口径统一在 `@/utils/device`（守卫等非组件上下文共用同一套规则，避免两套标准）
 * - 两个阈值各挂一个 matchMedia，浏览器跨阈值时自动回调，无需 scroll/resize 节流
 * - 不支持 matchMedia 的环境（极老 WebView / SSR）降级 resize 监听
 *
 * 为什么不再"UA 命中即恒定移动端"（2026-09-21 线上问题）：
 *   平板横屏 / 折叠屏展开 / 手机开"桌面版网站"时，UA 仍是手机而视口已有 1024px+，
 *   恒定判定会把移动端版式铺满整屏（页面过宽）。现在宽视口优先，
 *   UA 只在 768–1023px 这一段用于兜底（该区间可能是视口被缩放的桌面浏览器）。
 *
 * 注意：请在组件 setup 中调用（内部注册 onMounted/onUnmounted）。
 */
export function useDeviceDetect(): { isMobileDevice: Readonly<Ref<boolean>> } {
  const isMobileDevice = ref(false);

  if (typeof window !== 'undefined') {
    const supportsMq = typeof window.matchMedia === 'function';
    const desktopMq = supportsMq ? window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`) : null;
    const mobileMq = supportsMq ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`) : null;

    const sync = () => {
      // 1. 宽视口优先：屏幕放得下桌面布局就一律走电脑版，UA 说什么都不例外
      const wide = desktopMq ? desktopMq.matches : window.innerWidth >= DESKTOP_MIN_WIDTH;
      if (wide) {
        isMobileDevice.value = false;
        return;
      }
      // 2. 窄视口直接判移动端；3. 中间段（768–1023）交给 UA 兜底
      const narrow = mobileMq ? mobileMq.matches : window.innerWidth < MOBILE_BREAKPOINT;
      isMobileDevice.value = narrow ? true : detectMobileUA();
    };

    // setup 期先算一次：否则真机首帧会先按桌面渲染再切换，出现一次闪屏
    sync();

    const mqs = [desktopMq, mobileMq].filter((mq): mq is MediaQueryList => mq !== null);

    onMounted(() => {
      for (const mq of mqs) {
        if (typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', sync);
        } else {
          // Safari < 14 旧 API 兜底
          (mq as unknown as { addListener: (cb: () => void) => void }).addListener(sync);
        }
      }
      if (mqs.length === 0) window.addEventListener('resize', sync);
      sync();
    });

    onUnmounted(() => {
      for (const mq of mqs) {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', sync);
        } else {
          (mq as unknown as { removeListener: (cb: () => void) => void }).removeListener(sync);
        }
      }
      if (mqs.length === 0) window.removeEventListener('resize', sync);
    });
  }

  return { isMobileDevice: readonly(isMobileDevice) };
}
