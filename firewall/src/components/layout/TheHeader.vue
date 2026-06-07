<template>
  <header class="flex justify-between items-center p-4 pointer-events-auto transition-all duration-500"
    :class="{ 'opacity-60 hover:opacity-100': !isUiVisible }">
    <!-- Logo + Stats -->
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

    <!-- Right Controls (4 个按钮统一大小) -->
    <transition name="fade-ui">
      <div v-if="isUiVisible" class="flex gap-2 items-center">
        <!-- 语言切换 -->
        <button @click="$emit('toggle-lang')"
          class="glass w-10 h-10 rounded-xl transition-all shadow-lg flex items-center justify-center text-[10px] font-black uppercase"
          :class="isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'">
          {{ locale.toUpperCase() }}
        </button>

        <!-- 主题切换 -->
        <button @click="$emit('toggle-theme')" class="glass w-10 h-10 rounded-xl transition-all shadow-lg flex items-center justify-center"
          :class="isDarkMode ? 'text-amber-400 hover:bg-white/10' : 'text-indigo-600 hover:bg-slate-100'"
          :title="$t('nav.theme')">
          <Sun v-if="isDarkMode" class="w-5 h-5" />
          <Moon v-else class="w-5 h-5" />
        </button>

        <!-- 设置 -->
        <button @click="$emit('open-settings')"
          class="glass w-10 h-10 rounded-xl transition-all shadow-lg flex items-center justify-center group"
          :class="isDarkMode ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-indigo-600'"
          :title="$t('nav.settings')">
          <Settings class="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
        </button>

        <!-- 用户头像 -->
        <slot name="user-avatar" />
      </div>
    </transition>
  </header>
</template>

<script setup lang="ts">
/**
 * 顶部导航栏
 * 职责：Logo、流量统计、语言/主题/设置切换、用户头像插槽
 */
import { ShieldCheck, Settings, Sun, Moon } from 'lucide-vue-next'

defineProps<{
  isDarkMode: boolean
  isUiVisible: boolean
  locale: string
  summary: { totalRequests: number; totalBlocked: number }
}>()

defineEmits(['toggle-lang', 'toggle-theme', 'open-settings'])
</script>
