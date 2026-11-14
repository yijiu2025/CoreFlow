<script setup lang="ts">
/**
 * 年度日历热力（参考 GitHub 贡献图：横轴每一周，纵轴周一…周日）
 *
 * 与 7 天的 `HeatGrid` 是两种图，不能合并：
 *   • 7 天看的是**节律**（星期几的几点）→ 格子 = 星期 × 小时；
 *   • 一年看的是**密度**（哪几周在忙）→ 格子 = 一周 × 星期几，一格就是一天。
 *
 * 🔴 日期来自后端（`series[].date`），不用前端 `new Date()` 推算。
 *    序列是按**数据库的钟**分桶的，前端自己减天数会引入"浏览器钟 vs 数据库钟"
 *    的第二套真相 —— 差一天就会让今天落进上一列，整张图的"最后一格"跟着错位。
 *
 * 🔴 最后一行/列不足的部分**不画占位格**：一年不是 7 的整数倍，末尾必然有空格。
 *    画成浅灰方块等于宣称"那几天没有活动"，而它们只是还没到。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { computed, ref } from 'vue';

/** 一天的序列点 */
interface DayCell {
  date: string;
  total: number;
  failed: number;
}

const props = withDefaults(
  defineProps<{
    days: DayCell[];
    loading?: boolean;
    unit?: string;
    /** 窗口描述（显示在读数行，如「近一年」） */
    windowLabel?: string;
  }>(),
  { loading: false, unit: '次', windowLabel: '' }
);

const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_MS = 86400000;

/**
 * 一天（UTC 零点）→ 周一为 0 的星期序号
 *
 * @param time UTC 毫秒
 * @returns 0..6
 */
function dowOf(time: number): number {
  return (new Date(time).getUTCDay() + 6) % 7;
}

/** 组装“周列 × 星期行”的网格 */
const data = computed(() => {
  const list = props.days;
  if (!list.length)
    return {
      rows: [] as Array<Array<(DayCell & { level: number; today: boolean }) | null>>,
      months: [] as Array<{ col: number; label: string }>,
      total: 0,
      active: 0
    };

  const parsed = list.map(item => ({ ...item, time: Date.parse(`${item.date}T00:00:00Z`) }));
  // 首日所在那一周的周一：作为第 0 列的起点
  const origin = parsed[0].time - dowOf(parsed[0].time) * DAY_MS;
  const colOf = (time: number): number => Math.floor((time - origin) / DAY_MS / 7);
  const columns = colOf(parsed[parsed.length - 1].time) + 1;

  // 分位分级：与 7 天热力同一套判据，避免两张图"同色不同义"
  const totals = parsed
    .map(item => item.total)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  const quantile = (p: number): number => (totals.length ? totals[Math.floor(p * (totals.length - 1))] : 0);
  const cuts = [quantile(0.25), quantile(0.5), quantile(0.75)];
  const levelOf = (v: number): number => (v === 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4);

  const today = parsed[parsed.length - 1].date;
  const rows: Array<Array<(DayCell & { level: number; today: boolean }) | null>> = Array.from({ length: 7 }, () =>
    Array.from({ length: columns }, () => null)
  );
  const months: Array<{ col: number; label: string }> = [];
  const monthSeen = new Set<number>();

  for (const item of parsed) {
    const col = colOf(item.time);
    const row = dowOf(item.time);
    rows[row][col] = {
      date: item.date,
      total: item.total,
      failed: item.failed,
      level: levelOf(item.total),
      today: item.date === today
    };
    // 月份刻度打在该月第一天的列上，同一列只标一次
    if (item.date.endsWith('-01') && !monthSeen.has(col)) {
      monthSeen.add(col);
      months.push({ col, label: `${Number(item.date.slice(5, 7))} 月` });
    }
  }

  return { rows, months, total: totals.reduce((a, b) => a + b, 0), active: totals.length };
});

/** 悬停的格子 */
const hover = ref<(DayCell & { level: number; today: boolean }) | null>(null);

/** 列数（给 CSS grid 用） */
const columnCount = computed(() => data.value.rows[0]?.length ?? 0);

/**
 * 入场动效延迟
 *
 * 与 7 天档（HeatGrid）同一手感：按「行 + 列」递增，格子从左上角向右下角依次弹出。
 * 两张图在同一页切换，动效不一致会像换了个组件。
 *
 * @param dow 星期行（0..6）
 * @param col 周列
 * @returns CSS 延迟（如 `0.42s`）
 */
function delayOf(dow: number, col: number): string {
  return `${((dow + col) / 60) * 0.6}s`;
}

/**
 * 读数文案
 *
 * @param cell 某天的格子
 * @returns 形如「2026-11-11（周三），6 次」
 */
function label(cell: DayCell): string {
  const time = Date.parse(`${cell.date}T00:00:00Z`);
  const weekday = WEEK[dowOf(time)];
  return `${cell.date}（${weekday}），${cell.total ? `${cell.total} ${props.unit}` : '无记录'}`;
}
</script>

<template>
  <div class="cal" :class="{ 'is-loading': loading }" @pointerleave="hover = null">
    <div class="cal__scroll">
      <!-- 月份刻度：横轴是"第几周"，但人脑按月份定位，所以刻度打在该月第一周 -->
      <div class="cal__months" :style="{ gridTemplateColumns: `28px repeat(${columnCount}, minmax(9px, 1fr))` }">
        <span />
        <span
          v-for="m in data.months"
          :key="`${m.col}-${m.label}`"
          :style="{ gridColumn: m.col + 2 }"
          class="cal__month"
          >{{ m.label }}</span
        >
      </div>

      <div
        v-for="(row, dow) in data.rows"
        :key="dow"
        class="cal__row"
        :style="{ gridTemplateColumns: `28px repeat(${columnCount}, minmax(9px, 1fr))` }"
      >
        <span class="cal__weekday">{{ WEEK[dow] }}</span>
        <template v-for="(cell, col) in row" :key="col">
          <!--
            首列的空白格是"统计窗口还没开始"，不是"那天没有活动"：
            画成虚线占位，把左上角补齐（留个缺口会让人以为图画漏了），
            但又不能画成实心浅灰 —— 那等于宣称那几天没有操作。
          -->
          <span v-if="!cell" :class="['cal__blank', { 'is-edge': col === 0 }]" />
          <button
            v-else
            type="button"
            :class="['cal__cell', `lv-${cell.level}`, { 'is-today': cell.today, 'is-hover': hover === cell }]"
            :style="{ animationDelay: delayOf(dow, col) }"
            :aria-label="label(cell)"
            :title="label(cell)"
            @pointerenter="hover = cell"
            @focus="hover = cell"
          />
        </template>
      </div>
    </div>

    <div class="cal__foot">
      <span class="cal__readout" aria-live="polite">
        <template v-if="hover">{{ label(hover) }}</template>
        <template v-else>
          <b v-if="windowLabel" class="cal__window">{{ windowLabel }}</b>
          <template v-if="data.total"> · 合计 {{ data.total }} {{ unit }} · {{ data.active }} 天有记录 </template>
          <template v-else>· 该窗口内暂无记录</template>
        </template>
      </span>
      <span class="cal__legend" aria-hidden="true">
        少<i class="lg lv-1" /><i class="lg lv-2" /><i class="lg lv-3" /><i class="lg lv-4" />多
      </span>
    </div>
  </div>
</template>

<style scoped>
.cal {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cal.is-loading {
  opacity: 0.5;
}

.cal__scroll {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-x: auto;
  padding-bottom: 2px;
  min-width: 0;
}

.cal__months,
.cal__row {
  display: grid;
  gap: 3px;
  align-items: center;
  min-width: 560px;
}

.cal__month {
  font-size: 10px;
  color: var(--mauth-text-faint);
  white-space: nowrap;
  padding-left: 1px;
}

.cal__weekday {
  font-size: 11px;
  color: var(--mauth-text-soft);
}

/* 没有数据的那几天（今年还没到）不画格子，免得读成"那天没有活动" */
.cal__blank {
  aspect-ratio: 1;
  min-height: 9px;
}

/* 首列（窗口开始之前的几天）用虚线占位补成完整矩形，语义上仍是"无格子" */
.cal__blank.is-edge {
  border: 1px dashed color-mix(in srgb, var(--mauth-border-strong) 85%, transparent);
  border-radius: 2.5px;
}

.cal__cell {
  aspect-ratio: 1;
  min-height: 9px;
  padding: 0;
  border: 0;
  border-radius: 2.5px;
  cursor: default;
  background: var(--mauth-hover);
  box-shadow: inset 0 0 0 1px var(--mauth-border);
  transition:
    box-shadow 0.2s var(--ease),
    filter 0.2s var(--ease);
  /* 入场与 7 天档一致：从 0.25 倍放大 + 淡入，按格子位置依次错开 */
  animation: cal-in 0.42s var(--ease-out) both;
}

@keyframes cal-in {
  from {
    opacity: 0;
    transform: scale(0.25);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cal__cell {
    animation: none;
  }
}

.cal__cell.lv-1 {
  background: color-mix(in srgb, var(--lime) 18%, var(--surface-solid));
}

.cal__cell.lv-2 {
  background: color-mix(in srgb, var(--lime) 38%, var(--surface-solid));
}

.cal__cell.lv-3 {
  background: color-mix(in srgb, var(--lime) 62%, var(--surface-solid));
}

.cal__cell.lv-4 {
  background: color-mix(in srgb, var(--leaf-text) 88%, var(--surface-solid));
}

/* 今天：描一圈主色。它是读者定位"我在哪"的唯一锚点，必须一眼看到 */
.cal__cell.is-today {
  box-shadow:
    0 0 0 1.5px var(--mauth-primary),
    inset 0 0 0 1px color-mix(in srgb, var(--mauth-surface) 70%, transparent);
}

.cal__cell.is-hover {
  z-index: 1;
  box-shadow: 0 0 0 2px var(--mauth-text);
}

.cal__cell:focus-visible {
  outline: 2px solid var(--mauth-focus);
  outline-offset: 2px;
}

.cal__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.cal__readout {
  font-size: 12.5px;
  color: var(--mauth-text-mid);
  font-variant-numeric: tabular-nums;
}

.cal__window {
  font-weight: 650;
  color: var(--mauth-text);
}

.cal__legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.cal__legend .lg {
  width: 11px;
  height: 11px;
  border-radius: 2.5px;
  background: var(--mauth-hover);
}

.cal__legend .lg.lv-1 {
  background: color-mix(in srgb, var(--lime) 18%, var(--surface-solid));
}

.cal__legend .lg.lv-2 {
  background: color-mix(in srgb, var(--lime) 38%, var(--surface-solid));
}

.cal__legend .lg.lv-3 {
  background: color-mix(in srgb, var(--lime) 62%, var(--surface-solid));
}

.cal__legend .lg.lv-4 {
  background: color-mix(in srgb, var(--leaf-text) 88%, var(--surface-solid));
}
</style>
