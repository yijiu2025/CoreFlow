<script setup lang="ts">
/**
 * 移动端主题切换按钮（header 右上角，与返回按钮对角）
 *
 * 三态循环：跟随系统 → 浅色 → 深色 → 跟随系统。
 * 旧版本只有深/浅二态，而且手动切过一次就永久脱离系统跟随、无法回退 —— 三态补上了这条路。
 *
 * 嵌入场景默认隐藏：被 iframe / App WebView 嵌入时主题由父应用主导
 * （父应用通过 postMessage 同步，见 useParentThemeSync），
 * 子页面再放一个会和父应用打架的开关没有意义。需要时用 force-show 强制显示。
 *
 * 样式不写在本组件里：统一在 assets/styles/mobile-auth.scss 的 `mauth-theme-btn`，
 * 与其余移动端认证页样式同一处维护（两页共用一份，避免各自漂移）。
 *
 * @author yijiu2025
 */
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { MODE_LABELS } from '@/theme/mode';

const props = withDefaults(defineProps<{ forceShow?: boolean }>(), { forceShow: false });

const themeStore = useThemeStore();

/** 是否被嵌入（iframe / WebView）—— 嵌入时由父应用决定主题 */
const isEmbedded = computed(() => window.parent !== window);

const visible = computed(() => props.forceShow || !isEmbedded.value);

const label = computed(() => MODE_LABELS[themeStore.mode] ?? '');
</script>

<template>
  <button
    v-if="visible"
    type="button"
    class="mauth-theme-btn"
    :aria-label="`主题：${label}，点击切换`"
    :title="`主题：${label}`"
    @click="themeStore.cycleMode()"
  >
    <!-- 跟随系统 -->
    <svg
      v-if="themeStore.mode === 'system'"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
      <line x1="8" y1="21" x2="16" y2="21"></line>
      <line x1="12" y1="17" x2="12" y2="21"></line>
    </svg>
    <!-- 深色 -->
    <svg
      v-else-if="themeStore.mode === 'dark'"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
    <!-- 浅色 -->
    <svg
      v-else
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
    </svg>
  </button>
</template>
