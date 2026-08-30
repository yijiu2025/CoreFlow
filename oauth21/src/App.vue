<script setup lang="ts">
import { useThemeStore } from '@/stores/theme';
import { useParentThemeSync } from '@/composables/useParentThemeSync';

const themeStore = useThemeStore();
// iframe 嵌入时监听父应用主题同步（父切主题子跟着切）
useParentThemeSync();
</script>

<template>
  <div :class="{ dark: themeStore.isDark }">
    <div
      class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-300 font-sans selection:bg-primary/30"
    >
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
