<template>
  <div :class="{ 'dark': isDarkMode }">
    <div class="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-300">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * App 根组件
 * 仅负责：主题类名切换 + 路由出口
 * 业务逻辑全部在 layouts/MainLayout.vue
 */
import { storeToRefs } from 'pinia'
import { useUiStore } from './stores/ui'

const { isDarkMode } = storeToRefs(useUiStore())
</script>
