<script setup lang="ts">
/**
 * 日志视图
 * 完整日志表格展示
 */
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useDashboardStore } from '@/stores/dashboard'
import LogTable from '@/components/LogTable.vue'
import { Activity } from 'lucide-vue-next'

const uiStore = useUiStore()
const dashboardStore = useDashboardStore()

const { isDarkMode } = storeToRefs(uiStore)
const { logs } = storeToRefs(dashboardStore)
</script>

<template>
  <div class="absolute inset-0 z-10 pointer-events-none p-4 pt-20">
    <div class="max-w-7xl mx-auto pointer-events-auto">
      <div class="glass rounded-3xl overflow-hidden shadow-2xl h-[calc(100vh-120px)] flex flex-col"
        :class="isDarkMode ? 'bg-slate-950/80 border-white/5' : 'bg-white/90 border-slate-200'">
        <div class="p-4 border-b flex items-center gap-3"
          :class="isDarkMode ? 'border-white/5' : 'border-slate-100'">
          <Activity class="w-5 h-5" :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'" />
          <h2 class="text-lg font-bold" :class="isDarkMode ? 'text-slate-200' : 'text-slate-800'">
            {{ $t('stats.traffic_stream') }}
          </h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
            {{ logs.length }}
          </span>
        </div>
        <LogTable :logs="logs" :is-dark="isDarkMode" class="flex-1 !bg-transparent" />
      </div>
    </div>
  </div>
</template>
