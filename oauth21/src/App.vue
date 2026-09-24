<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useParentThemeSync } from '@/composables/useParentThemeSync';
import { fetchRemoteThemeConfig } from '@/theme/remote';

const themeStore = useThemeStore();
const route = useRoute();
// iframe 嵌入时监听父应用主题同步（父切主题子跟着切）
useParentThemeSync();

/**
 * 主题 / 版式调试面板（`?debug=theme` 触发，见组件内注释）
 *
 * 用 `defineAsyncComponent` 而不是静态 import：面板是排查工具，绝大多数访问用不到它，
 * 静态引入会把它连同内部的 Tailwind 类一起并进主包（实测构建产物里原本没有独立 chunk）。
 * 改成异步后，加载器只在**首次真正渲染**时执行 —— 不带参数时既不下载也不执行。
 *
 * 下层的 `v-if` 是「要不要加载」，组件内部的 `visible` 是「要不要渲染」：
 * 前者省流量，后者保证组件被别处复用时行为自洽。
 */
const ThemeDebugPanel = defineAsyncComponent(
  () => import('@/components/dev/ThemeDebugPanel.vue')
);

const showDebugPanel = computed(() => {
  const flag = route.query.debug;
  return (typeof flag === 'string' ? flag : '') === 'theme';
});

/**
 * 后端换配色配置
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
    <!--
      与上面的 min-h-screen 容器**平级**：避免被它的布局与层叠上下文影响（面板是 fixed 浮层）。
      放在 App 层而不是某个页面内，是为了任意页面（含电脑版）都能用。
    -->
    <ThemeDebugPanel v-if="showDebugPanel" />
  </div>
</template>

<style>
/* Global resets if needed */
body {
  margin: 0;
  padding: 0;
}
</style>
