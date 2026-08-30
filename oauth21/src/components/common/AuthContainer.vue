<script setup lang="ts">
/**
 * 认证容器（纯框架，不含扫码业务）
 *
 * 设计：左入口（品牌）+ 右入口（上中下三槽）
 * - 宽屏（lg+）：左栏品牌 + 右栏（header 上 / form 中 / footer 下），卡片 max-854×484
 * - 窄屏（<lg）：左栏隐藏，header（含 logo）上移顶部，footer 留底部，form 占中间
 * - 宽度平滑压缩：max-width:854px + width:100%，到 lg 断点隐藏左栏
 *
 * 框架只提供骨架 + 品牌默认内容（appName）。扫码切换、扫码 UI 等业务内容
 * 由调用方通过 slot 注入（#header-extra 放扫码按钮等），不耦合在本组件。
 *
 * Slot：
 *   #brand-panel     左栏整体外壳（背景+装饰+结构），可完全覆盖默认品牌外壳
 *   #branding        左栏内容（默认 logo + appName + 文案，可覆盖）
 *   #header          右栏顶部（默认 appName 标题 + 欢迎语，可整体覆盖）
 *   #header-app-name 右栏顶部 appName 展示（默认 <h2>{{ appName }}</h2>，可自定义）
 *   #header-extra    右栏顶部右侧附加区（如扫码切换按钮，按需注入）
 *   默认 slot        右栏中部表单内容
 *   #footer          右栏底部（协议/切换链接）
 *
 * @author yijiu2025
 * @since 2026-08-30 重构：纯框架化，删扫码业务，保留 appName + 默认品牌
 */
import { useThemeStore } from '@/stores/theme';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ThemeToggle from './ThemeToggle.vue';

interface Props {
  /** 应用名（左栏品牌 + 默认 header 显示） */
  appName?: string;
  /** 强制移动端模式（mobile 路由用，全屏无卡片；不传则靠 CSS 响应式） */
  isMobile?: boolean;
  /** 显示主题切换浮按钮（iframe 嵌入时自动隐藏） */
  showThemeToggle?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  appName: 'Enterprise SSO',
  isMobile: false,
  showThemeToggle: true
});

const themeStore = useThemeStore();
const { t } = useI18n();

// 容器类名（响应式由 Tailwind 驱动，这里只挂 is-mobile/dark 状态）
const containerClasses = computed(() => ({
  'is-mobile': props.isMobile,
  dark: themeStore.isDark
}));

// iframe 嵌入检测（嵌入时隐藏主题切换浮按钮，避免遮挡父页面）
const isEmbedded = computed(() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
});

/** 响应式：窗口宽度（用于左栏断点判断） */
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200);
function onResize() {
  windowWidth.value = window.innerWidth;
}
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => window.removeEventListener('resize', onResize));

/**
 * 左栏显示条件：非 isMobile AND 视口 >= 600px
 * （isMobile prop 强制隐藏，< 600px 窄屏也强制隐藏——窄屏只显示右栏）
 */
const showBrandPanel = computed(() => !props.isMobile && windowWidth.value >= 600);
</script>

<template>
  <div class="auth-viewport" :class="containerClasses">
    <!-- 自适应卡片：宽屏 max-854 居中，窄屏 100% 宽平滑压缩 -->
    <div
      class="auth-card bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-[10px] shadow-2xl overflow-hidden flex w-full"
    >
      <!-- 左栏：品牌入口
           显示条件：!isMobile AND 视口 >= 600px（窄屏强制单栏）
           默认品牌内容可 #branding 覆盖；整个左栏外壳（背景/装饰/结构）可 #brand-panel 完全覆盖 -->
      <aside
        v-if="showBrandPanel"
        class="auth-brand hidden min-[600px]:flex flex-col justify-center p-12 relative overflow-hidden bg-slate-50 dark:bg-slate-800/40 border-r border-slate-100 dark:border-slate-800/60"
      >
        <slot name="brand-panel">
          <div class="relative z-10">
            <slot name="branding">
              <!-- 默认品牌内容（调用方可 #branding 覆盖） -->
              <div
                class="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white mb-8 shadow-lg shadow-primary/20"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <h1 class="text-3xl font-bold dark:text-white mb-4 tracking-tight">{{ appName }}</h1>
              <p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-[240px]">
                {{ t('login.brand_desc', '安全、快速、统一的身份认证中心。 为您的企业应用提供坚实的防护屏障。') }}
              </p>
            </slot>
          </div>

          <!-- 装饰光斑 -->
          <div class="absolute -bottom-20 -left-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
          <div class="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl"></div>

          <!-- 底部指示点 -->
          <div class="absolute bottom-8 left-12 flex gap-4">
            <div class="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
          </div>
        </slot>
      </aside>

      <!-- 右栏：上中下三槽
           pt-10 始终固定 40px 顶部间距（避免 600/768 断点跳变影响 header 位置），
           左右底部 padding 用响应式（窄屏紧凑 p-4，宽屏宽松 md:p-10） -->
      <div class="flex-1 flex flex-col pt-10 px-4 pb-4 md:p-10 md:pr-14 relative min-w-0">
        <!-- 上：header（appName 展示 + 标题 + 右侧附加区如扫码切换按钮） -->
        <header class="auth-header flex items-center justify-between mb-6">
          <div class="min-w-0">
            <slot name="header">
              <!-- 默认 header：appName 标题 + 欢迎语（可 #header-app-name 覆盖 appName 展示） -->
              <slot name="header-app-name">
                <h2 class="text-xl font-bold dark:text-white">{{ appName }}</h2>
              </slot>
              <p class="text-xs text-slate-400 mt-1">{{ t('login.fill_credentials', '请填写您的登录凭据') }}</p>
            </slot>
          </div>
          <!-- 右侧附加区：调用方按需注入（如扫码切换按钮），无注入则不占位 -->
          <div v-if="$slots['header-extra']" class="flex-shrink-0">
            <slot name="header-extra" />
          </div>
        </header>

        <!-- 中：表单内容 -->
        <main class="flex-1 flex flex-col justify-center min-h-0">
          <slot />
        </main>

        <!-- 下：footer（协议/切换链接，无 slot 则不占位） -->
        <footer v-if="$slots.footer" class="mt-6">
          <slot name="footer" />
        </footer>
      </div>
    </div>

    <!-- 主题切换浮按钮（iframe 嵌入时隐藏） -->
    <ThemeToggle v-if="showThemeToggle && !isEmbedded" />
  </div>
</template>

<style scoped>
.auth-viewport {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: transparent;
  position: relative;
}
/* @media (max-width: 600px) {
  .auth-viewport {
    padding: 8px;
  }
} */

/* 卡片：宽屏限宽居中（max-854），中等屏以下宽度跟随视口压缩（双栏一起压），窄屏单栏 */
.auth-card {
  max-width: 854px;
  max-height: 100vh;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
  width: 100%;
}

/* >= 854px：双栏 + 固定高度 484px + 左栏 400px */
@media (min-width: 854px) {
  .auth-card {
    height: 484px;
  }
  .auth-brand {
    width: 400px;
    flex-shrink: 0;
  }
}

/* 600 ~ 854px：双栏压缩（卡片宽度跟随视口，左栏按比例缩小，仍显示） */
@media (min-width: 600px) and (max-width: 853.98px) {
  .auth-brand {
    /* 左栏按比例缩：视口 - 32px padding = 可用宽，左栏约 47% */
    width: calc((100vw - 32px) * 0.47);
    flex-shrink: 0;
  }
  .auth-card {
    height: auto;
    min-height: 484px;
  }
}

/* < 600px：单栏（左栏隐藏，header 上移，footer 留底，form 占中间） */
@media (max-width: 599.98px) {
  .auth-card {
    height: auto;
    min-height: 100vh;
  }
  /* 窄屏：header 顶部间距由右栏 pt-10 统一控制（40px），不重复加 margin-top */
}

/* Mobile 强制全屏无卡片（prop isMobile=true 触发，覆盖响应式） */
.auth-viewport.is-mobile {
  padding: 0;
}
.auth-viewport.is-mobile .auth-card {
  width: 100vw !important;
  max-width: 100vw !important;
  height: 100vh !important;
  max-height: 100vh !important;
  border-radius: 0 !important;
  border: none !important;
  box-shadow: none !important;
}
</style>
