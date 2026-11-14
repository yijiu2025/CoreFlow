<script setup lang="ts">
/**
 * 星期 × 小时热力格（参考项目 `components/charts/HeatGrid.vue` 的移植）
 *
 * 三处与"想当然的画法"不同，都是刻意的：
 *
 * 🔴 **颜色按分位分 5 级，不按最大值线性归一。** 线性归一遇到一个突出的高峰
 *    （例如某天 10 点的批量导入），其余几十格会被压到几乎透明，整张图看起来
 *    "没有数据"。分位只关心"这一格相对其它格属于哪一档"，高峰吃掉一档不影响别人。
 *
 * 🔴 **小时刻度必须有。** 只有 24 个色块、没有 00/03/06… 的轴，读者数不出这是
 *    几点 —— 热力图的价值全在"定位到时"。
 *
 * 🔴 **失败集中的格子叠红色斜线，不是换个颜色。** 深浅已经用来表达"多不多"，
 *    再拿同一个变量表达"坏不坏"，两种语义会打架（一深一红读不出优先级）。
 *
 * 悬停/聚焦时高亮整行整列（十字）并给读数：一格一格读不出规律，十字交叉才行。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { computed, ref } from 'vue';

/** 后端原始格子（局部类型：`<script setup>` 不允许 export） */
interface HeatCell {
  dow: number;
  hour: number;
  total: number;
  failed: number;
}

const props = withDefaults(
  defineProps<{
    cells: HeatCell[];
    loading?: boolean;
    /** 读数的单位（登录「次」/ 操作「次」） */
    unit?: string;
    /**
     * 当前统计窗口（如「近 30 天」）
     *
     * 🔴 必须显示。7 天与 30 天**经常返回完全相同的格子**（老数据还没累积到 7 天前），
     *    此时网格本身不会有任何变化，用户会以为"切换按钮没生效"。把窗口写进读数行，
     *    切换才有确定反馈 —— 换句话说，这是唯一能证明"我按了"的东西。
     */
    windowLabel?: string;
  }>(),
  { loading: false, unit: '次', windowLabel: '' }
);

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

type GridCell = HeatCell & { level: 0 | 1 | 2 | 3 | 4; failRate: number; risky: boolean };

/**
 * 稀疏格子 → 7×24 稠密网格 + 分位分级
 *
 * 后端只返回有数据的格子（`GROUP BY dow, hour`），这里补成满格，
 * 否则网格会出现"少了几块"的错位。
 *
 * @returns 网格、峰值格、总次数
 */
const data = computed(() => {
  const grid: GridCell[][] = Array.from({ length: 7 }, (_, dow) =>
    Array.from({ length: 24 }, (_, hour) => ({
      dow,
      hour,
      total: 0,
      failed: 0,
      level: 0 as const,
      failRate: 0,
      risky: false
    }))
  );

  for (const cell of props.cells) {
    if (cell.dow < 0 || cell.dow > 6 || cell.hour < 0 || cell.hour > 23) continue;
    grid[cell.dow][cell.hour].total += Number(cell.total || 0);
    grid[cell.dow][cell.hour].failed += Number(cell.failed || 0);
  }

  const totals = grid
    .flat()
    .map(cell => cell.total)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  const quantile = (p: number): number => (totals.length ? totals[Math.floor(p * (totals.length - 1))] : 0);
  const cuts = [quantile(0.25), quantile(0.5), quantile(0.75)];

  let peak: GridCell | null = null;
  for (const cell of grid.flat()) {
    cell.failRate = cell.total ? cell.failed / cell.total : 0;
    // 失败"集中"：至少 2 次且占比 ≥ 30%。只按占比判会让 1/1 的孤例满图飘红
    cell.risky = cell.failed >= 2 && cell.failRate >= 0.3;
    cell.level = (
      cell.total === 0 ? 0 : cell.total <= cuts[0] ? 1 : cell.total <= cuts[1] ? 2 : cell.total <= cuts[2] ? 3 : 4
    ) as GridCell['level'];
    if (!peak || cell.total > peak.total) peak = cell;
  }

  return {
    grid,
    peak: peak && (peak as GridCell).total > 0 ? (peak as GridCell) : null,
    total: totals.reduce((a, b) => a + b, 0),
    active: totals.length
  };
});

/** 小时刻度：每 3 小时一个（0/3/6…21）；23 点不是 3 的倍数，不标 */
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

const hover = ref<GridCell | null>(null);

/**
 * 无障碍标签 / 读数文案
 *
 * @param cell 格子
 * @returns 形如「周三 09:00，12 次，失败 2 次」
 */
function label(cell: GridCell): string {
  const time = `${DAYS[cell.dow]} ${String(cell.hour).padStart(2, '0')}:00`;
  if (!cell.total) return `${time}，无记录`;
  return `${time}，${cell.total} ${props.unit}${cell.failed ? `，失败 ${cell.failed} 次` : ''}`;
}

/**
 * 方向键在格间移动（键盘可达性；纯 div 网格默认完全无法遍历）
 *
 * @param event 键盘事件
 * @param cell 当前格
 */
function onKey(event: KeyboardEvent, cell: GridCell): void {
  const move = (
    {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0]
    } as Record<string, [number, number]>
  )[event.key];
  if (!move) return;
  event.preventDefault();
  const dow = Math.min(6, Math.max(0, cell.dow + move[0]));
  const hour = Math.min(23, Math.max(0, cell.hour + move[1]));
  document.querySelector<HTMLElement>(`[data-cell="${dow}-${hour}"]`)?.focus();
}

/**
 * 入场延迟：从左上方沿对角线铺开，而不是整块闪一下
 *
 * @param cell 格子
 * @returns CSS 延迟
 */
function delayOf(cell: GridCell): string {
  return `${((cell.dow + cell.hour) / 30) * 0.6}s`;
}
</script>

<template>
  <div class="heat" :class="{ 'is-loading': loading }" @pointerleave="hover = null">
    <!--
      小时刻度：每 3 小时标一个，24 个全标会挤成一团。
      🔴 用**显式 grid-column** 定位（h + 2 就是该小时所在的列），不要靠 24 个空 span 自动占位 ——
         空内容节点的自动分布没有对齐保证，一旦某列被跳过，整排标签会相对格子整体平移。
    -->
    <div class="heat-hours" aria-hidden="true">
      <span
        v-for="h in HOUR_LABELS"
        :key="h"
        :style="{ gridColumn: h + 2 }"
        :class="{ 'is-on': hover !== null && Math.floor(hover.hour / 3) * 3 === h }"
      >
        {{ String(h).padStart(2, '0') }}
      </span>
    </div>

    <div v-for="(row, dow) in data.grid" :key="dow" class="heat-row" role="row">
      <span :class="['heat-day', { 'is-on': hover?.dow === dow }]">{{ DAYS[dow] }}</span>
      <button
        v-for="cell in row"
        :key="cell.hour"
        type="button"
        :data-cell="`${cell.dow}-${cell.hour}`"
        :class="[
          'heat-cell',
          `lv-${cell.level}`,
          {
            'is-risky': cell.risky,
            'is-cross': hover && (hover.dow === cell.dow || hover.hour === cell.hour),
            'is-hover': hover === cell
          }
        ]"
        :style="{ animationDelay: delayOf(cell) }"
        :aria-label="label(cell)"
        @pointerenter="hover = cell"
        @focus="hover = cell"
        @keydown="onKey($event, cell)"
      />
    </div>

    <div class="heat-foot">
      <span class="heat-readout" aria-live="polite">
        <template v-if="hover">{{ label(hover) }}</template>
        <template v-else>
          <b v-if="windowLabel" class="heat-window">{{ windowLabel }}</b>
          <template v-if="data.total">
            · 合计 {{ data.total }} {{ unit }} · {{ data.active }} 个时段有记录<template v-if="data.peak">
              · 高峰 {{ DAYS[data.peak.dow] }} {{ String(data.peak.hour).padStart(2, '0') }}:00（{{ data.peak.total }}
              {{ unit }}）</template
            >
          </template>
          <template v-else>· 该窗口内暂无记录</template>
        </template>
      </span>
      <span class="heat-legend" aria-hidden="true">
        少<i class="lg lv-1" /><i class="lg lv-2" /><i class="lg lv-3" /><i class="lg lv-4" />多<i
          class="lg is-risky"
        />失败集中
      </span>
    </div>
  </div>
</template>

<style scoped>
.heat {
  /*
   * 格子尺寸**不写死**，而是复用年档的算式（见 .heat-row 的 grid-template-columns）。
   *
   * 写死 18px 只在 1440 宽下"看着一样"：年档是 53 列 1fr，面板一宽它就跟着长
   * （1920 下能到 26px），于是 7 天档又显得小。同一页两张热力图的方块必须永远同大，
   * 唯一可靠的做法是**用同一个公式算**，而不是各自取一个近似值。
   *
   * 历史：最初是 `repeat(24, minmax(18px, 1fr))` —— 卡片一宽 24 列就瓜分整行，
   * 单格到 41×33px；中途压到 20×16 又变成扁块。正方 + 同尺寸是这两条教训的合并结果。
   */
  --cell-gap: 3px;
  display: flex;
  flex-direction: column;
  gap: var(--cell-gap);
  overflow-x: auto;
  padding-bottom: 2px;
}

.heat.is-loading {
  opacity: 0.5;
}

.heat-hours,
.heat-row {
  display: grid;
  /*
   * 一格 = 年档的一格。
   * 年档：`28px + repeat(53, minmax(9px, 1fr))`、gap 3 → 一格 = (容器宽 - 28 - 52×3) / 53。
   * 这里原样套用这个算式（184 = 28 + 52×3），所以两档在任何宽度下都同尺寸。
   * max(10px, …) 是窄屏下限，再小就该横向滚动了。
   */
  grid-template-columns: 32px repeat(24, max(10px, (100% - 184px) / 53));
  gap: var(--cell-gap);
  justify-content: start;
}

.heat-hours span {
  grid-row: 1;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--mauth-text-faint);
  transition: color 0.2s var(--ease);
}

.heat-hours span:first-child {
  grid-column: 2;
}

.heat-hours span.is-on {
  color: var(--mauth-text);
}

.heat-day {
  align-self: center;
  font-size: 11px;
  color: var(--mauth-text-soft);
  transition: color 0.2s var(--ease);
}

.heat-day.is-on {
  color: var(--mauth-text);
  font-weight: 650;
}

.heat-cell {
  position: relative;
  aspect-ratio: 1;
  min-height: 10px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  cursor: default;
  background: var(--mauth-hover);
  box-shadow: inset 0 0 0 1px var(--mauth-border);
  transition:
    box-shadow 0.2s var(--ease),
    filter 0.2s var(--ease);
  animation: heat-in 0.42s var(--ease-out) both;
}

@keyframes heat-in {
  from {
    opacity: 0;
    transform: scale(0.25);
  }
}

/* 五档：青柠由浅到深。深色档换成更实的叶绿，避免在深色底上"越深越看不见" */
.heat-cell.lv-1 {
  background: color-mix(in srgb, var(--lime) 18%, var(--surface-solid));
}

.heat-cell.lv-2 {
  background: color-mix(in srgb, var(--lime) 38%, var(--surface-solid));
}

.heat-cell.lv-3 {
  background: color-mix(in srgb, var(--lime) 62%, var(--surface-solid));
}

.heat-cell.lv-4 {
  background: color-mix(in srgb, var(--leaf-text) 88%, var(--surface-solid));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--leaf-text) 40%, transparent),
    0 4px 10px color-mix(in srgb, var(--lime) 25%, transparent);
}

/* 失败集中：红色斜线叠加（不是换色，见文件头） */
.heat-cell.is-risky::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--mauth-danger) 70%, transparent) 0 1.5px,
    transparent 1.5px 4.5px
  );
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mauth-danger) 55%, transparent);
}

/* 有悬停格时，非十字线的格子退到背景里，规律才浮出来 */
.heat:has(.is-hover) .heat-cell:not(.is-cross) {
  filter: saturate(0.4) opacity(0.55);
}

.heat-cell.is-hover {
  z-index: 1;
  box-shadow:
    0 0 0 2px var(--mauth-primary),
    0 6px 14px color-mix(in srgb, var(--mauth-text) 18%, transparent);
}

.heat-cell:focus-visible {
  outline: 2px solid var(--mauth-focus);
  outline-offset: 2px;
}

.heat-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 6px;
  min-width: 0;
}

.heat-readout {
  font-size: 12.5px;
  color: var(--mauth-text-mid);
  font-variant-numeric: tabular-nums;
}

/* 窗口标签：切换 7/30 天时这一处一定会变，是"按了有效"的可见凭据 */
.heat-window {
  font-weight: 650;
  color: var(--mauth-text);
}

.heat-legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.heat-legend .lg {
  position: relative;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--mauth-hover);
}

.heat-legend .lg.lv-1 {
  background: color-mix(in srgb, var(--lime) 18%, var(--surface-solid));
}

.heat-legend .lg.lv-2 {
  background: color-mix(in srgb, var(--lime) 38%, var(--surface-solid));
}

.heat-legend .lg.lv-3 {
  background: color-mix(in srgb, var(--lime) 62%, var(--surface-solid));
}

.heat-legend .lg.lv-4 {
  margin-right: 4px;
  background: color-mix(in srgb, var(--leaf-text) 88%, var(--surface-solid));
}

.heat-legend .lg.is-risky {
  margin-left: 10px;
  background: repeating-linear-gradient(135deg, var(--mauth-danger) 0 1.5px, transparent 1.5px 4px);
  box-shadow: inset 0 0 0 1px var(--mauth-danger);
}

@media (prefers-reduced-motion: reduce) {
  .heat-cell {
    animation: none;
  }
}
</style>
