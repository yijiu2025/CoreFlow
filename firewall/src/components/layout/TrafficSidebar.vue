<template>
  <div class="w-[400px] flex flex-col gap-4 pointer-events-auto">
    <div
      class="flex-1 glass rounded-3xl overflow-hidden flex flex-col transition-colors duration-500 shadow-2xl"
      :class="isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-white/80 border-slate-200'">
      <div class="p-4 border-b flex justify-between items-center"
        :class="isDarkMode ? 'border-white/5' : 'border-slate-100 bg-slate-50/50'">
        <h2 class="text-sm font-bold flex items-center gap-2 uppercase tracking-widest"
          :class="isDarkMode ? 'text-slate-400' : 'text-slate-600'">
          <Activity class="w-4 h-4" :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'" />
          {{ $t('stats.traffic_stream') }}
        </h2>
        <div class="flex gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-green-500/50"></span>
        </div>
      </div>
      <LogTable :logs="logs" :is-dark="isDarkMode" class="flex-1 !bg-transparent" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Activity } from 'lucide-vue-next'
import LogTable from '../LogTable.vue'

defineProps({
  isDarkMode: Boolean,
  logs: Array
})
</script>
