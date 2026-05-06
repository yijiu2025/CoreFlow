<script setup lang="ts">
/**
 * 设置视图
 * 节点设置、安全设置入口
 */
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useDashboardStore } from '@/stores/dashboard'
import { useDefenseStore } from '@/stores/defense'
import { Settings, MapPin, Swords } from 'lucide-vue-next'

const uiStore = useUiStore()
const dashboardStore = useDashboardStore()
const defenseStore = useDefenseStore()

const { isDarkMode } = storeToRefs(uiStore)
const { serverPosition } = storeToRefs(dashboardStore)
</script>

<template>
  <div class="absolute inset-0 z-10 pointer-events-none p-4 pt-20">
    <div class="max-w-4xl mx-auto pointer-events-auto space-y-6">
      <!-- 节点信息 -->
      <div class="glass rounded-3xl p-6 shadow-2xl"
        :class="isDarkMode ? 'bg-slate-950/80 border-white/5' : 'bg-white/90 border-slate-200'">
        <div class="flex items-center gap-3 mb-4">
          <MapPin class="w-5 h-5 text-indigo-400" />
          <h2 class="text-lg font-bold" :class="isDarkMode ? 'text-slate-200' : 'text-slate-800'">
            {{ $t('settings.node.title') }}
          </h2>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div v-for="(val, key) in serverPosition" :key="key" class="flex flex-col">
            <span class="text-[10px] font-bold uppercase tracking-widest mb-1"
              :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">{{ key }}</span>
            <span class="font-mono text-sm" :class="isDarkMode ? 'text-slate-300' : 'text-slate-700'">{{ val }}</span>
          </div>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="grid grid-cols-2 gap-4">
        <button @click="defenseStore.isSettingsModalOpen = true"
          class="glass rounded-3xl p-6 shadow-2xl text-left transition-all hover:scale-[1.02]"
          :class="isDarkMode ? 'bg-slate-950/80 border-white/5 hover:border-cyan-500/30' : 'bg-white/90 border-slate-200 hover:border-indigo-300'">
          <Settings class="w-8 h-8 mb-3" :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'" />
          <h3 class="font-bold" :class="isDarkMode ? 'text-slate-200' : 'text-slate-800'">
            {{ $t('settings.title') }}
          </h3>
          <p class="text-xs mt-1" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
            {{ $t('settings.tabs.panel') }}, {{ $t('settings.tabs.firewall') }}
          </p>
        </button>

        <button @click="defenseStore.isDefenseModalOpen = true"
          class="glass rounded-3xl p-6 shadow-2xl text-left transition-all hover:scale-[1.02]"
          :class="isDarkMode ? 'bg-slate-950/80 border-white/5 hover:border-cyan-500/30' : 'bg-white/90 border-slate-200 hover:border-indigo-300'">
          <Swords class="w-8 h-8 mb-3" :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'" />
          <h3 class="font-bold" :class="isDarkMode ? 'text-slate-200' : 'text-slate-800'">
            {{ $t('settings.defense.title') }}
          </h3>
          <p class="text-xs mt-1" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
            {{ $t('settings.defense.desc_launch') }}
          </p>
        </button>
      </div>
    </div>
  </div>
</template>
