<script setup lang="ts">
/**
 * 认证容器组件（登录/注册/找回密码通用）
 *
 * 单一自适应布局，取消 styleType 枚举（horizontal/vertical/split 死代码已删）：
 * - 宽屏（lg+，≥1024px）：左品牌栏 + 右表单栏，卡片 max-w-854px 居中
 * - 窄屏（<lg）：只显示表单栏，卡片 100% 宽，左栏自动隐藏（Tailwind hidden lg:flex）
 * - isMobile prop 保留（mobile 路由强制全屏无卡片），但响应式主要靠 CSS 不靠 prop
 *
 * 插槽：#branding（左栏品牌）/ #header（右栏标题）/ 默认（表单）/ #qr（扫码）/ #footer（底栏）
 *
 * @author yijiu2025
 * @since 2026-08-30 重构：删 styleType，改 Tailwind 响应式
 */
import { useThemeStore } from '@/stores/theme';
import { computed } from 'vue';

interface Props {
  /** 应用名（左栏品牌 + 默认 header 显示） */
  appName?: string;
  /** 强制移动端模式（mobile 路由用，全屏无卡片；不传则靠 CSS 响应式） */
  isMobile?: boolean;
  /** 显示扫码/表单切换按钮 */
  showQrSwitcher?: boolean;
  /** 当前是否扫码模式（v-model） */
  showQR?: boolean;
  /** 显示主题切换浮按钮（iframe 嵌入时自动隐藏） */
  showThemeToggle?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  appName: 'Enterprise SSO',
  isMobile: false,
  showQrSwitcher: true,
  showQR: false,
  showThemeToggle: true
});

const emit = defineEmits<{
  'update:showQR': [value: boolean];
  'qr-click': [];
}>();

const themeStore = useThemeStore();

// 切换扫码模式
const toggleQR = () => {
  emit('update:showQR', !props.showQR);
  emit('qr-click');
};

// 容器类名（响应式由 Tailwind 类驱动，这里只挂 is-mobile/dark 状态）
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
</script>

<template>
  <div class="auth-viewport" :class="containerClasses">
    <!-- 自适应卡片：宽屏 max-w-854 居中，窄屏/isMobile 全屏 -->
    <div
      class="auth-card bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-[10px] shadow-2xl overflow-hidden flex w-full"
      :class="{ 'has-qr-switcher': showQrSwitcher }"
    >
      <!-- 左栏：品牌（宽屏 lg+ 显示，窄屏隐藏；isMobile 强制隐藏） -->
      <aside
        v-if="!isMobile"
        class="auth-brand hidden lg:flex flex-col justify-center p-12 relative overflow-hidden bg-slate-50 dark:bg-slate-800/40 border-r border-slate-100 dark:border-slate-800/60"
      >
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
              安全、快速、统一的身份认证中心。 为您的企业应用提供坚实的防护屏障。
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
      </aside>

      <!-- 右栏：表单内容 -->
      <div class="flex-1 flex flex-col p-6 md:p-10 md:pr-14 relative justify-between min-w-0">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <div class="min-w-0">
            <slot name="header">
              <h2 class="text-xl font-bold dark:text-white">
                {{ showQR ? '扫码登录' : '欢迎回来' }}
              </h2>
              <p class="text-xs text-slate-400 mt-1">
                {{ showQR ? '使用移动端 App 扫码登录' : '请填写您的安全认证凭据' }}
              </p>
            </slot>
          </div>

          <!-- 扫码/表单切换按钮 -->
          <button
            v-if="showQrSwitcher"
            @click="toggleQR"
            class="qr-switcher-btn w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/80 text-slate-400 hover:text-primary transition-all border border-slate-100 dark:border-slate-800 flex-shrink-0"
            title="切换扫码/表单模式"
          >
            <svg
              v-if="!showQR"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>
        </div>

        <!-- 内容主体（表单 / 扫码，fade-slide 切换） -->
        <div class="flex-1 flex flex-col justify-center min-h-0">
          <transition name="fade-slide" mode="out-in">
            <div v-if="showQR" key="qr" class="qr-container-slot">
              <slot name="qr">
                <!-- 默认扫码占位（调用方 #qr 覆盖） -->
                <div class="flex flex-col items-center justify-center py-4">
                  <div class="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 relative group overflow-hidden">
                    <div class="absolute top-0 left-0 w-full h-[2px] bg-primary/60 blur-[2px] animate-scan z-10"></div>
                    <img
                      src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=sso-login"
                      class="w-40 h-40 opacity-90 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                  <p class="mt-6 text-xs text-slate-500 text-center">
                    打开 <span class="font-medium text-slate-700 dark:text-slate-300">{{ appName }}</span> 扫一扫
                  </p>
                </div>
              </slot>
            </div>

            <div v-else key="form" class="form-container-slot">
              <slot></slot>
            </div>
          </transition>
        </div>

        <!-- Footer -->
        <div class="mt-6">
          <slot name="footer"></slot>
        </div>
      </div>
    </div>

    <!-- 主题切换浮按钮（iframe 嵌入时隐藏） -->
    <button
      v-if="showThemeToggle && !isEmbedded"
      @click="themeStore.toggleTheme"
      class="theme-toggle-floating flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:scale-105 transition-all active:scale-95 z-50"
    >
      <Icons v-if="themeStore.isDark" name="moon" :size="16" />
      <Icons v-else name="sun" :size="16" />
      <span v-if="themeStore.isDark"> Dark Mode</span>
      <span v-else> Light Mode</span>
    </button>
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
  padding: 16px;
}

/* 卡片：宽屏限宽居中，窄屏占满 */
.auth-card {
  max-width: 854px;
  max-height: 100vh;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

/* 宽屏（lg+）：固定高度，左栏定宽 */
@media (min-width: 1024px) {
  .auth-card {
    height: 484px;
  }
  .auth-brand {
    width: 400px;
    flex-shrink: 0;
  }
}

/* Mobile 强制全屏无卡片 */
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

/* 主题切换浮按钮定位 */
.theme-toggle-floating {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
}

/* 扫码动画 */
@keyframes scan {
  0% { top: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}
.animate-scan {
  animation: scan 2.5s linear infinite;
}

/* fade-slide 过渡（表单/扫码切换） */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
</style>
