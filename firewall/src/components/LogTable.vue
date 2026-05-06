<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <!-- Stream Header -->
    <div
      class="flex items-center px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest transition-colors duration-500"
      :class="isDark ? 'bg-white/5 border-white/5 text-slate-500' : 'bg-slate-50 border-slate-100 text-slate-400'">
      <div class="w-16">{{ $t('table.method') }}</div>
      <div class="flex-1">{{ $t('table.endpoint') }}</div>
      <div class="w-24 text-right">{{ $t('table.region') }}</div>
      <div class="w-16 text-right">{{ $t('table.status') }}</div>
    </div>

    <!-- Scrollable Body -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
      <div v-for="log in logs" :key="log.id || log.timestamp"
        class="group flex items-center px-3 py-2 rounded-lg transition-all animate-slide-in text-[12px] font-mono border"
        :class="[
          log.blocked
            ? (isDark ? 'bg-red-500/10 text-red-200 border-transparent shadow-[inset_4px_0_0_#ef4444]' : 'bg-red-50 text-red-700 border-red-100 shadow-[inset_4px_0_0_#ef4444]')
            : (isDark ? 'hover:bg-white/5 text-slate-300 border-transparent hover:border-white/10' : 'hover:bg-slate-50 text-slate-700 border-transparent hover:border-slate-200')
        ]">
        <!-- Method Tag -->
        <div class="w-16">
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold" :class="getMethodClass(log.method)">
            {{ log.method }}
          </span>
        </div>

        <!-- URL & Actor -->
        <div class="flex-1 min-w-0 pr-4">
          <div class="flex flex-col">
            <div class="flex items-center gap-2">
              <span class="truncate font-bold tracking-tight" :class="isDark ? 'text-slate-200' : 'text-slate-900'"
                :title="log.url">{{ log.url }}</span>
              <span v-if="log.apiKey"
                class="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-[8px] font-mono text-slate-500 uppercase tracking-tighter">{{
                  log.apiKey }}</span>
            </div>
            <span class="text-[9px] truncate opacity-60" :class="isDark ? 'text-slate-600' : 'text-slate-400'">{{
              log.actorId }}</span>
          </div>
        </div>

        <!-- Region -->
        <div class="w-16 text-right truncate text-[11px]" :class="isDark ? 'text-slate-500' : 'text-slate-500'">
          {{ log.region || $t('common.unknown') }}
        </div>

        <!-- Status -->
        <div class="w-16 text-right font-bold">
          <span v-if="log.blocked" class="text-red-500 flex items-center justify-end gap-1">
            <ShieldAlert class="w-3 h-3" />
            {{ log.statusCode || 403 }}
          </span>
          <span v-else class="text-emerald-500">{{ log.statusCode || 200 }}</span>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!logs.length" class="h-full flex flex-col items-center justify-center opacity-20 py-20">
        <WifiOff class="w-12 h-12 mb-2 text-indigo-400" />
        <p class="text-sm font-medium uppercase tracking-tighter">{{ $t('table.waiting') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ShieldAlert, WifiOff } from 'lucide-vue-next'

defineProps({
  logs: Array,
  isDark: Boolean
})

const getMethodClass = (method) => {
  const map = {
    'GET': 'bg-emerald-500/10 text-emerald-400',
    'POST': 'bg-blue-500/10 text-blue-400',
    'PUT': 'bg-amber-500/10 text-amber-400',
    'DELETE': 'bg-red-500/10 text-red-400',
    'PATCH': 'bg-purple-500/10 text-purple-400'
  }
  return map[method] || 'bg-slate-500/10 text-slate-400'
}
</script>

<style scoped>
.animate-slide-in {
  animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
    filter: blur(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(100, 100, 100, 0.1);
  border-radius: 10px;
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}
</style>
