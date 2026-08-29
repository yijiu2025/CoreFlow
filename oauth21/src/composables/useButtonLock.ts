/**
 * 按钮防双击锁
 *
 * 提交类按钮（登录/注册/找回密码/二次验证）在请求未完成时禁用，避免：
 * - 用户 200ms 内连点 5 次导致 5 个请求
 * - 重复提交表单造成后端异常（如二次验证重发导致 captcha 失效）
 *
 * 用法：
 *   const submit = useButtonLock();
 *   <button :disabled="submit.locked.value" @click="onSubmit">提交</button>
 *   async function onSubmit() {
 *     if (submit.locked.value) return;  // 二次保护
 *     submit.lock();                      // 加锁
 *     try { await api(); } finally { submit.unlock(); }
 *   }
 *
 * 最小锁定时间（minDuration）：保证用户视觉上看到禁用态（防接口 < 100ms 响应）
 *
 * @author yijiu2025
 * @since 2026-08-29
 */
import { ref } from 'vue';

export interface ButtonLockOptions {
  /** 最小锁定时间 ms（防接口太快响应看不到禁用态）默认 500 */
  minDuration?: number;
}

export function useButtonLock(options: ButtonLockOptions = {}) {
  const { minDuration = 500 } = options;
  const locked = ref(false);
  let lockedAt = 0;
  let unlockTimer: ReturnType<typeof setTimeout> | null = null;

  /** 加锁（同步，已锁则 no-op） */
  function lock() {
    if (locked.value) return;
    locked.value = true;
    lockedAt = Date.now();
  }

  /**
   * 解锁（请求完成时调）
   * 若早于 minDuration 解锁，延后到 minDuration 再解锁（防快速响应导致连点）
   */
  function unlock() {
    if (unlockTimer) {
      clearTimeout(unlockTimer);
      unlockTimer = null;
    }
    const elapsed = Date.now() - lockedAt;
    if (elapsed < minDuration) {
      unlockTimer = setTimeout(() => {
        locked.value = false;
        lockedAt = 0;
        unlockTimer = null;
      }, minDuration - elapsed);
      return;
    }
    locked.value = false;
    lockedAt = 0;
  }

  return { locked, lock, unlock };
}
