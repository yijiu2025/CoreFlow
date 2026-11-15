/**
 * 轻提示（toast）
 *
 * === 为什么要有全局的一份 ===
 * 之前每个组件自己写：`const toast = ref('')` + `setTimeout(() => toast.value = '', 2600)`
 * （`PostLadder` / `StepUpField` / 各 dialog 各写一套）。后果是三件事都不一致：
 *   · 位置不同（有的在组件内部流式布局里，会把内容顶下去）；
 *   · 时长不同（2600 / 3000 / 4200 混用）；
 *   · 失败提示文案不同（有的直接吐 err.message，有的吞掉只给兜底）。
 * 收成一处后，`pushToast()` 在哪都能调，样式与节奏自然统一。
 *
 * 🔴 悬停暂停是必须的：一条"操作失败：xxx"如果在鼠标移到上面时消失，用户就没法复制错误信息。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';

/** 语气：成功 / 中性 / 失败 */
export type ToastTone = 'ok' | 'info' | 'danger';

/** 一条提示 */
export interface ToastItem {
  /** 自增 id（`dismiss` 与定时器都靠它定位） */
  id: number;
  /** 文案 */
  message: string;
  /** 语气 */
  tone: ToastTone;
  /** 存活时长（毫秒） */
  duration: number;
}

/** 同屏最多几条（超出时最早的一条先走，避免糊住整块屏幕） */
const MAX_ITEMS = 4;

/** 各语气的默认时长：失败要多留一会儿，用户往往要看清或复制 */
const DURATION: Record<ToastTone, number> = {
  ok: 2600,
  info: 3000,
  danger: 4200
};

export const useToastStore = defineStore('toast', () => {
  /** 当前在屏的提示（顺序 = 出现顺序） */
  const items = ref<ToastItem[]>([]);

  /** 每条提示的定时器：`remaining` 用于悬停暂停后按剩余时间续上 */
  const timers = new Map<number, { handle: ReturnType<typeof setTimeout> | null; endsAt: number; remaining: number }>();

  /** 是否处于悬停暂停 */
  let paused = false;

  let seed = 0;

  /**
   * 撤掉一条
   *
   * @param id 提示 id
   */
  function dismiss(id: number): void {
    const index = items.value.findIndex(item => item.id === id);
    if (index !== -1) items.value.splice(index, 1);
    const timer = timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    timers.delete(id);
  }

  /**
   * 给一条提示装定时器
   *
   * @param id 提示 id
   * @param ms 时长
   */
  function schedule(id: number, ms: number): void {
    timers.set(id, {
      handle: paused ? null : setTimeout(() => dismiss(id), ms),
      endsAt: Date.now() + ms,
      remaining: ms
    });
  }

  /**
   * 弹一条提示
   *
   * @param message 文案（用户可读，不要直接塞 JSON）
   * @param tone 语气
   */
  function push(message: string, tone: ToastTone = 'ok'): void {
    const text = String(message ?? '').trim();
    if (!text) return;
    const id = (seed += 1);
    const duration = DURATION[tone];
    items.value.push({ id, message: text, tone, duration });
    if (items.value.length > MAX_ITEMS) dismiss(items.value[0].id);
    schedule(id, duration);
  }

  /**
   * 失败提示：优先用后端给的可读消息，其次兜底
   *
   * @param error 捕获到的异常
   * @param fallback 兜底文案
   */
  function pushError(error: unknown, fallback: string): void {
    const message = error instanceof Error && error.message ? error.message : fallback;
    push(message, 'danger');
  }

  /** 悬停时暂停全部倒计时 */
  function pause(): void {
    if (paused) return;
    paused = true;
    timers.forEach(timer => {
      if (timer.handle) clearTimeout(timer.handle);
      timer.handle = null;
      timer.remaining = Math.max(0, timer.endsAt - Date.now());
    });
  }

  /** 移开后按剩余时间续上（至少留 600ms，避免"一移开就消失"） */
  function resume(): void {
    if (!paused) return;
    paused = false;
    timers.forEach((timer, id) => {
      if (timer.handle) clearTimeout(timer.handle);
      timer.handle = setTimeout(() => dismiss(id), Math.max(600, timer.remaining));
      timer.endsAt = Date.now() + Math.max(600, timer.remaining);
    });
  }

  return { items, push, pushError, dismiss, pause, resume };
});
