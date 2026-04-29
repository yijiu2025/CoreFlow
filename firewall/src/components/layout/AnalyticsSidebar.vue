<template>
  <div class="w-[350px] flex flex-col gap-4 pointer-events-auto">
    <!-- 访问来源统计 -->
    <div
      class="glass flex flex-col rounded-3xl min-h-[280px] overflow-hidden shadow-2xl transition-colors duration-500"
      :class="isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-white/80 border-slate-200'">
      <div class="px-5 py-3 border-b bg-white/5 flex items-center justify-between"
        :class="isDarkMode ? 'border-white/5' : 'border-slate-100 bg-slate-50/50'">
        <span class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
          :class="isDarkMode ? 'text-slate-400' : 'text-slate-600'">
          <MapPin class="w-3 h-3 text-indigo-400" />
          {{ $t('stats.region_rank') }}
        </span>
      </div>
      <div class="flex-1 p-2 overflow-y-auto custom-scrollbar">
        <RegionList :data="summary.topRegions || []" :is-dark="isDarkMode" />
      </div>
    </div>

    <!-- 高频访问路径 -->
    <div
      class="glass flex flex-col rounded-3xl min-h-[350px] overflow-hidden shadow-2xl transition-colors duration-500"
      :class="isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-white/80 border-slate-200'">
      <div class="px-5 py-3 border-b bg-white/5 flex items-center justify-between"
        :class="isDarkMode ? 'border-white/5' : 'border-slate-100 bg-slate-50/50'">
        <span class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
          :class="isDarkMode ? 'text-slate-400' : 'text-slate-600'">
          <Database class="w-3 h-3 text-cyan-400" />
          {{ $t('stats.path_rank') }}
        </span>
      </div>
      <div class="flex-1 p-2 overflow-y-auto custom-scrollbar">
        <PathList :data="summary.topPaths || []" :is-dark="isDarkMode" />
      </div>
    </div>

    <!-- Suggestion Box -->
    <div class="glass p-5 rounded-3xl transition-colors duration-500"
      :class="isDarkMode ? 'border-white/5 bg-gradient-to-br from-indigo-500/10 to-transparent' : 'border-slate-200 bg-white/80 shadow-lg'">
      <div class="flex items-center gap-3 mb-2">
        <Info class="w-4 h-4 text-indigo-400" />
        <span class="text-xs font-bold uppercase tracking-wider"
          :class="isDarkMode ? 'text-slate-300' : 'text-slate-700'">{{ $t('stats.monitor_suggestion') }}</span>
      </div>
      <p class="text-[11px] leading-relaxed" :class="isDarkMode ? 'text-slate-500' : 'text-slate-600'">
        {{ summary.totalBlocked > 0
          ? $t('stats.suggestion_blocked', {
            rate: (summary.totalBlocked / summary.totalRequests * 100).toFixed(1)
          })
          : $t('stats.suggestion_clean')
        }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { MapPin, Database, Info } from 'lucide-vue-next'
import RegionList from '../RegionList.vue'
import PathList from '../PathList.vue'

defineProps({
  isDarkMode: Boolean,
  summary: Object
})
</script>
