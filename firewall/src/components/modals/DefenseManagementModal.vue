<template>
  <BaseModal :model-value="isOpen" @update:model-value="$emit('close')" :is-dark="isDarkMode"
    transition="slide" backdrop-class="bg-black/30 backdrop-blur-md">

    <template #header>
      <div class="flex items-center gap-3">
        <ShieldCheck class="w-6 h-6 text-cyan-400" />
        <h2 class="text-lg font-bold tracking-tight" :class="isDarkMode ? 'text-white' : 'text-slate-900'">
          {{ $t('settings.defense.overview') }}
        </h2>
        <span
          class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors duration-500"
          :class="isDarkMode ? 'bg-white/5 text-slate-400 border-white/5' : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'">
          ADVANCED
        </span>
      </div>
    </template>

    <template #header-actions>
      <div class="flex items-center gap-2 px-3 py-1 rounded-full border transition-colors duration-500"
        :class="isDarkMode ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-green-50 border-green-100'">
        <StatusPing :color="isDarkMode ? 'cyan' : 'green'" />
        <span class="text-[9px] font-bold uppercase" :class="isDarkMode ? 'text-cyan-400' : 'text-green-600'">{{ $t('settings.defense.status_active') }}</span>
      </div>
    </template>

    <div class="flex-1 flex overflow-hidden h-full">
      <!-- Sidebar: Defense Rules Nav -->
      <div class="w-64 border-r flex flex-col transition-colors shrink-0"
        :class="isDarkMode ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50/50 border-slate-100'">
        <div class="p-6">
          <h2 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 px-2">
            {{ $t('settings.defense.rules_config') }}
          </h2>
          <nav class="space-y-1">
            <NavItem v-for="rule in defenseRules" :key="rule.id"
              :is-active="activeSubTab === rule.id"
              :icon="rule.icon"
              :label="$t(rule.labelKey)"
              :is-dark="isDarkMode"
              variant="cyan"
              @click="activeSubTab = rule.id" />
          </nav>
        </div>

        <div class="mt-auto p-6 border-t border-white/5" :class="isDarkMode ? 'bg-black/20' : 'bg-slate-100/50'">
          <div class="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            <Info class="w-3 h-3" /> {{ $t('settings.defense.mitigation_rate') }}
          </div>
          <p class="text-[10px] text-slate-500 leading-relaxed font-mono font-bold">
            {{ summary.totalRequests > 0 ? ((summary.totalBlocked / summary.totalRequests) * 100).toFixed(1) : '0.0' }}% FILTER EFFICIENCY
          </p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 flex flex-col min-w-0 bg-transparent relative overflow-hidden h-full">
        <!-- Header -->
        <header class="px-10 py-8 border-b transition-colors shrink-0"
          :class="isDarkMode ? 'border-white/5 bg-slate-900/50' : 'border-slate-100 bg-white'">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest"
                :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-500'">
                <span class="px-1.5 py-0.5 rounded border"
                  :class="isDarkMode ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-indigo-50 border-indigo-100'">
                  GLOBAL
                </span>
                <span class="text-slate-300 dark:text-slate-700">/</span>
                <span>{{ activeSubTab }}</span>
              </div>
              <div class="flex items-center gap-3 mb-2">
                <h1 class="text-3xl font-bold tracking-tight" :class="isDarkMode ? 'text-white' : 'text-slate-900'">
                  {{ $t(defenseRules.find(r => r.id === activeSubTab)?.labelKey || '') }}
                </h1>
                <span
                  class="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border"
                  :class="isDarkMode ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-slate-100 text-slate-500 border-slate-200'">
                  {{ activeSubTab.toUpperCase() }}
                </span>
              </div>
              <p class="text-sm max-w-2xl leading-relaxed" :class="isDarkMode ? 'text-slate-400' : 'text-slate-500'">
                {{ $t(`settings.defense.${activeSubTab}_desc`) }}
              </p>
            </div>

            <div class="flex items-center gap-4">
              <div class="flex items-center gap-3 px-4 py-2 rounded-2xl border transition-all"
                :class="isDarkMode ? 'bg-slate-900 border-white/5' : 'bg-slate-50 border-slate-100'">
                <span class="text-xs font-bold"
                  :class="isRuleEnabled(activeSubTab) ? (isDarkMode ? 'text-cyan-400' : 'text-green-600') : 'text-slate-400'">
                  {{ isRuleEnabled(activeSubTab) ? $t('common.sys_running') : $t('common.sys_disabled') }}
                </span>
                <ToggleSwitch :model-value="isRuleEnabled(activeSubTab)"
                  @update:model-value="toggleRuleEnabled(activeSubTab)"
                  :color="isDarkMode ? 'cyan' : 'green'" />
              </div>
            </div>
          </div>
        </header>

        <!-- Content Area -->
        <div class="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
          <section>
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-sm font-bold flex items-center gap-2" :class="isDarkMode ? 'text-slate-300' : 'text-slate-900'">
                <LayoutGrid class="w-4 h-4 text-cyan-400" />
                OPERATIONAL PARAMETERS
              </h3>
              <span class="text-[10px] font-bold text-slate-500">SYSTEM CORE V2.0</span>
            </div>

            <div class="grid grid-cols-1 gap-3">
              <!-- Scanning params -->
              <template v-if="activeSubTab === 'scanning'">
                <SettingRow :is-dark="isDarkMode" :icon="ShieldAlert" :title="$t('settings.defense.trap_trigger')"
                  :description="$t('settings.defense.trap_trigger_desc')"
                  icon-bg="bg-cyan-500/10" icon-color="text-cyan-400">
                  <div class="flex items-center gap-4 px-6 border-l border-white/5">
                    <input v-model.number="securitySettings.defense.maxNotFoundAttempts" type="number"
                      class="w-20 bg-transparent text-right outline-none text-lg font-black tracking-tight"
                      :class="isDarkMode ? 'text-white' : 'text-slate-900'">
                    <span class="text-[9px] font-bold text-slate-500 uppercase">Per Min</span>
                  </div>
                </SettingRow>

                <SettingRow :is-dark="isDarkMode" :icon="Lock" :title="$t('settings.defense.block_time')"
                  :description="$t('settings.defense.block_time_desc')"
                  icon-bg="bg-indigo-500/10" icon-color="text-indigo-400">
                  <div class="flex items-center gap-4 px-6 border-l border-white/5">
                    <input v-model.number="securitySettings.defense.blacklistDuration" type="number"
                      class="w-20 bg-transparent text-right outline-none text-lg font-black tracking-tight"
                      :class="isDarkMode ? 'text-white' : 'text-slate-900'">
                    <span class="text-[9px] font-bold text-slate-500 uppercase">Sec</span>
                  </div>
                </SettingRow>
              </template>

              <!-- Rate limit params -->
              <template v-else-if="activeSubTab === 'rate'">
                <SettingRow :is-dark="isDarkMode" :icon="Activity" :title="$t('settings.defense.rate_reqs')"
                  :description="$t('settings.defense.rate_reqs_desc')"
                  icon-bg="bg-cyan-500/10" icon-color="text-cyan-400">
                  <div class="flex items-center gap-4 px-6 border-l border-white/5">
                    <input v-model.number="securitySettings.defense.rateLimitRequests" type="number"
                      class="w-20 bg-transparent text-right outline-none text-lg font-black tracking-tight"
                      :class="isDarkMode ? 'text-white' : 'text-slate-900'">
                  </div>
                </SettingRow>
              </template>
            </div>
          </section>

          <!-- Deploy Section -->
          <div class="flex items-center justify-between p-8 rounded-2xl transition-colors"
            :class="isDarkMode ? 'bg-cyan-500/5 border border-cyan-500/10 shadow-lg shadow-cyan-500/5' : 'bg-slate-50 border border-slate-100'">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-500">
                <Zap class="w-5 h-5 fill-cyan-500/20" />
              </div>
              <div>
                <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Core Sync Engine</p>
                <p class="text-xs text-slate-400 mt-1">Changes are propagated globally across all edge clusters.</p>
              </div>
            </div>
            <PrimaryButton @click="handleSaveSecurity()" variant="cyan" size="lg">
              {{ $t('settings.defense.deploy') }}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  ShieldCheck, ShieldAlert, Zap, Activity, Lock, Monitor, Target, Info, LayoutGrid
} from 'lucide-vue-next'
import BaseModal from '../ui/BaseModal.vue'
import StatusPing from '../ui/StatusPing.vue'
import NavItem from '../ui/NavItem.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import SettingRow from '../ui/SettingRow.vue'
import PrimaryButton from '../ui/PrimaryButton.vue'
import { useUiStore } from '@/stores/ui'
import { useDashboardStore } from '@/stores/dashboard'
import { useSettingsStore } from '@/stores/settings'
import { storeToRefs } from 'pinia'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits(['close'])

const uiStore = useUiStore()
const dashboardStore = useDashboardStore()
const settingsStore = useSettingsStore()

const { isDarkMode, loading } = storeToRefs(uiStore)
const { summary } = storeToRefs(dashboardStore)
const { securitySettings } = storeToRefs(settingsStore)

const activeSubTab = ref('scanning')

const defenseRules = [
  { id: 'scanning', labelKey: 'settings.defense.trap_404', icon: ShieldAlert },
  { id: 'rate', labelKey: 'settings.defense.rate_limit', icon: Activity },
  { id: 'brute', labelKey: 'settings.defense.brute_force', icon: Lock },
  { id: 'conn', labelKey: 'settings.defense.conn_control', icon: Monitor },
  { id: 'geo', labelKey: 'settings.defense.geo_filter', icon: Target }
]

const isRuleEnabled = (id: string) => {
  const defense = securitySettings.value.defense
  const map: Record<string, boolean> = {
    scanning: defense.enableAutoBlacklist,
    rate: defense.enableRateLimit,
    brute: defense.enableBruteForce,
    conn: defense.enableConnLimit,
    geo: defense.enableGeoFilter
  }
  return map[id] || false
}

const toggleRuleEnabled = (id: string) => {
  const defense = securitySettings.value.defense
  const keyMap: Record<string, string> = {
    scanning: 'enableAutoBlacklist',
    rate: 'enableRateLimit',
    brute: 'enableBruteForce',
    conn: 'enableConnLimit',
    geo: 'enableGeoFilter'
  }
  const key = keyMap[id]
  if (key) defense[key] = !defense[key]
}

async function handleSaveSecurity() {
  await settingsStore.saveSecuritySettings()
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(156, 163, 175, 0.2);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(156, 163, 175, 0.4);
}
</style>
