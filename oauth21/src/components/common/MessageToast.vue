<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="messages.length" class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <TransitionGroup name="toast-item">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="pointer-events-auto px-4 py-3 rounded-xl shadow-lg backdrop-blur-md text-sm font-medium flex items-center gap-2 min-w-[280px] mauth-toast"
            :class="toastClass(msg.type)"
          >
            <svg
              v-if="msg.type === 'success'"
              class="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg
              v-else-if="msg.type === 'error'"
              class="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <svg
              v-else
              class="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>{{ msg.text }}</span>
          </div>
        </TransitionGroup>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useMessage } from '@/composables/useMessage';
const { messages } = useMessage();

/**
 * 把 useMessage 的 type 映射到 mauth-toast--xxx 主题类（v2.21.0）
 *
 * 之前在模板里硬编码 `bg-emerald-500/90 text-white` 等 Tailwind 颜色，
 *   切到 black 主题后仍是亮绿/亮红——与底色对比突兀。
 * 改用主题 token：success → --mauth-success（与 GraphicCaptcha / Mobile panel-icon-ok 同源），
 *   error → --mauth-danger，info → --mauth-surface-3（中性灰，匹配"提示"语义）。
 *
 * type 不在 {success, error, info} 时退回 info（防御式默认；理论上 useMessage 只发这三种）。
 */
const toastClass = (type: 'success' | 'error' | 'info'): string => {
  if (type === 'success') return 'mauth-toast--success';
  if (type === 'error') return 'mauth-toast--error';
  return 'mauth-toast--info';
};
</script>

<style scoped>
.toast-item-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-item-leave-active {
  transition: all 0.2s ease-in;
}
.toast-item-enter-from {
  opacity: 0;
  transform: translateX(100px);
}
.toast-item-leave-to {
  opacity: 0;
  transform: translateX(100px) scale(0.9);
}

/* ============================================================================
   主题类（v2.21.0）：与 mobile --mauth-* token 同源
   之前用 Tailwind `bg-emerald-500/90 text-white` 等硬编码 —— 切到 black 主题后
   浮层仍亮绿/亮红，与底色对比突兀；现在统一走 token，主题切换自然跟随。

   透明度走 token /90 是为了让浮层在透明叠加时还能透出底色（Teleport 到 body 后
   浮在 body bg 上），不用再用 backdrop-blur-md 二次模糊。
   ============================================================================ */
.mauth-toast--success {
  background: color-mix(in srgb, var(--mauth-success) 90%, transparent);
  color: var(--mauth-success-fg);
}
.mauth-toast--error {
  background: color-mix(in srgb, var(--mauth-danger) 90%, transparent);
  /* 复用 success-fg = #fff，与 success 类同款白字；
     本类也可写一个新的 --mauth-danger-fg 替代，但 success/error 共用同款
     白前景是常见 toast 设计 —— 减少 token 数量 */
  color: var(--mauth-success-fg);
}
.mauth-toast--info {
  /* info 类没有专门 token，复用 --mauth-surface-3（中性灰底）
     + --mauth-text（深色文字）。黑主题下底深字浅，白主题下底浅字深 —— 自然跟随 */
  background: color-mix(in srgb, var(--mauth-surface-3) 90%, transparent);
  color: var(--mauth-text);
}
</style>
