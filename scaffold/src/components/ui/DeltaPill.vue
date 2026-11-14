<script setup lang="ts">
/**
 * 环比胶囊（参考项目 `components/ui/DeltaPill.vue` 的移植）
 *
 * 四态：上升（青柠）/ 下降（红）/ 持平（中性）/ 新增（蓝）。
 *
 * 🔴 `fresh` 与 `value = 0` 必须分开：上一周期为 0 且本期有量时，"增长 100%"
 *    在数学上不成立（分母为 0），显示成 `+100%` 是**编出来的数字**。这种情况
 *    只说"新增"，不宣称百分比；上一周期与本期都为 0 才是真正的持平 `±0%`。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 环比百分比（已乘 100，可带小数） */
    value: number | null | undefined;
    /** 显式方向；不传则按 value 正负判断 */
    up?: boolean | null;
    /** 上一周期为 0（分母不存在） */
    fresh?: boolean;
    suffix?: string;
    /** 无障碍描述 */
    label?: string;
  }>(),
  {
    up: null,
    fresh: false,
    suffix: '%',
    label: ''
  }
);

const dir = computed(() => {
  if (props.fresh) return 'new';
  const value = Number(props.value ?? 0);
  if (!value) return 'flat';
  if (props.up === null) return value > 0 ? 'up' : 'down';
  return props.up ? 'up' : 'down';
});

/** 文案：整数不带小数点，小数保留一位（`+12%` / `−3.5%`） */
const text = computed(() => {
  if (props.fresh) return '新增';
  const abs = Math.abs(Number(props.value ?? 0));
  const sign = dir.value === 'up' ? '+' : dir.value === 'down' ? '−' : '±';
  return `${sign}${Number.isInteger(abs) ? abs : abs.toFixed(1)}${props.suffix}`;
});
</script>

<template>
  <span :class="['delta-pill', `is-${dir}`]" :title="label">
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path v-if="dir === 'up'" d="M4 1.2 7 6H1z" fill="currentColor" />
      <path v-else-if="dir === 'down'" d="M4 6.8 1 2h6z" fill="currentColor" />
      <circle v-else-if="dir === 'new'" cx="4" cy="4" r="2.2" fill="currentColor" />
      <rect v-else x="1" y="3.3" width="6" height="1.4" rx=".7" fill="currentColor" />
    </svg>
    <span class="delta-pill__text">{{ text }}</span>
    <span v-if="label" class="sr-only">{{ label }}</span>
  </span>
</template>

<style scoped>
/* 胶囊高度 20px：与读数区里的小标签同高，摆在 56px 的大数字下面不会抢视线 */
.delta-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--mauth-text-soft);
  background: var(--mauth-hover);
}

/*
 * 增长用**主色**而不是青柠：环比上升是"方向"，不是"成功/正常"这种状态。
 * 青柠在蓝色主调里是外来色，落在一排读数里显得突兀；红色仍留给下降（这才是需要警觉的方向）。
 */
.delta-pill.is-up {
  color: var(--mauth-primary);
  background: var(--mauth-primary-soft);
}

.delta-pill.is-down {
  color: var(--mauth-danger);
  background: var(--mauth-danger-soft);
}

.delta-pill.is-new {
  color: var(--mauth-primary);
  background: var(--mauth-primary-soft);
}

/* 无障碍专用文本：视觉上不占位，读屏仍能读到"较上一周期"的语义 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
