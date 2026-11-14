<script setup lang="ts">
/**
 * 趋势图 —— **照搬参考项目 `components/charts/TrendChart.vue`**
 *
 * 只做了两处与源码不同的处理（因为本仓没有 gsap 与 `--ink` 系列令牌）：
 *   1. 去掉 gsap 的路径形变与 quickTo 跟手，改为直接按几何计算路径；
 *   2. 颜色/圆角改由主题变量提供（`--mauth-*` / graphs.css 的 `--surface-solid`）。
 * 几何与判据一行未改：PAD、niceStep、下标等距布点、抽稀标签、稀疏茎叶、悬停准星。
 *
 * 原注释保留：
 *   纯 SVG 趋势图：按容器真实宽度计算路径，线宽不被拉伸。
 *   - 悬停十字准星 + 毛玻璃读数
 *   - secondary 为第二条序列（如失败数），以虚线叠加
 *   - 稀疏数据（非零点 ≤ 3 且点数 > 6）改画茎叶点并直接标数值，避免贴底折线末端一根尖刺
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { EASE, gsap, motionSkipped } from '@/composables/motion';

const props = withDefaults(
  defineProps<{
    values: number[];
    labels: string[];
    secondary?: number[];
    secondaryLabel?: string;
    primaryLabel?: string;
    height?: number;
    unit?: string;
    /** 节点圆点：自动（点数 ≤ 12 时全部显示，否则只显示末点） */
    dots?: boolean;
    tone?: 'blue' | 'ink';
  }>(),
  {
    secondary: () => [],
    secondaryLabel: '失败',
    primaryLabel: '数值',
    height: 220,
    unit: '',
    dots: true,
    tone: 'blue'
  }
);

const box = ref<HTMLElement | null>(null);
const tip = ref<HTMLElement | null>(null);
const width = ref(600);
const hover = ref<number | null>(null);
const uid = Math.random().toString(36).slice(2, 8);
const PAD = { top: 18, right: 14, bottom: 28, left: 38 };

/* 纵轴取整：至少留 15% 顶部余量，刻度步长取 1 / 2 / 5 × 10ⁿ */
function niceStep(raw: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const r = raw / magnitude;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * magnitude;
}

const scale = computed(() => {
  const peak = Math.max(1, ...props.values, ...props.secondary);
  const step = Math.max(1, niceStep((peak * 1.15) / 4));
  const max = step * Math.max(1, Math.ceil((peak * 1.15) / step));
  return { step, max };
});

const innerW = computed(() => Math.max(10, width.value - PAD.left - PAD.right));
const innerH = computed(() => props.height - PAD.top - PAD.bottom);

const xAt = (i: number, n: number) => PAD.left + (n <= 1 ? innerW.value / 2 : (i / (n - 1)) * innerW.value);
const yAt = (v: number) => PAD.top + innerH.value - (v / scale.value.max) * innerH.value;

const target = computed(() => props.values.map((v, i) => ({ x: xAt(i, props.values.length), y: yAt(v) })));
const target2 = computed(() => props.secondary.map((v, i) => ({ x: xAt(i, props.secondary.length), y: yAt(v) })));

/* ── 形变：切换时间档时点列在新旧形状之间插值，而不是"擦掉重画" ──
 *
 * 两档的点数不同（24 / 7 / 30），不能逐点对应。先把旧点列**重采样**成新点数，
 * 再逐点线性插值 —— 于是"7 天切 24 小时"看到的是曲线被拉开，而不是闪一下换了一张图。
 *
 * 为什么不用 CSS transition：路径 `d` 不是可过渡属性，浏览器只会硬切。
 * 逐帧重算 `d` 是最老实也最省的做法（点数 ≤ 30，一帧几十次字符串拼接可以忽略）。
 */
type Pt = { x: number; y: number };

const shown = shallowRef<Pt[]>([]);
const shown2 = shallowRef<Pt[]>([]);

/**
 * 线性重采样到 n 个点
 *
 * @param points 原有点列
 * @param n 目标点数
 * @returns 重采样后的点列
 */
function resample(points: Pt[], n: number): Pt[] {
  if (!points.length) {
    return Array.from({ length: n }, (_, i) => ({ x: xAt(i, n), y: PAD.top + innerH.value }));
  }
  return Array.from({ length: n }, (_, i) => {
    const pos = n <= 1 ? 0 : (i / (n - 1)) * (points.length - 1);
    const a = points[Math.floor(pos)];
    const b = points[Math.min(points.length - 1, Math.ceil(pos))];
    const t = pos - Math.floor(pos);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

let morph: gsap.core.Tween | null = null;

/** 把当前绘制点列补间到 targets */
function morphTo(): void {
  morph?.kill();
  const to = target.value;
  const to2 = target2.value;
  // 首帧（还没有旧形状）或系统要求减少动效：直接落位
  if (!shown.value.length || motionSkipped()) {
    shown.value = to;
    shown2.value = to2;
    return;
  }
  const from = resample(shown.value, to.length);
  const from2 = resample(shown2.value, to2.length);
  const state = { t: 0 };
  morph = gsap.to(state, {
    t: 1,
    duration: 0.72,
    ease: EASE.swap,
    overwrite: 'auto',
    onUpdate: () => {
      shown.value = to.map((p, i) => ({
        x: from[i].x + (p.x - from[i].x) * state.t,
        y: from[i].y + (p.y - from[i].y) * state.t
      }));
      shown2.value = to2.map((p, i) => ({
        x: from2[i].x + (p.x - from2[i].x) * state.t,
        y: from2[i].y + (p.y - from2[i].y) * state.t
      }));
    }
  });
}

function smooth(pts: Array<{ x: number; y: number }>) {
  if (!pts.length) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i - 1];
    const c = pts[i];
    const mx = (p.x + c.x) / 2;
    d += ` C${mx},${p.y} ${mx},${c.y} ${c.x},${c.y}`;
  }
  return d;
}

const linePath = computed(() => smooth(shown.value));
const line2Path = computed(() => smooth(shown2.value));
const areaPath = computed(() => {
  const pts = shown.value;
  if (!pts.length) return '';
  const base = PAD.top + innerH.value;
  return `${smooth(pts)} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z`;
});

const ticks = computed(() => {
  const list: Array<{ y: number; label: number }> = [];
  for (let v = 0; v <= scale.value.max; v += scale.value.step) list.push({ y: yAt(v), label: v });
  return list;
});

/* 横轴标签抽稀
   🔴 必须从**末点往前**取，不能从 0 开始取再补末点。从 0 开始取时，只要
   `(n-1) % step !== 0`，末点就会紧贴上一个刻度 —— 30 天档实测 `11/10` 与
   `11/11` 相互压字（轴右端糊成一团）。反向取则相邻标签的间距恒等于 step；
   末点又是"当前时段"，本来就该出现，于是两边都不吃亏。 */
const xLabels = computed(() => {
  const n = props.labels.length;
  if (!n) return [];
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW.value / 70))));
  const picked: number[] = [];
  for (let i = n - 1; i >= 0; i -= step) picked.push(i);
  // 反向取完后「最左的那个点」若离 0 还有大半格，就把左端也标上，免得轴头空着
  if (picked[picked.length - 1] >= step * 0.75) picked.push(0);
  return picked.sort((a, b) => a - b).map(i => ({ label: props.labels[i], i }));
});

const showAllDots = computed(() => props.dots && props.values.length <= 12);
/* 稀疏序列（非零点 ≤ 3 且点数 > 6）改画茎叶点并直接标数值：连成折线会画出一条
   贴底的长横线再猛地竖起一根尖刺，比"一个点一根竖线"更难读 */
const sparse = computed(
  () => props.values.length > 6 && props.values.filter(v => v > 0).length <= 3 && props.values.some(v => v > 0)
);
const stems = computed(() =>
  target.value.map((p, i) => ({
    ...p,
    i,
    v: props.values[i],
    v2: props.secondary[i] ?? 0,
    y2: props.secondary.length ? yAt(props.secondary[i] ?? 0) : 0
  }))
);

/* ── 准星读数：浮层位置由几何算出，夹在容器内 ── */
const tipSize = ref({ w: 132, h: 78 });
const tipStyle = computed(() => {
  const idx = hover.value;
  if (idx === null || !target.value[idx]) return {};
  const p = target.value[idx];
  const x = Math.min(Math.max(p.x - tipSize.value.w / 2, 0), Math.max(0, width.value - tipSize.value.w));
  const y = Math.max(p.y - tipSize.value.h - 14, 0);
  return { transform: `translate(${x}px, ${y}px)` };
});

function onMove(event: PointerEvent) {
  const rect = box.value?.getBoundingClientRect();
  const pts = target.value;
  if (!rect || !pts.length) return;
  const x = event.clientX - rect.left;
  let nearest = 0;
  pts.forEach((p, i) => {
    if (Math.abs(p.x - x) < Math.abs(pts[nearest].x - x)) nearest = i;
  });
  hover.value = nearest;
}

function onLeave() {
  hover.value = null;
}

watch(hover, () => {
  nextTick(() => {
    if (!tip.value) return;
    tipSize.value = { w: tip.value.offsetWidth, h: tip.value.offsetHeight };
  });
});

/* 按容器真实宽度渲染：固定 viewBox 会被拉伸，文字与线宽随之变形 */
let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(entries => {
    width.value = Math.round(entries[0].contentRect.width);
    // 宽度变化意味着坐标轴换了，形变中的点列会飞 —— 直接落位
    morph?.kill();
    shown.value = target.value;
    shown2.value = target2.value;
  });
  if (box.value) observer.observe(box.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  morph?.kill();
});

watch(() => [props.values, props.secondary], morphTo, { immediate: true });
</script>

<template>
  <div
    ref="box"
    :class="['trend', `tone-${tone}`]"
    :style="{ height: `${height}px` }"
    @pointermove="onMove"
    @pointerleave="onLeave"
  >
    <svg :width="width" :height="height" role="img" :aria-label="`趋势图，峰值 ${Math.max(0, ...values)}${unit}`">
      <defs>
        <linearGradient :id="`tg-${uid}`" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" class="trend-stop" stop-opacity=".2" />
          <stop offset="100%" class="trend-stop" stop-opacity="0" />
        </linearGradient>
      </defs>

      <g class="trend-grid">
        <line v-for="t in ticks" :key="t.y" :x1="PAD.left" :x2="width - PAD.right" :y1="t.y" :y2="t.y" />
      </g>

      <g class="trend-axis">
        <text v-for="t in ticks" :key="`l${t.y}`" :x="PAD.left - 10" :y="t.y + 3.5" text-anchor="end">
          {{ t.label }}
        </text>
        <text v-for="l in xLabels" :key="`x${l.i}`" :x="target[l.i]?.x" :y="height - 8" text-anchor="middle">
          {{ l.label }}
        </text>
      </g>

      <g v-if="sparse" class="trend-stems">
        <line class="trend-base" :x1="PAD.left" :x2="width - PAD.right" :y1="PAD.top + innerH" :y2="PAD.top + innerH" />
        <template v-for="st in stems" :key="`s${st.i}`">
          <circle v-if="!st.v" class="trend-tick" :cx="st.x" :cy="PAD.top + innerH" r="1.6" />
          <g v-else>
            <line class="trend-stem" :x1="st.x" :x2="st.x" :y1="PAD.top + innerH" :y2="st.y" />
            <line
              v-if="st.v2"
              class="trend-stem is-secondary"
              :x1="st.x + 3"
              :x2="st.x + 3"
              :y1="PAD.top + innerH"
              :y2="st.y2"
            />
            <circle class="trend-dot" :cx="st.x" :cy="st.y" r="4.5" />
            <text class="trend-stem-label" :x="st.x" :y="st.y - 12" text-anchor="middle">{{ st.v }}{{ unit }}</text>
          </g>
        </template>
      </g>

      <path v-show="!sparse" :d="areaPath" :fill="`url(#tg-${uid})`" />
      <path v-if="secondary.length && !sparse" class="trend-line-2" :d="line2Path" />
      <path v-show="!sparse" class="trend-line" :d="linePath" />

      <g v-if="!sparse && showAllDots" class="trend-nodes">
        <circle v-for="(p, i) in shown" :key="i" :cx="p.x" :cy="p.y" r="3.2" />
      </g>
      <g v-else-if="!sparse && dots && shown.length" class="trend-nodes is-last">
        <circle :cx="shown[shown.length - 1].x" :cy="shown[shown.length - 1].y" r="9" class="trend-halo" />
        <circle :cx="shown[shown.length - 1].x" :cy="shown[shown.length - 1].y" r="3.6" />
      </g>

      <g v-if="hover !== null && target[hover]">
        <line class="trend-cursor" :x1="target[hover].x" :x2="target[hover].x" :y1="PAD.top" :y2="PAD.top + innerH" />
        <line
          class="trend-cursor is-h"
          :x1="PAD.left"
          :x2="width - PAD.right"
          :y1="target[hover].y"
          :y2="target[hover].y"
        />
        <circle class="trend-dot" :cx="target[hover].x" :cy="target[hover].y" r="4.5" />
      </g>
    </svg>

    <div v-if="hover !== null && target[hover]" ref="tip" class="trend-tip" :style="tipStyle">
      <span class="trend-tip-time">{{ labels[hover] }}</span>
      <span class="trend-tip-row"
        ><i class="tip-key is-primary" />{{ primaryLabel }}<b>{{ values[hover] }}{{ unit }}</b></span
      >
      <span v-if="secondary.length" class="trend-tip-row"
        ><i class="tip-key is-secondary" />{{ secondaryLabel }}<b>{{ secondary[hover] }}{{ unit }}</b></span
      >
    </div>
  </div>
</template>

<style scoped>
.trend {
  position: relative;
  width: 100%;
  touch-action: pan-y;
}

.trend svg {
  display: block;
  overflow: visible;
}

.trend.tone-blue {
  --trend-ink: var(--mauth-primary);
}

.trend.tone-ink {
  --trend-ink: var(--mauth-text);
}

.trend-stop {
  stop-color: var(--trend-ink);
}

.trend-grid line {
  stroke: var(--mauth-border-strong);
  stroke-dasharray: 1 5;
  stroke-linecap: round;
}

.trend-axis text {
  fill: var(--mauth-text-faint);
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.trend-line {
  fill: none;
  stroke: var(--trend-ink);
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trend-base {
  stroke: var(--mauth-border-strong);
}

.trend-tick {
  fill: color-mix(in srgb, var(--mauth-text) 22%, transparent);
}

.trend-stem {
  stroke: var(--trend-ink);
  stroke-width: 2;
  stroke-linecap: round;
}

.trend-stem.is-secondary {
  stroke: var(--mauth-danger);
  stroke-width: 1.6;
  stroke-dasharray: 3 3;
}

.trend-stem-label {
  fill: var(--mauth-text);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
}

.trend-line-2 {
  fill: none;
  stroke: var(--mauth-danger);
  stroke-width: 1.6;
  stroke-dasharray: 4 4;
  stroke-linecap: round;
  opacity: 0.8;
}

.trend-nodes circle {
  fill: var(--surface-solid);
  stroke: var(--trend-ink);
  stroke-width: 2;
}

.trend-nodes .trend-halo {
  fill: var(--mauth-primary-soft);
  stroke: none;
}

.trend-cursor {
  stroke: color-mix(in srgb, var(--mauth-text) 50%, transparent);
  stroke-dasharray: 2 3;
}

.trend-cursor.is-h {
  stroke: color-mix(in srgb, var(--mauth-text) 22%, transparent);
}

.trend-dot {
  fill: var(--surface-solid);
  stroke: var(--trend-ink);
  stroke-width: 2.4;
}

/* 读数浮层：毛玻璃（blur + 白边 + 三级阴影），对应参考项目的 `.m-float` */
.trend-tip {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 132px;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--mauth-surface) 88%, transparent);
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-surface) 82%, transparent);
  box-shadow:
    var(--e3),
    inset 0 1px 0 color-mix(in srgb, var(--mauth-surface) 96%, transparent);
  backdrop-filter: blur(28px) saturate(1.08);
  -webkit-backdrop-filter: blur(28px) saturate(1.08);
  color: var(--mauth-text-mid);
  font-size: 12px;
  pointer-events: none;
  z-index: 2;
}

.trend-tip-time {
  color: var(--mauth-text-faint);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.trend-tip-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.trend-tip-row b {
  margin-left: auto;
  color: var(--mauth-text);
  font-family: var(--font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.tip-key {
  width: 8px;
  height: 3px;
  border-radius: 2px;
  background: var(--trend-ink);
}

.tip-key.is-secondary {
  background: var(--mauth-danger);
}

@media (prefers-reduced-transparency: reduce) {
  .trend-tip {
    background: var(--mauth-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
