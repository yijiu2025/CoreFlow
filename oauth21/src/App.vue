<script setup lang="ts">
import { onMounted } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { useParentThemeSync } from '@/composables/useParentThemeSync';
import { fetchRemoteThemeConfig } from '@/theme/remote';

const themeStore = useThemeStore();
// iframe 嵌入时监听父应用主题同步（父切主题子跟着切）
useParentThemeSync();

/**
 * 后端换肤配置
 *
 * 放在 onMounted 里而不是 setup 顶层：主题请求是网络 IO，不能挡住首屏渲染。
 * 未配置 VITE_THEME_ENDPOINT 时 fetchRemoteThemeConfig 直接返回 null、不发请求，
 * 所以这份代码在后端还没提供接口时完全无副作用。
 * 拉不到就用 SCSS 内置配色继续，绝不影响登录。
 */
onMounted(async () => {
  const clientId = new URLSearchParams(window.location.search).get('client_id') || undefined;
  const config = await fetchRemoteThemeConfig(clientId);
  if (config) themeStore.applyThemeConfig(config);
});
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
