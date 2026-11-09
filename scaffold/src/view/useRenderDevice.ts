/**
 * 设备判定（宿主职责）
 *
 * skinsuite 只接收设备名、不做判定；判定口径属于宿主：
 *   1. `?device=mobile|std` 显式锁定（便于真机排障与视觉走查）；
 *   2. 否则按视口宽度：<= 820px 视为手机端（与 layout.css 的断点同一阈值）。
 *
 * 返回的是 `ref`，视口变化时自动更新 —— 侧栏抽屉、表格密度都依赖同一个口径。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { useRoute } from 'vue-router';

/** 手机端最大宽度（px），与 layout.css 的 @media 断点保持一致 */
const MOBILE_MAX_WIDTH = 820;

/**
 * 解析 URL 里的设备锁定值
 *
 * @param raw `?device=` 的原始值
 * @returns 命中的设备 id，未命中返回 null
 */
function fromQuery(raw: unknown): string | null {
  if (raw === 'mobile') return 'mobile';
  if (raw === 'std' || raw === 'standard') return 'standard';
  return null;
}

/**
 * 当前渲染设备
 *
 * @returns 设备 id 的响应式引用（'mobile' | 'standard'）
 */
export function useRenderDevice(): Ref<string> {
  const route = useRoute();
  const locked = fromQuery(route.query.device);
  const device = ref<string>(locked ?? (window.innerWidth <= MOBILE_MAX_WIDTH ? 'mobile' : 'standard'));

  /**
   * 视口变化时重算（URL 锁定优先，不受视口影响）
   *
   * @returns 无
   */
  function sync(): void {
    if (locked) {
      device.value = locked;
      return;
    }
    device.value = window.innerWidth <= MOBILE_MAX_WIDTH ? 'mobile' : 'standard';
  }

  onMounted(() => {
    sync();
    window.addEventListener('resize', sync, { passive: true });
  });
  onUnmounted(() => window.removeEventListener('resize', sync));

  return device;
}
