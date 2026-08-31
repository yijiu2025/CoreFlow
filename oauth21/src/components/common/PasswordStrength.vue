<script setup lang="ts">
/**
 * 密码强度条组件
 *
 * 4 段分段显示 + 文字标签（弱/弱/中/强/很强）+ 悬浮窗规则列表（? 触发）。
 * 复用于注册、重置密码。
 *
 * 规则（4 条，满足一条 score+1）：
 * 1. 至少 8 位
 * 2. 包含大写字母
 * 3. 包含数字
 * 4. 包含特殊字符
 */
import { computed, ref } from 'vue';

const props = defineProps<{
  /** 密码值 */
  password?: string;
  /** 是否显示悬浮窗 ? 按钮（v2 弱密码场景不需要提示时传 false） */
  showTipButton?: boolean;
}>();

const STRENGTH_RULES = [
  { label: '至少 8 位字符', test: (p: string) => p.length >= 8 },
  { label: '包含大写字母 (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { label: '包含数字 (0-9)', test: (p: string) => /[0-9]/.test(p) },
  { label: '包含特殊字符 (!@#$ 等)', test: (p: string) => /[^A-Za-z0-9]/.test(p) }
] as const;

const STRENGTH_LEVELS = [
  { label: '弱', color: '#f43f5e' },
  { label: '弱', color: '#f43f5e' },
  { label: '中', color: '#f59e0b' },
  { label: '强', color: '#eab308' },
  { label: '很强', color: '#10b981' }
] as const;

const strengthScore = computed(() => STRENGTH_RULES.filter(r => r.test(props.password || '')).length);
const strengthColor = computed(() => STRENGTH_LEVELS[strengthScore.value].color);
const strengthLabel = computed(() => STRENGTH_LEVELS[strengthScore.value].label);

const showTip = ref(false);
</script>

<template>
  <div v-if="password" class="space-y-1.5">
    <div class="flex gap-1">
      <div
        v-for="i in 4"
        :key="i"
        class="flex-1 h-1 rounded-full transition-colors"
        :class="i <= strengthScore ? '' : 'bg-slate-200 dark:bg-slate-700'"
        :style="i <= strengthScore ? { background: strengthColor } : undefined"
      ></div>
    </div>
    <div class="flex items-center justify-between text-xs">
      <span :style="{ color: strengthColor }" class="font-semibold">强度：{{ strengthLabel }}</span>
      <div v-if="showTipButton !== false" class="relative">
        <button
          type="button"
          @mouseenter="showTip = true"
          @mouseleave="showTip = false"
          @focus="showTip = true"
          @blur="showTip = false"
          @click="showTip = !showTip"
          class="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          title="查看强度要求"
        >
?
</button>
        <div
          v-if="showTip"
          class="absolute right-0 top-6 z-10 w-64 p-3 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs shadow-xl"
        >
          <div class="font-semibold mb-2 text-slate-100">密码强度要求</div>
          <ul class="space-y-1.5">
            <li
              v-for="rule in STRENGTH_RULES"
              :key="rule.label"
              class="flex items-start gap-2"
              :class="rule.test(password || '') ? 'text-emerald-400' : 'text-slate-400'"
            >
              <span class="inline-block w-3.5 flex-shrink-0 font-bold">
                {{ rule.test(password || '') ? '✓' : '✗' }}
              </span>
              <span>{{ rule.label }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
