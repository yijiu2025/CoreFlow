/**
 * 倒计时 composable
 *
 * 统一封装"发送验证码后 60s 倒计时禁用按钮"的通用逻辑，
 * 替代散落在登录/注册/找回密码 8 处的 setInterval 重复实现。
 *
 * 特性：
 * - 响应式 remaining（剩余秒数）+ active（是否倒计时中）
 * - start(seconds) 启动倒计时，可重复调用（重置）
 * - 组件卸载自动清理定时器（防泄漏）
 *
 * @author yijiu2025
 * @since 2026-08-26
 */
import { ref, onUnmounted, type Ref } from 'vue';

export interface UseCountdownReturn {
  remaining: Ref<number>;
  active: Ref<boolean>;
  start: (seconds?: number) => void;
  stop: () => void;
}

export function useCountdown(initialSeconds = 60): UseCountdownReturn {
  const remaining = ref(0);
  const active = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  function clear() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(seconds: number = initialSeconds) {
    clear();
    remaining.value = seconds;
    active.value = true;
    timer = setInterval(() => {
      remaining.value--;
      if (remaining.value <= 0) {
        clear();
        active.value = false;
      }
    }, 1000);
  }

  function stop() {
    clear();
    active.value = false;
    remaining.value = 0;
  }

  onUnmounted(stop);

  return { remaining, active, start, stop };
}
