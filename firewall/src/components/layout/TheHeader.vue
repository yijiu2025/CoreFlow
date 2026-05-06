<template>
  <header class="flex justify-between items-center mb-4 pointer-events-auto transition-all duration-500"
    :class="{ 'opacity-60 hover:opacity-100': !isUIVisible }">
    <div class="glass px-6 py-3 rounded-2xl flex items-center gap-6 shadow-xl">
      <div class="flex items-center gap-3">
        <ShieldCheck :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'" class="w-8 h-8" />
        <h1 class="text-xl font-bold tracking-tight uppercase"
          :class="isDarkMode ? 'text-slate-100 glow-text' : 'text-slate-800'">Antigravity Firewall</h1>
      </div>
      
      <div class="h-8 w-px" :class="isDarkMode ? 'bg-white/10' : 'bg-slate-200'"></div>
      
      <div class="flex gap-8">
        <div class="flex flex-col">
          <span class="text-[10px] font-bold uppercase tracking-widest"
            :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">Total Traffic</span>
          <span class="text-xl font-mono font-bold" :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'">
            {{ summary.totalRequests || 0 }}
          </span>
        </div>
        <div class="flex flex-col">
          <span class="text-[10px] font-bold uppercase tracking-widest"
            :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">Blocked</span>
          <span class="text-xl font-mono font-bold text-red-500">{{ summary.totalBlocked || 0 }}</span>
        </div>
      </div>
    </div>

    <transition name="fade-ui">
      <div v-if="isUIVisible" class="flex gap-3">
        <!-- Language Toggle -->
        <button @click="$emit('toggleLang')"
          class="glass px-4 py-3 rounded-2xl transition-all shadow-lg text-[10px] font-black uppercase tracking-tighter"
          :class="isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'">
          {{ locale.toUpperCase() }}
        </button>

        <!-- Theme Toggle -->
        <button @click="$emit('toggleTheme')" class="glass p-3 rounded-2xl transition-all shadow-lg"
          :class="isDarkMode ? 'text-amber-400 hover:bg-white/10' : 'text-indigo-600 hover:bg-slate-100'"
          :title="$t('nav.theme')">
          <Sun v-if="isDarkMode" class="w-6 h-6" />
          <Moon v-else class="w-6 h-6" />
        </button>

        <!-- Settings Toggle -->
        <button @click="$emit('openSettings')"
          class="glass p-3 rounded-2xl transition-all shadow-lg group relative"
          :class="isDarkMode ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-indigo-600'"
          :title="$t('nav.settings')">
          <Settings class="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
        </button>
      </div>
    </transition>
  </header>
</template>

<script setup lang="ts">
import { ShieldCheck, Sun, Moon, Settings } from 'lucide-vue-next'

defineProps({
  isDarkMode: Boolean,
  isUIVisible: Boolean,
  summary: Object,
  locale: String
})

defineEmits(['toggleLang', 'toggleTheme', 'openSettings'])
</script>
