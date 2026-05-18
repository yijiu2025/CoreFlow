<script setup lang="ts">
// 引入主题商店
import { useThemeStore } from '@/stores/theme'
const themeStore = useThemeStore()
</script>

<template>
  <!-- 外层控制 dark class 注入 -->
  <div :class="{ 'dark': themeStore.isDark }">
    <!-- 全局背景与文字颜色 -->
    <div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-300 flex flex-col">
      
      <!-- 顶部导航栏 -->
      <header class="border-b bg-white dark:bg-slate-900 shadow-sm px-8 py-4 flex items-center justify-between">
        <div class="flex items-center space-x-8">
          <div class="font-bold text-xl tracking-tight text-primary">IAM 控制台</div>
          <nav class="space-x-6 text-sm font-medium">
            <router-link to="/" class="text-slate-500 hover:text-primary transition-colors" active-class="text-primary">数据大盘</router-link>
            <router-link to="/users" class="text-slate-500 hover:text-primary transition-colors" active-class="text-primary">用户管理</router-link>
          </nav>
        </div>
        <button @click="themeStore.toggleTheme()" class="text-slate-500 hover:text-primary text-sm font-medium">
          {{ themeStore.isDark ? '切换浅色' : '切换深色' }}
        </button>
      </header>

      <!-- 页面内容 -->
      <main class="flex-1">
        <router-view />
      </main>

    </div>
  </div>
</template>

<style>
/* 避免 body 默认背景覆盖 */
body {
  margin: 0;
  padding: 0;
}
</style>
