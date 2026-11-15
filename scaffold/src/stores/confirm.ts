/**
 * 全局确认框
 *
 * === 为什么不用 `window.confirm` ===
 *   · 它阻塞整个渲染线程（动画、请求回调全停）；
 *   · 样式不可控（深色主题下是白框，与整站割裂）；
 *   · 无法做"危险操作"的语义（红色按钮、二次确认文案）。
 *
 * === 为什么收成全局一份 ===
 * 之前每个业务组件自己画一个确认弹窗（`UserDangerDialog` / `LogPurgeDialog` / 各处
 * `v-if="showConfirm"`），文案结构、按钮顺序、危险色各不相同。收成一处后调用只有一行：
 *
 * ```ts
 * if (!(await confirm({ title: '删除岗位', message: '删除后不可恢复', danger: true }))) return;
 * ```
 *
 * 🔴 同一时刻只允许一个确认框：新的会先把旧的按"取消"结算掉，
 *    否则旧 Promise 永远不 resolve，调用方的 `await` 就悬在那里（内存与逻辑双泄漏）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';

/** 确认框参数 */
export interface ConfirmOptions {
  /** 标题（一句话说清要做什么） */
  title: string;
  /** 正文（后果说明，别只写"确定吗"） */
  message: string;
  /** 确认按钮文案（默认"确定"；危险操作建议写清动作，如"删除"） */
  confirmText?: string;
  /** 是否危险操作（确认按钮变红） */
  danger?: boolean;
}

/** 待结算的确认（带 resolve） */
interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export const useConfirmStore = defineStore('confirm', () => {
  /** 当前待确认的请求（null = 没有） */
  const pending = ref<PendingConfirm | null>(null);

  /**
   * 弹出确认框
   *
   * @param options 参数
   * @returns 用户是否确认
   */
  function ask(options: ConfirmOptions): Promise<boolean> {
    // 上一条还没结算就来了新的：把上一条当"取消"，避免它的 await 永远悬着
    pending.value?.resolve(false);
    return new Promise<boolean>(resolve => {
      pending.value = { ...options, resolve };
    });
  }

  /**
   * 结算（由宿主组件在按钮点击时调用）
   *
   * @param ok 是否确认
   */
  function settle(ok: boolean): void {
    const current = pending.value;
    pending.value = null;
    current?.resolve(ok);
  }

  return { pending, ask, settle };
});
