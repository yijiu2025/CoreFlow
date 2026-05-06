<template>
  <BaseModal :model-value="isOpen" @update:model-value="$emit('close')" :is-dark="isDarkMode" :z-index="zIndex">
    <template #header>
      <div class="flex items-center gap-3">
        <ShieldCheck class="w-6 h-6 text-cyan-400" />
        <h2 class="text-lg font-bold tracking-tight" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{
          $t('config.title') }}</h2>
        <span
          class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors duration-500"
          :class="isDarkMode ? 'bg-white/5 text-slate-400 border-white/5' : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'">V2.0
          PRO</span>
      </div>
    </template>

    <template #header-actions>
      <div class="flex items-center gap-2 px-3 py-1 rounded-full border transition-colors duration-500"
        :class="isDarkMode ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-green-50 border-green-100'">
        <StatusPing :color="isDarkMode ? 'cyan' : 'green'" />
        <span class="text-[9px] font-bold uppercase" :class="isDarkMode ? 'text-cyan-400' : 'text-green-600'">{{
          $t('common.sync_active') }}</span>
      </div>
    </template>

    <ConfigPanel
      :configs="configs"
      :is-dark="isDarkMode"
      @toggle="(g, a) => $emit('toggle', g, a)"
      @toggleSystem="s => $emit('toggleSystem', s)"
      @edit="(s, g, a) => $emit('edit', s, g, a)"
      @saveNode="d => $emit('saveNode', d)"
      @reset="k => $emit('reset', k)"
      @resetAll="() => $emit('resetAll')"
      class="h-full" />
  </BaseModal>
</template>

<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'
import BaseModal from '../ui/BaseModal.vue'
import StatusPing from '../ui/StatusPing.vue'
import ConfigPanel from '../ConfigPanel.vue'

defineProps({
  isOpen: Boolean,
  isDarkMode: Boolean,
  configs: Object,
  zIndex: { type: String, default: 'z-[3000]' }
})

defineEmits(['close', 'toggle', 'toggleSystem', 'edit', 'saveNode', 'reset', 'resetAll'])
</script>
