<!--
  轻提示宿主（全局唯一，挂在 App 根）

  为什么用 `<Teleport to="body">`：提示是"相对视口"的浮层，挂在应用树里会被任何
  `transform` / `filter` / `overflow` 祖先影响（最常见的是版式容器的 `contain`）。
  Teleport 到 body 后定位只受视口约束。

  @author yijiu2025
  @since 2026-11-15
-->
<template>
  <Teleport to="body">
    <TransitionGroup
      tag="div"
      name="toast"
      class="toast-stack"
      role="status"
      aria-live="polite"
      @mouseenter="toast.pause()"
      @mouseleave="toast.resume()"
    >
      <div
        v-for="item in toast.items"
        :key="item.id"
        :class="['toast-item', `toast-item--${item.tone}`]"
        @click="toast.dismiss(item.id)"
      >
        <span class="toast-item__dot" aria-hidden="true"></span>
        <span class="toast-item__text">{{ item.message }}</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { useToastStore } from '@/stores/toast';

const toast = useToastStore();
</script>

<style scoped>
.toast-stack {
  position: fixed;
  z-index: var(--layer-toast, 400);
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.toast-item {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: min(560px, calc(100vw - 40px));
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--mauth-plate-bg, rgba(21, 24, 26, 0.9));
  color: var(--mauth-plate-ink, #f2f5f4);
  font-size: 13px;
  line-height: 1.45;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
  cursor: pointer;
}

.toast-item__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.9;
}

/* 语气只影响圆点：整块变色会在深色底上刺眼，而圆点足够传达语义 */
.toast-item--ok .toast-item__dot {
  background: var(--mauth-success, #58a021);
}

.toast-item--danger .toast-item__dot {
  background: var(--mauth-danger, #e0443b);
}

.toast-item--info .toast-item__dot {
  background: var(--mauth-primary);
}

.toast-item__text {
  min-width: 0;
  word-break: break-word;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

/* 多条同时进出时让位平滑（否则下面的会跳一下） */
.toast-leave-active {
  position: absolute;
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
