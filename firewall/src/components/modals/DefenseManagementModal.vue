<template>
  <transition 
    enter-active-class="transition duration-500 ease-out" 
    enter-from-class="opacity-0 translate-y-8"
    enter-to-class="opacity-100 translate-y-0" 
    leave-active-class="transition duration-300 ease-in"
    leave-from-class="opacity-100 translate-y-0" 
    leave-to-class="opacity-0 translate-y-8">
    <div v-if="isOpen"
      class="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-6 z-[3000]">
      <div
        class="w-full max-w-6xl h-full max-h-[850px] rounded-[32px] shadow-[0_40px_100px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden relative border transition-colors duration-500"
        :class="isDarkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'">

        <!-- Header (SecurityConsoleModal Style) -->
        <div class="px-8 py-4 border-b flex items-center justify-between transition-colors duration-500"
          :class="isDarkMode ? 'border-white/5 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'">
          <div class="flex items-center gap-4">
            <div class="flex gap-1.5 mr-4">
              <div @click="$emit('close')"
                class="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 cursor-pointer transition-colors shadow-inner"></div>
              <div class="w-3 h-3 rounded-full bg-amber-300 shadow-inner opacity-50"></div>
              <div class="w-3 h-3 rounded-full bg-green-400 shadow-inner opacity-50"></div>
            </div>
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
          </div>

          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2 px-3 py-1 rounded-full border transition-colors duration-500"
              :class="isDarkMode ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-green-50 border-green-100'">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span class="text-[9px] font-bold uppercase" :class="isDarkMode ? 'text-cyan-400' : 'text-green-600'">{{ $t('settings.defense.status_active') }}</span>
            </div>
            <button @click="$emit('close')" class="text-slate-400 hover:text-slate-600 transition-colors">
              <X class="w-6 h-6" />
            </button>
          </div>
        </div>

        <div class="flex-1 flex overflow-hidden">
          <!-- Sidebar: Systems List Style -->
          <div class="w-64 border-r flex flex-col transition-colors"
            :class="isDarkMode ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50/50 border-slate-100'">
            <div class="p-6">
              <h2 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 px-2">
                {{ $t('settings.defense.rules_config') }}
              </h2>

              <nav class="space-y-1">
                <div v-for="rule in defenseRules" :key="rule.id" @click="activeSubTab = rule.id"
                  class="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all group"
                  :class="activeSubTab === rule.id ? 
                    (isDarkMode ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'bg-indigo-600 text-white shadow-sm') : 
                    'text-slate-500 hover:bg-black/5 dark:hover:bg-white/5'">
                  <div class="flex items-center gap-3">
                    <component :is="rule.icon" class="w-4 h-4" />
                    <span class="text-sm font-semibold">{{ $t(rule.labelKey) }}</span>
                  </div>
                  <ChevronRight v-if="activeSubTab === rule.id" class="w-4 h-4 opacity-50" />
                </div>
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

          <!-- Main Content: ConfigPanel Style -->
          <div class="flex-1 flex flex-col min-w-0 bg-transparent relative">
            <!-- Header: System Overview Style -->
            <header class="px-10 py-8 border-b transition-colors"
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
                      {{ $t(defenseRules.find(r => r.id === activeSubTab)?.labelKey) }}
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
                    <button @click="toggleRuleEnabled(activeSubTab)"
                      :class="isRuleEnabled(activeSubTab) ? (isDarkMode ? 'bg-cyan-500' : 'bg-green-500') : 'bg-slate-300 dark:bg-slate-700'"
                      class="w-10 h-5 rounded-full p-0.5 transition-all flex items-center shadow-inner">
                      <div class="w-4 h-4 bg-white rounded-full transition-all transform"
                        :class="isRuleEnabled(activeSubTab) ? 'translate-x-5' : ''"></div>
                    </button>
                  </div>
                </div>
              </div>
            </header>

            <!-- Content Area: Modules/Groups Style -->
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
                  <!-- Parameter Cards Styled as Group Cards -->
                  <template v-if="activeSubTab === 'scanning'">
                    <div class="group border rounded-2xl transition-all overflow-hidden"
                      :class="isDarkMode ? 'border-white/5 bg-slate-950/40 hover:border-cyan-500/30' : 'border-slate-100 bg-white hover:border-indigo-500/30 shadow-sm'">
                      <div class="flex items-center p-5 gap-6">
                        <div class="flex-shrink-0">
                          <div class="w-12 h-12 rounded-2xl flex items-center justify-center bg-cyan-500/10 text-cyan-400">
                             <ShieldAlert class="w-6 h-6" />
                          </div>
                        </div>
                        <div class="flex-1 min-w-0">
                           <div class="flex items-center gap-3 mb-1">
                              <h4 class="text-base font-bold truncate" :class="isDarkMode ? 'text-slate-200' : 'text-slate-900'">{{ $t('settings.defense.trap_404_limit') }}</h4>
                              <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-cyan-500/20 bg-cyan-500/5 text-cyan-400">HITS</span>
                           </div>
                           <p class="text-xs text-slate-500">Maximum allowed 404 errors before automatic blacklisting</p>
                        </div>
                        <div class="flex items-center gap-4 px-6 border-l border-white/5">
                           <input v-model.number="securitySettings.defense.maxNotFoundAttempts" type="number"
                             class="w-20 bg-transparent text-right outline-none text-lg font-black tracking-tight"
                             :class="isDarkMode ? 'text-white' : 'text-slate-900'">
                           <span class="text-[9px] font-bold text-slate-500 uppercase">Per Min</span>
                        </div>
                      </div>
                    </div>

                    <div class="group border rounded-2xl transition-all overflow-hidden"
                      :class="isDarkMode ? 'border-white/5 bg-slate-950/40 hover:border-cyan-500/30' : 'border-slate-100 bg-white hover:border-indigo-500/30 shadow-sm'">
                      <div class="flex items-center p-5 gap-6">
                        <div class="flex-shrink-0">
                          <div class="w-12 h-12 rounded-2xl flex items-center justify-center bg-indigo-500/10 text-indigo-400">
                             <Lock class="w-6 h-6" />
                          </div>
                        </div>
                        <div class="flex-1 min-w-0">
                           <div class="flex items-center gap-3 mb-1">
                              <h4 class="text-base font-bold truncate" :class="isDarkMode ? 'text-slate-200' : 'text-slate-900'">{{ $t('settings.defense.block_duration') }}</h4>
                              <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-indigo-500/20 bg-indigo-500/5 text-indigo-400">TEMP</span>
                           </div>
                           <p class="text-xs text-slate-500">Duration in seconds to maintain temporary blacklist status</p>
                        </div>
                        <div class="flex items-center gap-4 px-6 border-l border-white/5">
                           <input v-model.number="securitySettings.defense.blacklistDuration" type="number"
                             class="w-20 bg-transparent text-right outline-none text-lg font-black tracking-tight"
                             :class="isDarkMode ? 'text-white' : 'text-slate-900'">
                           <span class="text-[9px] font-bold text-slate-500 uppercase">Sec</span>
                        </div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeSubTab === 'rate'">
                    <div class="group border rounded-2xl transition-all overflow-hidden"
                      :class="isDarkMode ? 'border-white/5 bg-slate-950/40 hover:border-cyan-500/30' : 'border-slate-100 bg-white shadow-sm'">
                      <div class="flex items-center p-5 gap-6">
                        <div class="flex-shrink-0">
                          <div class="w-12 h-12 rounded-2xl flex items-center justify-center bg-cyan-500/10 text-cyan-400">
                             <Activity class="w-6 h-6" />
                          </div>
                        </div>
                        <div class="flex-1 min-w-0">
                           <div class="flex items-center gap-3 mb-1">
                              <h4 class="text-base font-bold truncate" :class="isDarkMode ? 'text-slate-200' : 'text-slate-900'">{{ $t('settings.defense.rate_limit_reqs') }}</h4>
                              <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-cyan-500/20 bg-cyan-500/5 text-cyan-400">CAP</span>
                           </div>
                           <p class="text-xs text-slate-500">Maximum requests allowed within the detection window</p>
                        </div>
                        <div class="flex items-center gap-4 px-6 border-l border-white/5">
                           <input v-model.number="securitySettings.defense.rateLimitRequests" type="number"
                             class="w-20 bg-transparent text-right outline-none text-lg font-black tracking-tight"
                             :class="isDarkMode ? 'text-white' : 'text-slate-900'">
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </section>

              <!-- Deploy Section (Custom Matrix Style) -->
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
                 <button @click="$emit('saveSecurity')"
                   class="px-12 py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-[11px] uppercase tracking-widest shadow-xl shadow-cyan-600/20 transition-all active:scale-95">
                   {{ $t('settings.defense.deploy') }}
                 </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue'
import {
  X, ShieldCheck, ShieldAlert, Zap, Activity, Lock, Monitor, Target, Info, ChevronRight, LayoutGrid
} from 'lucide-vue-next'

const props = defineProps({
  isOpen: Boolean,
  isDarkMode: Boolean,
  securitySettings: Object,
  summary: Object,
  loading: Boolean
})

const emit = defineEmits(['close', 'saveSecurity'])

const activeSubTab = ref('scanning')

const defenseRules = [
  { id: 'scanning', labelKey: 'settings.defense.trap_404', icon: ShieldAlert },
  { id: 'rate', labelKey: 'settings.defense.rate_limit', icon: Activity },
  { id: 'brute', labelKey: 'settings.defense.brute_force', icon: Lock },
  { id: 'conn', labelKey: 'settings.defense.conn_control', icon: Monitor },
  { id: 'geo', labelKey: 'settings.defense.geo_filter', icon: Target }
]

const isRuleEnabled = (id) => {
  if (id === 'scanning') return props.securitySettings.defense.enableAutoBlacklist
  if (id === 'rate') return props.securitySettings.defense.enableRateLimit
  if (id === 'brute') return props.securitySettings.defense.enableBruteForce
  if (id === 'conn') return props.securitySettings.defense.enableConnLimit
  if (id === 'geo') return props.securitySettings.defense.enableGeoFilter
  return false
}

const toggleRuleEnabled = (id) => {
  if (id === 'scanning') props.securitySettings.defense.enableAutoBlacklist = !props.securitySettings.defense.enableAutoBlacklist
  if (id === 'rate') props.securitySettings.defense.enableRateLimit = !props.securitySettings.defense.enableRateLimit
  if (id === 'brute') props.securitySettings.defense.enableBruteForce = !props.securitySettings.defense.enableBruteForce
  if (id === 'conn') props.securitySettings.defense.enableConnLimit = !props.securitySettings.defense.enableConnLimit
  if (id === 'geo') props.securitySettings.defense.enableGeoFilter = !props.securitySettings.defense.enableGeoFilter
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
