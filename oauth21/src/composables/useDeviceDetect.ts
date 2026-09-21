import { onMounted, onUnmounted, readonly, ref, type Ref } from 'vue';
import { MOBILE_BREAKPOINT, detectMobileUA } from '@/utils/device';

/**
 * 响应式设备形态识别（视口宽度 + UA 兜底）
 *
 * 用途：登录/注册分发器在 URL 未显式携带 isMobile 参数时，
 * 根据屏幕宽度自动切换到手机端页面（窄窗口 / 真机直接打开 /register 不再难看）。
 *
 * 优先级约定（与分发器一致）：
 *   显式 query.isMobile === 'true'  >  本 composable 自动识别  >  桌面默认
 *
 * 实现：
 * - 判定口径统一在 `@/utils/device`（守卫等非组件上下文共用同一套规则，避免两套标准）
 * - 优先用 matchMedia，浏览器跨阈值时自动回调，无需 scroll/resize 节流
 * - 不支持 matchMedia 的环境（极老 WebView / SSR）降级 resize 监听
 * - UA 命中真机时视为恒定移动端（真机转屏不闪切回桌面版）
 *
 * 注意：请在组件 setup 中调用（内部注册 onMounted/onUnmounted）。
 */
export function useDeviceDetect(): { isMobileDevice: Readonly<Ref<boolean>> } {
  const isMobileDevice = ref(false);

  if (typeof window !== 'undefined') {
    if (detectMobileUA()) {
      // 真机 → 恒定移动端，不随窗口变化闪切
      isMobileDevice.value = true;
    } else {
      const mq =
        typeof window.matchMedia === 'function'
          ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
          : null;

      const sync = () => {
        isMobileDevice.value = mq ? mq.matches : window.innerWidth < MOBILE_BREAKPOINT;
      };

      onMounted(() => {
        if (mq) {
          if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', sync);
          } else {
            // Safari < 14 旧 API 兜底
            (mq as unknown as { addListener: (cb: () => void) => void }).addListener(sync);
          }
        } else {
          window.addEventListener('resize', sync);
        }
        sync();
      });

      onUnmounted(() => {
        if (mq) {
          if (typeof mq.removeEventListener === 'function') {
            mq.removeEventListener('change', sync);
          } else {
            (mq as unknown as { removeListener: (cb: () => void) => void }).removeListener(sync);
          }
        } else {
          window.removeEventListener('resize', sync);
        }
      });
    }
  }

  return { isMobileDevice: readonly(isMobileDevice) };
}
