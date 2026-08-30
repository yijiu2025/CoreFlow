<script setup lang="ts">
/**
 * 密码输入框（带眼睛切换显示/隐藏）
 *
 * 复用于登录（pwd 模式）、注册（密码+确认密码）、重置密码（密码+确认密码）。
 * 主题适配：亮色 slate-400 / 暗色 slate-500，眼睛图标颜色。
 * 暴露事件：update:modelValue（v-model 双向绑定）
 */
import { ref, computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** v-model 双向绑定值 */
    modelValue: string;
    /** input placeholder */
    placeholder?: string;
    /** input id（关联 label） */
    id?: string;
    /** 是否显示错误态（红边） */
    hasError?: boolean;
    /** 自动聚焦 */
    autofocus?: boolean;
  }>(),
  {
    placeholder: '请输入密码',
    id: undefined,
    hasError: false,
    autofocus: false
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** 回车键 */
  'enter': [];
}>();

const showPassword = ref(false);
const inputType = computed(() => (showPassword.value ? 'text' : 'password'));

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
}

function onKeyup(e: KeyboardEvent) {
  if (e.key === 'Enter') emit('enter');
}
</script>

<template>
  <div class="relative">
    <!-- 左侧锁图标 -->
    <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    </div>
    <input
      :id="id"
      :value="modelValue"
      @input="onInput"
      @keyup="onKeyup"
      :type="inputType"
      :placeholder="placeholder"
      :autofocus="autofocus"
      class="w-full h-11 pl-11 pr-11 rounded-xl border bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all"
      :class="hasError
        ? 'border-rose-400 dark:border-rose-500 bg-rose-50/30 dark:bg-rose-950/30 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
        : 'border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'"
    />
    <!-- 右侧眼睛按钮 -->
    <button
      type="button"
      @click="showPassword = !showPassword"
      :title="showPassword ? '隐藏密码' : '显示密码'"
      class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
    >
      <svg v-if="showPassword" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    </button>
  </div>
</template>
