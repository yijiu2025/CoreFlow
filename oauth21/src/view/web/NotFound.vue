<script setup lang="ts">
/**
 * 404 Not Found 页面
 *
 * 居中卡片风格（与 AuthContainer 布局一致），提供"返回登录"和"返回上页"按钮。
 * 主题适配：用 Tailwind dark: 前缀自动切换亮/暗色，不写 scoped CSS。
 */
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AuthContainer from '@/components/common/AuthContainer.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** 尝试提取原始访问的路径（decode 防止双重编码） */
const attemptedPath = decodeURIComponent(route.fullPath);

function goLogin() {
  router.replace({ path: '/mini-login' });
}

function goBack() {
  if (window.history.length > 1) router.back();
  else goLogin();
}
</script>

<template>
  <AuthContainer app-name="Enterprise SSO">
    <template #branding>
      <div class="w-24 h-24 rounded-3xl bg-indigo-500/10 dark:bg-indigo-400/15 flex items-center justify-center mb-6">
        <svg viewBox="0 0 120 120" width="80" height="80" fill="none" stroke="currentColor" stroke-width="2.5" class="text-indigo-500 dark:text-indigo-400">
          <circle cx="60" cy="60" r="48" stroke-dasharray="6 4" />
          <path d="M44 50 L44 70 L76 70" stroke-linecap="round" stroke-linejoin="round" />
          <line x1="44" y1="44" x2="76" y2="76" stroke-linecap="round" />
        </svg>
      </div>
      <h1 class="text-3xl font-bold dark:text-white mb-3 tracking-tight">404</h1>
      <p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-[280px]">
        {{ t('not_found.brand_desc', '您访问的页面不存在或已被移除。') }}
      </p>
    </template>

    <div class="flex flex-col items-center justify-center text-center max-w-[380px] mx-auto">
      <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
        {{ t('not_found.title', '页面未找到') }}
      </h2>
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
        {{ t('not_found.desc', '抱歉，您访问的地址不存在。') }}
      </p>

      <!-- 原始路径 -->
      <div
        class="inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 mb-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono text-xs"
        :title="attemptedPath"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="flex-shrink-0">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span class="overflow-hidden text-ellipsis whitespace-nowrap min-w-0">{{ attemptedPath }}</span>
      </div>

      <div class="flex gap-3">
        <button
          type="button"
          @click="goBack"
          class="h-10 px-5 rounded-xl text-[13px] font-semibold cursor-pointer transition-all bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white"
        >
          {{ t('not_found.back', '返回上页') }}
        </button>
        <button
          type="button"
          @click="goLogin"
          class="h-10 px-5 rounded-xl text-[13px] font-semibold text-white border-none cursor-pointer transition-all bg-gradient-to-br from-blue-600 to-indigo-600 shadow-[0_4px_12px_rgba(37,99,235,0.25)] hover:opacity-95 hover:-translate-y-px"
        >
          {{ t('not_found.home', '返回登录') }}
        </button>
      </div>
    </div>
  </AuthContainer>
</template>
