<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
const themeStore = useThemeStore()
</script>

<template>
  <div :class="{ 'dark': themeStore.isDark }">
    <div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-300 font-sans selection:bg-primary/30">
      <router-view />
    </div>
  </div>
</template>

<style>
/* Global resets if needed */
body {
  margin: 0;
  padding: 0;
}
</style>
