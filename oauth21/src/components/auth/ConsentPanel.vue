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