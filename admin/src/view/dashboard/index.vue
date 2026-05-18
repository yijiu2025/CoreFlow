<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
</script>

<template>
  <div class="p-8">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold tracking-tight">IAM 权限大盘</h1>
      <button 
        @click="themeStore.toggleTheme()"
        class="px-4 py-2 bg-primary text-primary-foreground rounded-md shadow hover:opacity-90 transition-opacity"
      >
        切换主题 (当前: {{ themeStore.isDark ? 'Dark' : 'Light' }})
      </button>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="p-6 rounded-xl border bg-white dark:bg-slate-900 shadow-sm">
        <h3 class="text-lg font-medium text-slate-500 mb-2">活跃用户</h3>
        <p class="text-4xl font-bold">1,204</p>
      </div>
      <div class="p-6 rounded-xl border bg-white dark:bg-slate-900 shadow-sm">
        <h3 class="text-lg font-medium text-slate-500 mb-2">已注册应用</h3>
        <p class="text-4xl font-bold">12</p>
      </div>
      <div class="p-6 rounded-xl border bg-white dark:bg-slate-900 shadow-sm">
        <h3 class="text-lg font-medium text-slate-500 mb-2">在线策略数</h3>
        <p class="text-4xl font-bold">89</p>
      </div>
    </div>
  </div>
</template>
