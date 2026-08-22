<template>
  <Transition name="doc-fade">
    <div v-if="isOpen" class="fixed inset-0 z-[200] flex items-center justify-center p-4" @click="close">
      <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"></div>
      <div
        class="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        @click.stop
      >
        <!-- Header（紧凑） -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 class="text-base font-bold text-slate-900 dark:text-white">{{ title }}</h2>
          <button @click="close" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <!-- Content（紧凑：小字号 + 紧行高 + 小间距） -->
        <div class="flex-1 overflow-y-auto px-5 py-4 text-[12px] text-slate-600 dark:text-slate-300 leading-snug space-y-2 doc-content">
          <slot></slot>
        </div>
        <!-- Footer（紧凑） -->
        <div class="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            @click="close"
            class="px-5 h-9 rounded-lg bg-primary text-white font-bold text-xs hover:opacity-90 transition-opacity"
          >
            我已阅读
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ isOpen: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const close = () => emit('close');
</script>

<style scoped>
.doc-fade-enter-active,
.doc-fade-leave-active {
  transition: opacity 0.25s ease;
}
.doc-fade-enter-from,
.doc-fade-leave-to {
  opacity: 0;
}

/* slot 内容紧凑化（h3/p 间距压缩） */
.doc-content :deep(h3) {
  font-size: 13px;
  font-weight: 700;
  margin-top: 10px;
  margin-bottom: 4px;
  color: #1e293b;
}
.dark .doc-content :deep(h3) {
  color: #e2e8f0;
}
.doc-content :deep(p) {
  margin: 4px 0;
}
.doc-content :deep(p:first-child) {
  margin-top: 0;
}
</style>
