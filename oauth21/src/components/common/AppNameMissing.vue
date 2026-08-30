<script setup lang="ts">
/**
 * "应用标识缺失"错误提示组件
 *
 * URL 缺 appName（或 client_id）参数时显示，统一两个登录页（StandardLogin/MiniLogin）
 * 的硬编码错误块。i18n 化 + 主题适配 + 样式统一。
 *
 * 用法：<AppNameMissing /> 放在登录页模板顶部，与 <AuthContainer> 同级
 */
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center p-8 max-w-[380px] mx-auto">
    <div class="w-20 h-20 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-[24px] flex items-center justify-center mb-6 shadow-sm">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
      {{ t('app_missing.title', '应用标识缺失') }}
    </h2>
    <p class="text-sm text-slate-500 dark:text-slate-400">
      {{ t('app_missing.desc', '缺少 appName 参数，无法提供登录授权服务。') }}
    </p>
  </div>
</template>
