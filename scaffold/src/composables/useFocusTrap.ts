/**
 * 浮层焦点管理（焦点陷阱）
 *
 * === 为什么必须有 ===
 * 弹窗打开后，Tab 键仍然会跑到**背后页面**的按钮上 —— 键盘用户会"按着按着就出了弹窗"，
 * 屏幕阅读器也会读到不该读的内容。这是无障碍的硬性要求，不是锦上添花。
 *
 * 做三件事：
 *   1. 打开时把焦点交给浮层内的第一个可聚焦元素（或显式 `autofocus`）；
 *   2. Tab / Shift+Tab 在浮层内循环；
 *   3. 关闭后把焦点还给**触发它的那个元素**（否则焦点掉回 body，用户要重新 Tab 一路找回来）。
 *
 * 🔴 多层浮层（弹窗里再开确认框）用**栈**：只有栈顶那层接管 Tab，关闭时逐层回退。
 *    用单个"当前浮层"变量会让内层关闭后外层失去陷阱。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

/** 可聚焦元素选择器（与浏览器默认 Tab 顺序基本一致） */
const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/** 一层浮层 */
interface TrapScope {
  /** 浮层根元素 */
  container: HTMLElement;
  /** 打开前的焦点元素（关闭后还给它） */
  restoreTo: HTMLElement | null;
}

/** 全局栈（模块级：跨组件共享，一个页面同一时刻只有一条栈） */
const stack: TrapScope[] = [];

/**
 * 取浮层内当前可见的可聚焦元素
 *
 * `offsetParent === null` 能过滤掉 `display:none` 的（包括被 `v-if` 移除的兄弟节点），
 * 但 `position: fixed` 的元素 `offsetParent` 也是 null —— 所以额外用 `getClientRects()` 兜底。
 *
 * @param container 浮层根
 * @returns 可聚焦元素列表
 */
function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    el => el.offsetParent !== null || el.getClientRects().length > 0
  );
}

/**
 * 给一个浮层创建陷阱
 *
 * 返回的对象由调用方在打开 / 关闭时各调一次（`activate` / `deactivate`）。
 *
 * @returns 陷阱句柄
 */
export function createFocusTrap(): {
  activate: (container: HTMLElement | null) => void;
  deactivate: () => void;
  isTop: () => boolean;
} {
  let scope: TrapScope | null = null;

  /** 当前是否栈顶（只有栈顶才处理 Tab） */
  function isTop(): boolean {
    return scope !== null && stack[stack.length - 1] === scope;
  }

  /**
   * Tab 循环
   *
   * @param event 键盘事件
   */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !scope || !isTop()) return;
    const items = focusableIn(scope.container);
    if (items.length === 0) {
      // 浮层里没有任何可聚焦元素：把 Tab 按住，别让它跑出去
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || !scope.container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return {
    isTop,

    /**
     * 激活陷阱
     *
     * @param container 浮层根元素
     */
    activate(container: HTMLElement | null): void {
      if (!container || scope) return;
      scope = { container, restoreTo: document.activeElement as HTMLElement | null };
      stack.push(scope);
      container.setAttribute('aria-modal', 'true');
      document.addEventListener('keydown', onKeydown, true);
      // 优先聚焦显式 autofocus，其次第一个输入框，最后第一个可聚焦元素
      const preferred =
        container.querySelector<HTMLElement>('[autofocus]') ??
        container.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])') ??
        focusableIn(container)[0];
      preferred?.focus({ preventScroll: true });
    },

    /** 关闭陷阱并把焦点还回去 */
    deactivate(): void {
      document.removeEventListener('keydown', onKeydown, true);
      if (!scope) return;
      const wasTop = isTop();
      const { restoreTo, container } = scope;
      const index = stack.indexOf(scope);
      if (index !== -1) stack.splice(index, 1);
      container.removeAttribute('aria-modal');
      scope = null;
      // 只有栈顶关闭时才还原焦点：内层关掉后焦点应该回到外层浮层里，而不是页面底部
      if (wasTop && restoreTo && document.contains(restoreTo)) restoreTo.focus({ preventScroll: true });
    }
  };
}
