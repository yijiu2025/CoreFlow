<template>
  <Transition name="doc-fade">
    <div v-if="isOpen" class="fixed inset-0 z-[200] flex items-center justify-center p-4" @click="close">
      <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"></div>
      <div
        class="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">{{ title }}</h2>
          <button @click="close" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-4">
          <slot></slot>
        </div>
        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            @click="close"
            class="px-6 h-10 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition-opacity"
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
</style>
