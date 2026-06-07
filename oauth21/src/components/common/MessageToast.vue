<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="messages.length" class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <TransitionGroup name="toast-item">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="pointer-events-auto px-4 py-3 rounded-xl shadow-lg backdrop-blur-md text-sm font-medium flex items-center gap-2 min-w-[280px]"
            :class="{
              'bg-emerald-500/90 text-white': msg.type === 'success',
              'bg-rose-500/90 text-white': msg.type === 'error',
              'bg-slate-800/90 text-white dark:bg-slate-700/90': msg.type === 'info'
            }"
          >
            <svg v-if="msg.type === 'success'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <svg v-else-if="msg.type === 'error'" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <svg v-else class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>{{ msg.text }}</span>
          </div>
        </TransitionGroup>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useMessage } from '@/composables/useMessage'
const { messages } = useMessage()
</script>

<style scoped>
.toast-item-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.toast-item-leave-active { transition: all 0.2s ease-in; }
.toast-item-enter-from { opacity: 0; transform: translateX(100px); }
.toast-item-leave-to { opacity: 0; transform: translateX(100px) scale(0.9); }
</style>
