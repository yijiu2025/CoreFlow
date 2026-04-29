<template>
  <transition enter-active-class="transition duration-300 ease-out" enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100" leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
    <div v-if="isOpen"
      class="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-6 z-[3000]">
      <div
        class="w-full max-w-6xl h-full max-h-[850px] rounded-[32px] shadow-[0_30px_100px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden relative border transition-colors duration-500"
        :class="isDarkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'">

        <!-- Header -->
        <div class="px-8 py-4 border-b flex items-center justify-between transition-colors duration-500"
          :class="isDarkMode ? 'border-white/5 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'">
          <div class="flex items-center gap-4">
            <div class="flex gap-1.5 mr-4">
              <div @click="$emit('close')"
                class="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 cursor-pointer transition-colors"></div>
              <div class="w-3 h-3 rounded-full bg-amber-300"></div>
              <div class="w-3 h-3 rounded-full bg-green-400"></div>
            </div>
            <div class="flex items-center gap-3">
              <ShieldCheck class="w-6 h-6 text-cyan-400" />
              <h2 class="text-lg font-bold tracking-tight" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{
                $t('config.title') }}</h2>
              <span
                class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors duration-500"
                :class="isDarkMode ? 'bg-white/5 text-slate-400 border-white/5' : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'">V2.0
                PRO</span>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2 px-3 py-1 rounded-full border transition-colors duration-500"
              :class="isDarkMode ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-green-50 border-green-100'">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  :class="isDarkMode ? 'bg-cyan-400' : 'bg-green-400'"></span>
                <span class="relative inline-flex rounded-full h-2 w-2"
                  :class="isDarkMode ? 'bg-cyan-500' : 'bg-green-500'"></span>
              </span>
              <span class="text-[9px] font-bold uppercase" :class="isDarkMode ? 'text-cyan-400' : 'text-green-600'">{{
                $t('common.sync_active') }}</span>
            </div>
            <button @click="$emit('close')" class="text-slate-400 hover:text-slate-600 transition-colors">
              <X class="w-6 h-6" />
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-hidden">
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
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ShieldCheck, X } from 'lucide-vue-next'
import ConfigPanel from '../ConfigPanel.vue'

defineProps({
  isOpen: Boolean,
  isDarkMode: Boolean,
  configs: Object
})

defineEmits(['close', 'toggle', 'toggleSystem', 'edit', 'saveNode', 'reset', 'resetAll'])
</script>
