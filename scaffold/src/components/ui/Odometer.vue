<script setup lang="ts">
/**
 * 逐位滚动读数（参考项目 Odometer 的移植）
 *
 * 每一位是一条 0–9 的竖带，只有数值真正变化的位才会滚 —— 切换时间档或刷新时，
 * 数字像机械计数器一样滚到新值，而不是整块文本硬替换。
 *
 * 两个细节：
 * - 位次 key 按「从右往左」编号：位数变化时个位、十位不会错位重排；
 * - 首帧先停在 0 再滚到目标值（rAF 触发，后台标签页 rAF 不跑，用定时器兜底）。
 *
 * 颜色与字号全部继承父级，组件只负责「怎么动」。
 */
import { computed, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    value: number | null | undefined;
    /** 小数位 */
    decimals?: number;
    /** 千分位分隔 */
    group?: boolean;
    /** 空值占位符 */
    placeholder?: string;
  }>(),
  {
    decimals: 0,
    group: true,
    placeholder: '—'
  }
);

const mounted = ref(false);
onMounted(() => {
  const settle = () => {
    mounted.value = true;
  };
  if (document.hidden) {
    settle();
    return;
  }
  requestAnimationFrame(settle);
  window.setTimeout(settle, 120);
});

/** 展示文本：null / NaN / 负数以外的非法值统一走占位符 */
const text = computed(() => {
  const value = props.value;
  if (value === null || value === undefined || Number.isNaN(value)) return props.placeholder;
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: props.decimals,
    maximumFractionDigits: props.decimals,
    useGrouping: props.group
  });
});

/** 拆位：数字位给竖带，其余（小数点、千分位逗号）原样输出 */
const cells = computed(() => {
  const list = [...text.value];
  const dot = list.indexOf('.');
  return list.map((char, index) => ({
    char,
    key: list.length - index,
    digit: /\d/.test(char) ? Number(char) : null,
    fraction: dot !== -1 && index > dot
  }));
});
</script>

<template>
  <span class="odometer" role="img" :aria-label="text">
    <span
      v-for="cell in cells"
      :key="cell.key"
      :class="['odo-cell', { 'is-fraction': cell.fraction, 'is-sep': cell.digit === null }]"
      aria-hidden="true"
    >
      <span
        v-if="cell.digit !== null"
        class="odo-strip"
        :style="{
          transform: `translateY(${-(mounted ? cell.digit : 0) * 10}%)`,
          transitionDelay: `${(cell.key % 6) * 40}ms`
        }"
      >
        <span v-for="n in 10" :key="n">{{ n - 1 }}</span>
      </span>
      <template v-else>{{ cell.char }}</template>
    </span>
  </span>
</template>

<style scoped>
.odometer {
  display: inline-flex;
  align-items: baseline;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}

/* 一位 = 一扇 1em 高的窗，竖带在窗里上下滑 */
.odo-cell {
  position: relative;
  display: inline-block;
  height: 1em;
  overflow: hidden;
}

/* 小数点 / 逗号不参与滚动，不能裁切 */
.odo-cell.is-sep {
  overflow: visible;
}

.odo-cell.is-fraction {
  color: var(--mauth-text-faint);
}

.odo-strip {
  display: flex;
  flex-direction: column;
  transition: transform 0.9s var(--ease-premium);
}

.odo-strip > span {
  display: block;
  height: 1em;
  line-height: 1;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .odo-strip {
    transition: none;
  }
}
</style>
