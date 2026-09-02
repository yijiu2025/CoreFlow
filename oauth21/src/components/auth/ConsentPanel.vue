<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Icons from '@/components/common/Icons.vue';

interface Props {
  /** 授权状态数据 */
  consentState?: {
    consentKey: string;
    client_name: string;
    scopeDetails?: Array<{
      id: string;
      name: string;
      desc: string;
      required?: boolean;
    }>;
  };
  /** 是否正在提交 */
  submitting?: boolean;
  /** 拒绝授权回调 */
  onDeny: () => void;
  /** 批准授权回调 */
  onApprove: () => void;
}

const props = withDefaults(defineProps<Props>(), {
  submitting: false
});

const { t } = useI18n();
</script>

<template>
  <!-- 授权确认面板 -->
  <div class="flex-1 flex flex-col justify-center py-2 space-y-5 w-full">
    <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[#2563eb]/10 flex items-center justify-center text-[#2563eb] font-bold text-lg">
          {{ (consentState?.client_name || 'A')[0].toUpperCase() }}
        </div>
        <div>
          <h3 class="text-sm font-bold dark:text-white">
            {{ consentState?.client_name || t('login.third_party') }}
          </h3>
          <p class="text-xs text-slate-400">{{ t('login.requesting_auth') }}</p>
        </div>
      </div>
      <hr class="border-slate-100 dark:border-slate-800" />
      <div class="space-y-2">
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {{ t('login.requesting_permissions') }}
        </p>
        <ul class="space-y-1.5">
          <li
            v-for="s in (consentState?.scopeDetails || [])"
            :key="s.id"
            class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"
          >
            <Icons name="check" :size="16" class="text-green-500 shrink-0 mt-0.5" />
            <span>
              <strong class="font-semibold">{{ s.name }}</strong>
              <span class="text-slate-400 dark:text-slate-500">— {{ s.desc }}</span>
              <span v-if="s.required" class="ml-1 text-[10px] text-slate-400">（必需）</span>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <div class="flex gap-3">
      <button
        type="button"
        @click="props.onDeny"
        class="flex-1 h-11 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        {{ t('login.deny') }}
      </button>
      <button
        type="button"
        @click="props.onApprove"
        :disabled="props.submitting"
        class="mlogin-submit flex-1 h-11 text-xs"
      >
        <span v-if="props.submitting" class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        {{ t('login.approve') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 授权确认面板按钮样式 */
.mlogin-submit {
  height: 44px;
  width: 100%;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  border: none;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mlogin-submit:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}

.mlogin-submit:active:not(:disabled) {
  transform: translateY(0);
}

.mlogin-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 授权面板动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bg-slate-50 {
  animation: fadeIn 0.3s ease-out;
}

/* 响应式调整 */
@media (max-width: 480px) {
  .flex-gaps-3 {
    gap: 0.75rem;
  }

  .text-xs {
    font-size: 0.75rem;
  }
}

/* 加载动画兼容性 */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* 确保按钮在不同主题下的一致性 */
button {
  font-family: inherit;
}

/* 优化移动端点击体验 */
@media (hover: none) {
  .mlogin-submit:active:not(:disabled) {
    transform: scale(0.98);
  }
}
</style>