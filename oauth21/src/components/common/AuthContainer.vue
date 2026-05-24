<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import { ref, computed } from 'vue'

interface Props {
  appName?: string
  styleType?: 'horizontal' | 'vertical' | 'split'
  isMobile?: boolean
  showQrSwitcher?: boolean
  showQR?: boolean
  showThemeToggle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  appName: 'Enterprise SSO',
  styleType: 'horizontal',
  isMobile: false,
  showQrSwitcher: true,
  showQR: false,
  showThemeToggle: true
})

const emit = defineEmits<{
  (e: 'update:showQR', value: boolean): void
  (e: 'qr-click'): void
}>()

const themeStore = useThemeStore()

// 切换扫码模式
const toggleQR = () => {
  emit('update:showQR', !props.showQR)
  emit('qr-click')
}

// 动态样式计算
const containerClasses = computed(() => {
  return {
    'is-mobile': props.isMobile,
    'dark': themeStore.isDark,
    [props.styleType]: true
  }
})

// 检测是否处于 iframe 嵌入环境中
const isEmbedded = computed(() => {
  try {
    return window.self !== window.top
  } catch (e) {
    return true
  }
})
</script>

<template>
  <div class="auth-viewport" :class="containerClasses">
    <!-- Split Layout Backdrops -->
    <div v-if="styleType === 'split' && !isMobile" class="split-backdrop-left bg-gradient-to-tr from-slate-900 via-slate-800 to-indigo-950 text-white">
      <div class="relative z-10 max-w-lg p-16">
        <slot name="branding">
          <!-- Fallback default branding for split/horizontal layouts -->
          <div class="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white mb-8 shadow-xl shadow-primary/20">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 class="text-4xl font-extrabold mb-6 tracking-tight">{{ appName }}</h1>
          <p class="text-slate-300 text-base leading-relaxed">
            安全、快速、统一的身份认证中心。
            为您的企业级应用生态提供最坚固的安全屏障与多维度审计防线。
          </p>
        </slot>
      </div>
      <!-- Premium Design Accents -->
      <div class="absolute -bottom-20 -left-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl"></div>
      <div class="absolute -top-20 -right-20 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
    </div>

    <!-- Main Wrapper Box -->
    <div 
      class="auth-card bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden flex"
      :class="[styleType, { 'has-qr-switcher': showQrSwitcher }]"
    >
      <!-- Left Panel: Branding / Visual (Only for horizontal style) -->
      <div v-if="styleType === 'horizontal' && !isMobile" 
           class="horizontal-left-branding bg-slate-50 dark:bg-slate-800/40 border-r border-slate-100 dark:border-slate-800/60 flex flex-col justify-center p-12 relative overflow-hidden">
        <div class="relative z-10">
          <slot name="branding">
            <div class="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white mb-8 shadow-lg shadow-primary/20">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h1 class="text-3xl font-bold dark:text-white mb-4 tracking-tight">{{ appName }}</h1>
            <p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-[240px]">
              安全、快速、统一的身份认证中心。
              为您的企业应用提供坚实的防护屏障。
            </p>
          </slot>
        </div>
        
        <!-- Decoration -->
        <div class="absolute -bottom-20 -left-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
        <div class="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl"></div>
        
        <div class="absolute bottom-8 left-12 flex gap-4">
          <div class="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
        </div>
      </div>

      <!-- Right Panel / Main Panel: Form Content -->
      <div class="flex-1 flex flex-col p-10 pr-12 md:pr-14 relative justify-between">
        
        <!-- Header Section -->
        <div class="flex items-center justify-between mb-6">
          <div>
            <slot name="header">
              <h2 class="text-xl font-bold dark:text-white">
                {{ showQR ? '扫码登录' : '欢迎回来' }}
              </h2>
              <p class="text-xs text-slate-400 mt-1">
                {{ showQR ? '使用移动端 App 扫码登录' : '请填写您的安全认证凭据' }}
              </p>
            </slot>
          </div>
          
          <!-- QR Toggle Switcher Button -->
          <button 
            v-if="showQrSwitcher" 
            @click="toggleQR" 
            class="qr-switcher-btn w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/80 text-slate-400 hover:text-primary transition-all border border-slate-100 dark:border-slate-800"
            title="切换扫码/表单模式"
          >
            <svg v-if="!showQR" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>
        </div>

        <!-- Dynamic Content Body -->
        <div class="flex-1 flex flex-col justify-center">
          <transition name="fade-slide" mode="out-in">
            <div v-if="showQR" key="qr" class="qr-container-slot">
              <slot name="qr">
                <!-- Fallback default QR rendering -->
                <div class="flex flex-col items-center justify-center py-4">
                  <div class="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 relative group overflow-hidden">
                    <div class="absolute top-0 left-0 w-full h-[2px] bg-primary/60 blur-[2px] animate-scan z-10"></div>
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=sso-login" class="w-40 h-40 opacity-90 group-hover:opacity-100 transition-opacity" />
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

        <!-- Footer Section -->
        <div class="mt-6">
          <slot name="footer"></slot>
        </div>

      </div>
    </div>

    <!-- Theme Toggle Floating Widget -->
    <button 
      v-if="showThemeToggle && !isEmbedded"
      @click="themeStore.toggleTheme"
      class="theme-toggle-floating flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:scale-105 transition-all active:scale-95 z-50"
    >
      <span v-if="themeStore.isDark">🌙 Dark Mode</span>
      <span v-else>☀️ Light Mode</span>
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
}

/* Card sizing configurations */
.auth-card {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

/* Horizontal card size setup */
.auth-card.horizontal {
  width: 854px;
  height: 484px;
}

.horizontal-left-branding {
  width: 400px;
  flex-shrink: 0;
}

/* Vertical card size setup (Compact box) */
.auth-card.vertical {
  width: 400px;
  height: auto;
  min-height: 484px;
}

/* Split layout setup (Fullscreen side-by-side) */
.auth-viewport.split {
  display: flex;
  flex-direction: row;
}

.split-backdrop-left {
  flex: 1.2;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.auth-card.split {
  flex: 1;
  height: 100%;
  border-radius: 0;
  border: none;
  box-shadow: none;
}

/* Mobile responsive override */
.auth-viewport.is-mobile {
  padding: 0;
}

.auth-viewport.is-mobile .auth-card {
  width: 100vw !important;
  height: 100vh !important;
  border-radius: 0 !important;
  border: none !important;
  box-shadow: none !important;
}

.theme-toggle-floating {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
}

.auth-viewport.split .theme-toggle-floating {
  left: 75%;
}

/* Transitions */
.fade-slide-enter-active, .fade-slide-leave-active {
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

@keyframes scan {
  0% { top: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

.animate-scan {
  animation: scan 2.5s linear infinite;
}
</style>
