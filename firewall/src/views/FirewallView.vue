<script setup lang="ts">
/**
 * 防火墙视图
 * 封禁管理、白名单管理
 */
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useDefenseStore } from '@/stores/defense'
import { ShieldBan, ShieldCheck } from 'lucide-vue-next'

const uiStore = useUiStore()
const defenseStore = useDefenseStore()

const { isDarkMode } = storeToRefs(uiStore)
const { activeBlocks, activeWhitelist } = storeToRefs(defenseStore)
</script>

<template>
  <div class="absolute inset-0 z-10 pointer-events-none p-4 pt-20">
    <div class="max-w-6xl mx-auto pointer-events-auto space-y-6">
      <!-- 封禁管理 -->
      <div class="glass rounded-3xl p-6 shadow-2xl"
        :class="isDarkMode ? 'bg-slate-950/80 border-white/5' : 'bg-white/90 border-slate-200'">
        <div class="flex items-center gap-3 mb-4">
          <ShieldBan class="w-5 h-5 text-red-400" />
          <h2 class="text-lg font-bold" :class="isDarkMode ? 'text-slate-200' : 'text-slate-800'">
            {{ $t('settings.others.ban_management') }}
          </h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
            {{ activeBlocks.length }}
          </span>
        </div>
        <div v-if="activeBlocks.length" class="space-y-2">
          <div v-for="block in activeBlocks" :key="block.ip || block.fingerprint"
            class="flex items-center justify-between p-3 rounded-xl"
            :class="isDarkMode ? 'bg-white/5' : 'bg-slate-50'">
            <div class="flex items-center gap-3">
              <span class="font-mono text-sm" :class="isDarkMode ? 'text-slate-300' : 'text-slate-700'">
                {{ block.ip || block.fingerprint }}
              </span>
              <span class="text-xs px-2 py-0.5 rounded-full"
                :class="block.type === 'fingerprint' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'">
                {{ block.type === 'fingerprint' ? 'FP' : 'IP' }}
              </span>
            </div>
            <button @click="defenseStore.handleRemoveBlock({ type: block.type || 'ip', value: block.ip || block.fingerprint })"
              class="text-xs text-red-400 hover:text-red-300 transition-colors">
              {{ $t('common.unban') }}
            </button>
          </div>
        </div>
        <p v-else class="text-sm" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
          {{ $t('settings.others.no_active_bans') }}
        </p>
      </div>

      <!-- 白名单管理 -->
      <div class="glass rounded-3xl p-6 shadow-2xl"
        :class="isDarkMode ? 'bg-slate-950/80 border-white/5' : 'bg-white/90 border-slate-200'">
        <div class="flex items-center gap-3 mb-4">
          <ShieldCheck class="w-5 h-5 text-green-400" />
          <h2 class="text-lg font-bold" :class="isDarkMode ? 'text-slate-200' : 'text-slate-800'">
            {{ $t('settings.others.whitelist_management') }}
          </h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
            {{ activeWhitelist.length }}
          </span>
        </div>
        <div v-if="activeWhitelist.length" class="space-y-2">
          <div v-for="wl in activeWhitelist" :key="wl.ip || wl.fingerprint"
            class="flex items-center justify-between p-3 rounded-xl"
            :class="isDarkMode ? 'bg-white/5' : 'bg-slate-50'">
            <div class="flex items-center gap-3">
              <span class="font-mono text-sm" :class="isDarkMode ? 'text-slate-300' : 'text-slate-700'">
                {{ wl.ip || wl.fingerprint }}
              </span>
              <span class="text-xs px-2 py-0.5 rounded-full"
                :class="wl.type === 'fingerprint' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'">
                {{ wl.type === 'fingerprint' ? 'FP' : 'IP' }}
              </span>
            </div>
            <button @click="defenseStore.handleRemoveWhitelist({ type: wl.type || 'ip', value: wl.ip || wl.fingerprint })"
              class="text-xs text-red-400 hover:text-red-300 transition-colors">
              {{ $t('common.remove') }}
            </button>
          </div>
        </div>
        <p v-else class="text-sm" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
          {{ $t('settings.others.no_active_whitelist') }}
        </p>
      </div>
    </div>
  </div>
</template>
