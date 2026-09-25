<script setup lang="ts">
import { useThemeStore } from '@/stores/theme';

defineProps<{ isOpen: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const close = () => emit('close');

/**
 * v2.21.0 token 化：根挂 .dark（与 StandardLogin/StandardRegister/GraphicCaptcha 一致）。
 * 让 scoped 内的 `.dark .xxx` 选择器命中（黑主题兜底）；颜色走 --mauth-* token。
 */
const themeStore = useThemeStore();
</script>

<template>
  <Transition name="doc-fade">
    <div
      v-if="isOpen"
      class="mauth-doc-modal-root fixed inset-0 z-[200] flex items-center justify-center p-4"
      :class="{ dark: themeStore.activeTone === 'dark' }"
      @click="close"
    >
      <!-- Backdrop：v2.21.0 token 化（之前 bg-slate-950/60 硬编码） -->
      <div class="mauth-doc-modal-backdrop absolute inset-0"></div>
      <div
        class="mauth-doc-modal-card relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        @click.stop
      >
        <!-- Header（紧凑） -->
        <div class="mauth-doc-modal-header flex items-center justify-between px-5 py-3">
          <h2 class="mauth-doc-modal-title text-base font-bold">{{ title }}</h2>
          <button @click="close" class="mauth-doc-modal-close transition-colors">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <!-- Content（紧凑：小字号 + 紧行高 + 小间距） -->
        <div class="mauth-doc-modal-content flex-1 overflow-y-auto px-5 py-4 text-[12px] leading-snug space-y-2">
          <slot></slot>
        </div>
        <!-- Footer（紧凑） -->
        <div class="mauth-doc-modal-footer px-5 py-3 flex justify-end">
          <button @click="close" class="mauth-doc-modal-confirm px-5 h-9 rounded-lg font-bold text-xs transition-opacity">
            我已阅读
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.doc-fade-enter-active,
.doc-fade-leave-active {
  transition: opacity 0.25s ease;
}
.doc-fade-enter-from,
.doc-fade-leave-to {
  opacity: 0;
}

/* ============================================================================
   v2.21.0 token 化：所有色值走 var(--mauth-*)
   之前 `bg-slate-950/60` `bg-white dark:bg-slate-900` `border-slate-*` `text-slate-*`
   `bg-primary text-white` 都是硬编码 —— 切到 black 主题后浮层仍是 slate 浅色，
   与底色对比突兀；现在统一 token，主题切换自然跟随。
   ============================================================================ */

/* Backdrop：浅底用纯色半透，深底用纯黑半透（与 GraphicCaptcha 同款） */
.mauth-doc-modal-backdrop {
  background: color-mix(in srgb, var(--mauth-canvas) 60%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.dark .mauth-doc-modal-backdrop {
  /* 黑主题下 backdrop 用纯黑，避免浅色 backdrop 在纯黑页面突兀 */
  background: color-mix(in srgb, #000000 80%, transparent);
}

/* 卡片：surface 底 + 浅描边 + 文字色 */
.mauth-doc-modal-card {
  background: var(--mauth-surface);
  color: var(--mauth-text);
  border: 1px solid var(--mauth-border);
}

/* Header / Footer 分隔线：浅底上几乎不可见，深底上略明显 */
.mauth-doc-modal-header {
  border-bottom: 1px solid var(--mauth-border);
}
.mauth-doc-modal-footer {
  border-top: 1px solid var(--mauth-border);
}

/* 标题 */
.mauth-doc-modal-title {
  color: var(--mauth-text);
}

/* 关闭按钮：弱色 → hover 主体色 */
.mauth-doc-modal-close {
  background: transparent;
  border: none;
  color: var(--mauth-text-faint);
  cursor: pointer;
}
.mauth-doc-modal-close:hover {
  color: var(--mauth-text);
}

/* 内容区正文色（body text-mid，弱一点利于长文阅读） */
.mauth-doc-modal-content {
  color: var(--mauth-text-body);
}

/* 确认按钮：primary 单色（与 mobile 一致） */
.mauth-doc-modal-confirm {
  background: var(--mauth-primary);
  color: var(--mauth-primary-fg);
  border: none;
  cursor: pointer;
}
.mauth-doc-modal-confirm:hover {
  opacity: 0.9;
}

/* ============================================================================
   Slot 内容（v2.21.0）：用 :deep() 让子组件（agreements/*）的 h3/p 样式继承
   注意：这里 :deep() 用在子元素上是合法用法（让 :deep(h3) 命中 slot 内的 h3），
   与"scoped 内禁止 :deep(.dark)"的禁令不冲突 —— 那个禁令是指 :deep 后跟 .dark 修饰
   父级选择器（会被编译成裸 .dark 全局污染），这里只修饰子元素选择器 h3/p 是安全的。

   颜色全部 token 化；删了原来的 `.dark .doc-content :deep(h3)` 块（黑主题下 h3 颜色
   走 --mauth-text-strong 自动驱动，与根 .dark 类无强绑定）。
   ============================================================================ */
.mauth-doc-modal-content :deep(h3) {
  font-size: 13px;
  font-weight: 700;
  margin-top: 10px;
  margin-bottom: 4px;
  color: var(--mauth-text-strong);
}
.mauth-doc-modal-content :deep(p) {
  margin: 4px 0;
}
.mauth-doc-modal-content :deep(p:first-child) {
  margin-top: 0;
}
</style>