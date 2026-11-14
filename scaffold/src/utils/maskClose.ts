/**
 * `v-mask-close`：点遮罩关闭弹窗，但**只在「按下」与「松开」都发生在遮罩上**时触发
 *
 * 为什么不用 `@click.self`：
 * `click` 的目标是 mousedown 与 mouseup 的**共同祖先**。在弹窗输入框里按下鼠标、
 * 一路拖到遮罩上松手（很常见的"全选文字"动作），浏览器判定 click 落在遮罩上，
 * `click.self` 成立 → 弹窗被关掉。用户本意只是选中文字，却丢了正在填的表单。
 *
 * 本指令把判据拆成两步：
 * - mousedown 必须发生在遮罩**本身**（不是弹窗内容）才"上膛"；
 * - mouseup 也必须在遮罩本身才真正关闭。
 * 因此"输入框按下 → 遮罩松手"不会上膛，"遮罩按下 → 拖进弹窗松手"也不会触发。
 *
 * 用法（值必须是函数，别写赋值表达式）：
 * ```html
 * <div class="modal-mask" v-mask-close="() => (dialogOpen = false)">
 * ```
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import type { Directive } from 'vue';

interface MaskHandlers {
  /** mousedown 是否落在遮罩本身 */
  armed: boolean;
  onDown: (event: MouseEvent) => void;
  onUp: (event: MouseEvent) => void;
}

/** 每个遮罩元素监听器实例（卸载时按元素取回并移除，避免重复绑定） */
const handlers = new WeakMap<HTMLElement, MaskHandlers>();

const maskClose: Directive<HTMLElement, (() => void) | undefined> = {
  mounted(el, binding) {
    const state: MaskHandlers = {
      armed: false,
      onDown(event) {
        state.armed = event.target === el;
      },
      onUp(event) {
        const shouldClose = state.armed && event.target === el;
        // 每次松开都复位：一次拖选之后不能把"上膛"状态留给下一次点击
        state.armed = false;
        if (shouldClose) binding.value?.();
      }
    };
    handlers.set(el, state);
    el.addEventListener('mousedown', state.onDown);
    el.addEventListener('mouseup', state.onUp);
  },
  unmounted(el) {
    const state = handlers.get(el);
    if (!state) return;
    el.removeEventListener('mousedown', state.onDown);
    el.removeEventListener('mouseup', state.onUp);
    handlers.delete(el);
  }
};

export { maskClose };
