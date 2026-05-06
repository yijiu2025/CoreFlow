<script setup lang="ts">
/**
 * 仪表盘视图
 * 显示实时日志、区域排行、路径排行
 */
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useDashboardStore } from '@/stores/dashboard'
import { useSettingsStore } from '@/stores/settings'
import LogTable from '@/components/LogTable.vue'
import RegionList from '@/components/RegionList.vue'
import PathList from '@/components/PathList.vue'
import { Activity, MapPin, Database, Info } from 'lucide-vue-next'

const uiStore = useUiStore()
const dashboardStore = useDashboardStore()
const settingsStore = useSettingsStore()

const { isDarkMode } = storeToRefs(uiStore)
const { logs, summary, wsEvents, serverPosition } = storeToRefs(dashboardStore)
const { securitySettings } = storeToRefs(settingsStore)
</script>

<template>
  <div class="absolute inset-0 z-10 pointer-events-none p-4 flex flex-col">
    <!-- 内容区域 -->
    <div class="flex-1 flex gap-4 min-h-0">
      <!-- 左侧：实时日志流 -->
      <div class="w-[400px] flex flex-col gap-4 pointer-events-auto">
        <div class="flex-1 glass rounded-3xl overflow-hidden flex flex-col transition-colors duration-500 shadow-2xl"
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

      <!-- 中间：留空给地图 -->
      <div class="flex-1"></div>

      <!-- 右侧：分析图表 -->
      <div class="w-[350px] flex flex-col gap-4 pointer-events-auto pb-20">
        <!-- 访问来源统计 -->
        <div class="glass flex flex-col rounded-3xl min-h-[280px] overflow-hidden shadow-2xl transition-colors duration-500"
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
        <div class="glass flex flex-col rounded-3xl min-h-[350px] overflow-hidden shadow-2xl transition-colors duration-500"
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

        <!-- 防御建议 -->
        <div class="glass p-5 rounded-3xl transition-colors duration-500"
          :class="isDarkMode ? 'border-white/5 bg-gradient-to-br from-indigo-500/10 to-transparent' : 'border-slate-200 bg-white/80 shadow-lg'">
          <div class="flex items-center gap-3 mb-2">
            <Info class="w-4 h-4 text-indigo-400" />
            <span class="text-xs font-bold uppercase tracking-wider"
              :class="isDarkMode ? 'text-slate-300' : 'text-slate-700'">{{ $t('stats.monitor_suggestion') }}</span>
          </div>
          <p class="text-[11px] leading-relaxed" :class="isDarkMode ? 'text-slate-500' : 'text-slate-600'">
            {{ summary.totalBlocked > 0
              ? $t('stats.suggestion_blocked', { rate: (summary.totalBlocked / summary.totalRequests * 100).toFixed(1) })
              : $t('stats.suggestion_clean')
            }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
