<script setup lang="ts">
/**
 * 操作日志
 *
 * 概览读数 + 明细。数据源 `audit_logs`：`module=app_id`、`action=event`，
 * 方法 / 路径 / 耗时来自 `details` JSON（无则为空，不做伪造）。
 *
 * 列表列宽有限，`details` 那段 JSON 放不下 —— 所以每行都能打开详情弹窗
 * （`OperLogDetailDialog`），把载荷逐键展开。列表这一层只补一个**方法徽标**，
 * 让"读"和"写"在扫表时就能分开。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2
} from 'lucide-vue-next';
import { exportOperLogs, listOperLogs, operCalendar, operHeatmap, operLogStats } from '@/api/monitor';
import LogPurgeDialog from '@/components/business/LogPurgeDialog.vue';
import HeatGrid from '@/components/charts/HeatGrid.vue';
import CalendarHeat from '@/components/charts/CalendarHeat.vue';
import TrendChart from '@/components/charts/TrendChart.vue';
import OperLogDetailDialog from '@/components/business/OperLogDetailDialog.vue';
import { summarizeOperEvent } from '@/utils/operLogSummary';
import { hasLogFilter, pickLogFilters } from '@/utils/logFilters';
import type { LogFilters, LogStats, OperLogRow } from '@/api/types';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const rows = ref<OperLogRow[]>([]);
/** 详情弹窗当前展示的行（null = 关闭） */
const activeRow = ref<OperLogRow | null>(null);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const stats = ref<LogStats | null>(null);
/** 操作热力：星期 × 小时（排除登录类事件，见后端 OPER_ONLY_SQL） */
const heat = ref<{ cells: Array<{ dow: number; hour: number; total: number; failed: number }> } | null>(null);
/**
 * 热力窗口固定 7 天
 *
 * 🔴 **不给 7 / 30 的切换**：`operHeatmap` 走 `created_at >= NOW() - INTERVAL n DAY`，
 * 数据还没铺满 7 天时两档返回的格子完全相同 —— 按了没反应比没有按钮更糟。
 * 30 天档留给工具栏的「时间档」（它驱动读数卡与趋势曲线，那里 30 天是**真的多出点**）。
 */
const HEAT_DAYS = 7;
/**
 * 热力窗口：7 天（星期 × 小时）或一年（周 × 星期几）
 *
 * 两种窗口是两种图：前者看"星期几的几点"，后者看"哪几周在忙"。
 * 年档单独取一次 `operLogStats('1y')`，与工具栏时间档驱动的读数卡互不影响 ——
 * 热力窗口写在面板标题里，两处口径各自可见。
 */
const heatWindow = ref<'7d' | 'year'>('7d');
/**
 * 热力窗口向过去翻了几页（0 = 最新）
 *
 * 只影响热力/日历这一块，**不动读数卡**：读数卡由工具栏的时间档驱动，
 * 两者窗口不同是刻意的（"看节律"和"看总量"是两件事）。
 */
const heatOffset = ref(0);
/** 年档的日序列（{date,total,failed}，由 /calendar 单独取） */
const yearSeries = ref<Array<{ date: string; total: number; failed: number }>>([]);
const yearLoading = ref(false);
/**
 * 视图：热力格 / 趋势曲线
 *
 * 默认趋势：7×24 的格子在这个数据量下几乎全白，折线才看得出"有没有操作"。
 */
const view = ref<'heat' | 'trend'>('trend');
/** 是否收起热力面板（与登录日志页一致） */
const heatHidden = ref(false);
const toast = ref('');
const query = reactive({
  pageNum: 1,
  pageSize: 20,
  keyword: '',
  status: null as number | null,
  // 以下是筛选条件（独立维度，与列表 / 导出 / 清除共用）
  username: '',
  ip: '',
  action: '',
  startTime: '',
  endTime: ''
});

/**
 * 时间窗：**一个控件同时约束列表与统计**
 *
 * 原来工具栏里有两个时间控件 —— 一个只驱动图表（`range`）、一个是精确起止（只作用于列表），
 * 选"7 天"时表格里的记录一条没少。两个控件看起来都是"时间筛选"，行为却不同，
 * 这是这一块最容易被误读的地方。现在只留一个，选哪个两边一起变。
 */
const timeWindow = ref<'all' | '24h' | '7d' | '30d' | 'custom'>('all');

/** 统计接口只认 24h / 7d / 30d：全部与自定义按 30d 取（图上看不出更长周期） */
const statsRange = computed<'24h' | '7d' | '30d'>(() => {
  if (timeWindow.value === '24h' || timeWindow.value === '7d') return timeWindow.value;
  return '30d';
});

/** 高级筛选面板开关（账号 / IP / 操作码 / 精确时间） */
const advancedOpen = ref(false);

/** 高级面板里有几项在生效（收起时用徽标提示，避免"条件藏在里面看不见"） */
const advancedCount = computed(
  () => [query.username, query.ip, query.action, query.startTime, query.endTime].filter(v => v !== '').length
);

/** 清除弹窗用的条件快照（与列表不是同一个引用：打开弹窗后条件就固定） */
const purgeFilters = ref<LogFilters | null>(null);
const purgeMatched = ref(0);

/**
 * 当前生效的筛选条件
 *
 * 🔴 列表、导出、清除**必须**读同一份对象：清除时后端用它算命中数与范围指纹，
 *    前端另算一份就会出现"预览 3 条、实删 30 条"。
 */
const filters = computed<LogFilters>(() => pickLogFilters(query as unknown as Record<string, unknown>));
const canRemove = computed(() => auth.hasPermission('admin:log:remove'));

/** 总页数 */
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / query.pageSize)));

/**
 * 提示条
 *
 * @param message 文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/** 加载统计与列表 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [list, summary, map] = await Promise.all([
      listOperLogs({ pageNum: query.pageNum, pageSize: query.pageSize, ...filters.value }),
      operLogStats(statsRange.value),
      operHeatmap(HEAT_DAYS, heatOffset.value)
    ]);
    rows.value = list.rows;
    total.value = list.total;
    stats.value = summary;
    heat.value = map;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/**
 * 切换视图
 *
 * @param value 目标视图
 */
function switchView(value: 'heat' | 'trend'): void {
  view.value = value;
}

/**
 * 拉年档日历（按天）
 *
 * 用专门的 `/oper-logs/calendar` 而不是 `operLogStats('1y')`：后者给的是
 * 读数卡的桶名（`MM-DD`，跨年重名），日历要 `YYYY-MM-DD`，两套口径不能混用。
 */
async function loadYear(): Promise<void> {
  yearLoading.value = true;
  try {
    const result = await operCalendar(365, heatOffset.value);
    yearSeries.value = result.series;
  } catch (err) {
    notify(err instanceof Error ? err.message : '年度序列加载失败');
  } finally {
    yearLoading.value = false;
  }
}

/**
 * 切热力窗口（7 天 / 一年）
 *
 * 切窗口等于换了一种"页长"，原来的翻页偏移没有意义 —— 一律回到最新。
 *
 * @param value 目标窗口
 */
async function switchWindow(value: '7d' | 'year'): Promise<void> {
  heatWindow.value = value;
  heatOffset.value = 0;
  if (value === 'year') await loadYear();
  else await loadHeat();
}

/**
 * 热力窗口翻页
 *
 * @param delta -1 = 上一段（更早），+1 = 下一段（更近，0 为最新）
 */
async function shiftHeat(delta: number): Promise<void> {
  const next = Math.max(0, heatOffset.value - delta);
  if (next === heatOffset.value) return;
  heatOffset.value = next;
  if (heatWindow.value === 'year') await loadYear();
  else await loadHeat();
}

/**
 * 只重拉热力（不动列表与读数卡）
 */
async function loadHeat(): Promise<void> {
  try {
    heat.value = await operHeatmap(HEAT_DAYS, heatOffset.value);
  } catch (err) {
    notify(err instanceof Error ? err.message : '热力加载失败');
  }
}

/**
 * 当前热力窗口的日期范围（`M/D – M/D`）
 *
 * 翻页之后标题里的"近 7 天"就不成立了，必须显示真实区间，
 * 否则用户分不清看的是哪一段。
 *
 * @returns 形如 `11/06 – 11/12`
 */
const heatRangeLabel = computed(() => {
  const span = heatWindow.value === 'year' ? 365 : HEAT_DAYS;
  const end = new Date(Date.now() - heatOffset.value * span * 86400000);
  const start = new Date(end.getTime() - (span - 1) * 86400000);
  const md = (d: Date): string => `${d.getMonth() + 1}/${d.getDate()}`;
  // 跨年的窗口必须带年份：`11/13 – 11/12` 看着像同一年，翻到上一年时会误导
  const ymd = (d: Date): string => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  return span > 100 ? `${ymd(start)} – ${ymd(end)}` : `${md(start)} – ${md(end)}`;
});

/**
 * 收起 / 展开热力面板
 *
 * 只切可见性（`v-show`），不销毁组件 —— 收起来再展开不该重新拉一遍接口。
 */
function toggleHeat(): void {
  heatHidden.value = !heatHidden.value;
}

/* ── 趋势视图的数据：取后端已补零的稠密序列 ── */
const seriesValues = computed(() => (stats.value?.series ?? []).map(item => Number(item.total || 0)));
const seriesFailed = computed(() => (stats.value?.series ?? []).map(item => Number(item.failed || 0)));
const seriesLabels = computed(() => (stats.value?.series ?? []).map(item => item.bucket));

/** 查询（回第一页） */
function search(): void {
  query.pageNum = 1;
  load();
}

/**
 * 翻页
 *
 * @param delta 页码增量
 */
function turnPage(delta: number): void {
  const next = query.pageNum + delta;
  if (next < 1 || next > pageCount.value) return;
  query.pageNum = next;
  load();
}

/** 导出当前筛选 */
async function exportCsv(): Promise<void> {
  try {
    // 导出的必须与屏幕上是同一批：只把 keyword 传过去，导出来的文件会比列表多出一堆行
    await exportOperLogs({ ...filters.value });
  } catch (err) {
    notify(err instanceof Error ? err.message : '导出失败');
  }
}

/**
 * 切时间窗
 *
 * 选快捷档时把 `startTime` 一并算好 —— 列表、导出、清除读的都是 `filters`，
 * 只改图表不改条件就会回到"看着筛了 7 天、其实全量"的老问题。
 */
function applyTimeWindow(): void {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const fmt = (d: Date): string =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  if (timeWindow.value === 'all') {
    query.startTime = '';
    query.endTime = '';
  } else if (timeWindow.value !== 'custom') {
    const hours = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[timeWindow.value];
    query.startTime = fmt(new Date(Date.now() - hours * 3600 * 1000));
    query.endTime = fmt(new Date());
  }
  // 自定义：起止由用户填，这里不动（面板自动展开，否则条件框藏起来没人找得到）
  if (timeWindow.value === 'custom') advancedOpen.value = true;
  search();
}

/**
 * 清空**全部**筛选条件
 *
 * 一个按钮清到底：关键词、结果、时间窗、账号 / IP / 操作码、精确起止。
 * 原来的「清空筛选」漏掉关键词与结果，清完列表还是筛着的，看着像没生效。
 */
function resetFilters(): void {
  query.keyword = '';
  query.username = '';
  query.ip = '';
  query.action = '';
  query.startTime = '';
  query.endTime = '';
  query.status = null;
  timeWindow.value = 'all';
  search();
}

/**
 * 打开「删除日志」
 *
 * 没有任何条件时就是**删除全部**：后端要求至少一个条件（否则一条命令就能清空审计），
 * 所以这里显式补一个足够早的起点 —— 语义上等于全部，同时那次删除仍会带着
 * 可审计的范围落进日志，不会变成一条没有边界的操作。
 */
function openPurge(): void {
  if (hasLogFilter(filters.value)) {
    purgeFilters.value = filters.value;
    purgeMatched.value = total.value;
    return;
  }
  purgeFilters.value = { startTime: '1970-01-01 00:00:00' };
  // 无筛选时列表的 total 就是全部条数，直接用，省一次请求
  purgeMatched.value = total.value;
}

/**
 * 清除完成
 *
 * 除了刷列表，读数卡与热力也要重取 —— 删完还挂着旧的总数是最容易被当成 bug 的。
 *
 * @param removed 实际删除条数
 */
function onPurged(removed: number): void {
  purgeFilters.value = null;
  query.pageNum = 1;
  notify(`已清除 ${removed} 条操作日志`);
  load();
}

/**
 * 列表时间戳
 *
 * 去掉年份与斜杠：`toLocaleString('zh-CN')` 输出 `2026/11/11 13:12:41`，在 9 列表格里
 * 这一格独占 150px，把 IP 挤到容器外。年份对"最近 30 天"的日志没有信息量，
 * 完整时间在详情弹窗里仍有一份。
 *
 * @param iso ISO 时间串
 * @returns 形如 `11-11 13:12:41`
 */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 设备码缩写
 *
 * 表格里显示的只是"这台是哪台"的提示，完整值在 title 与详情弹窗里。
 * 结构化设备码是 `平台-时间戳-后缀` 三段，保留平台与后缀即可分辨；
 * 非标准存量值退化为首尾各留几位。
 *
 * @param code 完整设备码
 * @returns 缩写（空串表示没有记录）
 */
function shortDevice(code: string): string {
  if (!code) return '';
  const parts = code.split('-');
  if (parts.length >= 3) return `${parts[0]}-…-${parts[parts.length - 1]}`;
  return code.length > 16 ? `${code.slice(0, 6)}…${code.slice(-4)}` : code;
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">操作日志</h2>
      <span class="page__sub">共 {{ total }} 条 · 数据源 audit_logs</span>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat__label">总次数</div>
        <div class="stat__value">{{ stats?.total ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat__label">成功率</div>
        <div class="stat__value">{{ stats?.successRate ?? 100 }}<small>%</small></div>
      </div>
      <div class="stat">
        <div class="stat__label">失败</div>
        <div class="stat__value">{{ stats?.failed ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat__label">活跃账号</div>
        <div class="stat__value">{{ stats?.activeUsers ?? 0 }}</div>
      </div>
    </div>

    <section class="panel" style="margin-top: 14px">
      <header class="panel__head">
        <span class="panel__title">
          {{
            view === 'heat'
              ? heatWindow === 'year'
                ? '操作热力（周 × 星期）'
                : '操作热力（星期 × 小时）'
              : '操作与失败趋势'
          }}
          <i class="panel__sub">{{ heatWindow === 'year' ? '近一年' : `近 ${HEAT_DAYS} 天` }} · {{ heatRangeLabel }}</i>
        </span>
        <span v-if="view === 'heat'" class="view-switch heat-nav">
          <!-- 翻页：向过去逐段走，到最新一段时「下一段」禁用（未来没有数据可看） -->
          <button
            class="btn btn--sm btn--icon"
            type="button"
            title="上一段"
            aria-label="上一段"
            :disabled="loading || yearLoading"
            @click="shiftHeat(-1)"
          >
            <ChevronLeft :size="15" />
          </button>
          <button
            class="btn btn--sm btn--icon"
            type="button"
            title="下一段"
            aria-label="下一段"
            :disabled="heatOffset === 0 || loading || yearLoading"
            @click="shiftHeat(1)"
          >
            <ChevronRight :size="15" />
          </button>
          <button
            class="btn btn--sm"
            type="button"
            :class="{ 'btn--primary': heatWindow === '7d' }"
            @click="switchWindow('7d')"
          >
            7 天
          </button>
          <button
            class="btn btn--sm"
            type="button"
            :class="{ 'btn--primary': heatWindow === 'year' }"
            @click="switchWindow('year')"
          >
            一年
          </button>
          <button
            v-if="heatOffset > 0"
            class="btn btn--ghost btn--sm"
            type="button"
            title="回到最新"
            @click="shiftHeat(heatOffset)"
          >
            最新
          </button>
        </span>
        <span class="view-switch">
          <button
            class="btn btn--sm"
            type="button"
            :class="{ 'btn--primary': view === 'heat' }"
            @click="switchView('heat')"
          >
            热力
          </button>
          <button
            class="btn btn--sm"
            type="button"
            :class="{ 'btn--primary': view === 'trend' }"
            @click="switchView('trend')"
          >
            趋势
          </button>
        </span>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          :aria-expanded="!heatHidden"
          :title="heatHidden ? '显示热力图' : '隐藏热力图'"
          @click="toggleHeat"
        >
          {{ heatHidden ? '显示' : '隐藏' }}
        </button>
      </header>
      <div v-show="!heatHidden" class="panel__body">
        <HeatGrid
          v-if="view === 'heat' && heatWindow === '7d'"
          :cells="heat?.cells ?? []"
          :loading="loading"
          unit="次"
          :window-label="heatRangeLabel"
        />
        <CalendarHeat
          v-else-if="view === 'heat'"
          :days="yearSeries"
          :loading="yearLoading"
          unit="次"
          :window-label="heatRangeLabel"
        />
        <TrendChart
          v-else
          :values="seriesValues"
          :secondary="seriesFailed"
          :labels="seriesLabels"
          :height="236"
          unit=" 次"
          primary-label="操作"
          secondary-label="失败"
          :dots="false"
        />
      </div>
    </section>

    <div class="toolbar" style="margin-top: 14px">
      <input
        v-model="query.keyword"
        class="input"
        style="width: 190px"
        placeholder="操作者 / 事件 / IP / 路径"
        @keyup.enter="search"
      />
      <select v-model.number="query.status" class="select" style="width: 100px">
        <option :value="null">全部结果</option>
        <option :value="1">成功</option>
        <option :value="0">失败</option>
      </select>
      <!--
          一个时间控件同时约束列表 / 导出 / 删除与统计图。
          原来这里是两个：一个只作用于图表（选"7 天"表格里一条没少），一个是精确起止
          只作用于列表 —— 两个都叫"时间"，行为却不同。
        -->
      <select v-model="timeWindow" class="select" style="width: 116px" @change="applyTimeWindow">
        <option value="all">全部时间</option>
        <option value="24h">近 24 小时</option>
        <option value="7d">近 7 天</option>
        <option value="30d">近 30 天</option>
        <option value="custom">自定义时间</option>
      </select>
      <button class="btn btn--sm" type="button" @click="search"><Search :size="15" /> 查询</button>
      <button class="btn btn--ghost btn--sm" type="button" :disabled="loading" @click="load">
        <RefreshCw :size="15" /> 刷新
      </button>

      <!--
          精确条件（账号 / IP / 操作码 / 起止）收进「高级」：它们和关键词是同一件事的
          不同粒度，并排放两行会让工具栏看起来有一整套重复的筛选项。
          收起时用数字徽标提醒"里面还有条件在生效"，避免条件藏起来看不见。
        -->
      <button
        class="btn btn--ghost btn--sm"
        type="button"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <SlidersHorizontal :size="15" /> 高级
        <span v-if="advancedCount" class="tag tag--info">{{ advancedCount }}</span>
        <ChevronDown :size="13" class="adv-caret" :class="{ 'is-open': advancedOpen }" />
      </button>
      <button class="btn btn--ghost btn--sm" type="button" @click="resetFilters">清空</button>

      <span class="toolbar__actions">
        <button
          v-if="auth.hasPermission('admin:log:read')"
          class="btn btn--sm"
          type="button"
          title="按当前筛选条件导出 CSV（与列表同口径）"
          @click="exportCsv"
        >
          <Download :size="15" /> 导出
        </button>
        <button
          v-if="canRemove"
          class="btn btn--danger btn--sm"
          type="button"
          :disabled="total === 0"
          :title="hasLogFilter(filters) ? '按当前筛选条件删除日志' : '没有筛选条件：将删除全部日志（仍需二次验证）'"
          @click="openPurge"
        >
          <Trash2 :size="15" /> {{ hasLogFilter(filters) ? '删除日志' : '删除全部' }}
        </button>
      </span>
    </div>

    <!-- 高级筛选：默认收起 -->
    <div v-if="advancedOpen" class="toolbar toolbar--filters">
      <input
        v-model="query.username"
        class="input"
        style="width: 150px"
        placeholder="操作者账号（模糊）"
        @keyup.enter="search"
      />
      <input
        v-model="query.ip"
        class="input"
        style="width: 160px"
        placeholder="IP 前缀，如 192.168"
        @keyup.enter="search"
      />
      <input
        v-model="query.action"
        class="input"
        style="width: 150px"
        placeholder="操作码（精确）"
        title="精确匹配事件码，如 PERMISSION_CHANGE"
        @keyup.enter="search"
      />
      <span class="filter-sep"></span>
      <input
        v-model="query.startTime"
        class="input"
        style="width: 180px"
        type="datetime-local"
        :disabled="timeWindow !== 'custom'"
        :title="timeWindow === 'custom' ? '' : '请先把时间选为「自定义时间」'"
        @change="search"
      />
      <span class="filter-tilde">~</span>
      <input
        v-model="query.endTime"
        class="input"
        style="width: 180px"
        type="datetime-local"
        :disabled="timeWindow !== 'custom'"
        :title="timeWindow === 'custom' ? '' : '请先把时间选为「自定义时间」'"
        @change="search"
      />
      <span class="filter-hint">
        {{ timeWindow === 'custom' ? '精确到分钟' : '起止时间由上面的「时间」档位决定' }}
      </span>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section class="panel">
      <div class="table-wrap">
        <table class="table oper-table">
          <thead>
            <tr>
              <th>时间</th>
              <!-- 这列恒是「谁点的按钮」，不是"这条日志关于谁"。被操作对象见详情弹窗的
                   「被操作账号」一格 —— 表头写清，避免把被改的人当成操作者读 -->
              <th title="发起这次操作的人（audit_logs.user_id）">操作者</th>
              <th>模块</th>
              <th>事件</th>
              <th>路径</th>
              <th>结果</th>
              <th>来源</th>
              <th class="oper-col-act">详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="oper-row" @click="activeRow = row">
              <td class="mono">{{ when(row.created_at) }}</td>
              <!-- 悬停显示邮箱/uid：列表列宽有限，账号名重名时靠它区分 -->
              <td :title="row.email || row.uid || ''">{{ row.username || '—' }}</td>
              <td class="oper-module">{{ row.module }}</td>
              <!--
                事件列：**中文摘要为主、事件码为辅**。
                原先反过来（`DEPT_UPDATE` 在上、`deptId=5, name=…` 在下），扫表时
                满屏都是大写码，看不出到底做了什么；码对排查有用，但它是次要信息。
              -->
              <td class="oper-event">
                <span class="oper-event__summary">{{ summarizeOperEvent(row) }}</span>
                <span class="mono oper-event__code" :title="row.action">{{ row.action }}</span>
              </td>
              <!-- 方法徽标进路径列：扫表时能直接分出读/写，不额外占一列。
                   路径按 300px 截断（完整值在 title 与详情弹窗里）—— 9 列表格里
                   一条长 API 路径会把 IP 与详情按钮顶出容器 -->
              <td class="mono oper-pathcell">
                <span v-if="row.method" class="oper-method" :data-method="row.method.toUpperCase()">{{
                  row.method
                }}</span>
                <span class="oper-pathtext" :title="row.path">{{ row.path || '—' }}</span>
              </td>
              <td>
                <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">{{
                  row.status === 1 ? '成功' : '失败'
                }}</span>
              </td>
              <!-- 来源 = IP + 设备码缩写：不额外加列（表格已经 8 列），
                   完整设备码在 title 与详情弹窗里，这里只用来快速分辨"是不是同一台机器" -->
              <td class="oper-origin">
                <span class="mono">{{ row.ip || '—' }}</span>
                <span v-if="row.device_id" class="mono oper-origin__dev" :title="row.device_id">{{
                  shortDevice(row.device_id)
                }}</span>
                <span v-else class="oper-origin__dev is-empty" title="该记录未采集设备码">无设备码</span>
              </td>
              <td class="oper-col-act">
                <button
                  class="oper-open"
                  type="button"
                  :aria-label="`查看 #${row.id} 的操作详情`"
                  @click.stop="activeRow = row"
                >
                  <Eye :size="14" /> 详情
                </button>
              </td>
            </tr>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="8"><div class="empty">该条件下没有操作记录</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span class="mono">第 {{ query.pageNum }} / {{ pageCount }} 页</span>
        <button class="btn btn--sm" type="button" :disabled="query.pageNum <= 1" @click="turnPage(-1)">上一页</button>
        <button class="btn btn--sm" type="button" :disabled="query.pageNum >= pageCount" @click="turnPage(1)">
          下一页
        </button>
      </div>
    </section>

    <!-- 详情弹窗：details 载荷在这里展开，列表只负责指路 -->
    <OperLogDetailDialog :row="activeRow" @close="activeRow = null" />

    <LogPurgeDialog
      :scope="'oper'"
      :filters="purgeFilters"
      :matched="purgeMatched"
      @close="purgeFilters = null"
      @done="onPurged"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--mauth-border);
  color: var(--mauth-text-soft);
  font-size: 12px;
}

/* 整行可点：详情入口不该只有一个 14px 的按钮 */
.oper-row {
  cursor: pointer;
}

/* 方法徽标：读请求中性色，写请求用主色 —— 日志里真正要分的就是这两类 */
.oper-method {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--mauth-hover);
  color: var(--mauth-text-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  vertical-align: 1px;
}

.oper-method[data-method='POST'],
.oper-method[data-method='PUT'],
.oper-method[data-method='PATCH'],
.oper-method[data-method='DELETE'] {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

.oper-open {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--mauth-text-soft);
  font-size: 11.5px;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.oper-open:hover {
  background: var(--mauth-surface);
  color: var(--mauth-text);
}

/* 详情列右对齐并收窄：它只是一个入口，不该和其它数据列抢宽度。
   刻意**不用**全局 `.col-actions`（吸右）—— 这张表刚好比容器宽一点，
   吸右会把 IP 列压在下面；整行本来就能点开详情，不需要悬停时也钉在右侧。 */
/* 视图切换：与时间档（在工具栏里）分开表述"看什么"与"看多久" */
/* 窗口标签挂在标题上而不是新造一个全局类：它属于标题，不是独立区块 */
.panel__sub {
  margin-left: 8px;
  font-size: 11.5px;
  font-style: normal;
  font-weight: 500;
  color: var(--mauth-text-faint);
}

.view-switch {
  display: inline-flex;
  gap: 6px;
}

/* 筛选行：与主工具栏同宽分段，用一条上边框把它和"查询/刷新/导出"分开 */
.toolbar--filters {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--mauth-border);
}

/* 高级面板的展开箭头：收起朝下、展开朝上（旋转比换图标省一次重渲染） */
.adv-caret {
  transition: transform 0.16s var(--ease);
}

.adv-caret.is-open {
  transform: rotate(180deg);
}

.filter-hint {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

/* 非「自定义」时起止框锁定：它们是时间档位的产物，不是第二个时间筛选项 */
.toolbar--filters input[type='datetime-local']:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.filter-sep {
  width: 1px;
  height: 18px;
  background: var(--mauth-border);
}

.filter-tilde {
  color: var(--mauth-text-faint);
  font-size: 12px;
}

.oper-col-act {
  width: 1%;
  text-align: right;
  white-space: nowrap;
}

/* 9 列表格：单元格内边距比全局 16px 收窄到 10px，否则长路径会把
   IP 与详情按钮一起顶出容器（`.table-wrap` 虽有横向滚动，但被切一半更难看） */
.oper-table th,
.oper-table td {
  padding: 0 10px;
}

/* 事件列两行：上行事件码（等宽，便于对照后端），下行人话摘要。
   摘要允许折到两行再截断 —— 一行 340px 会把"授予了谁、从什么改成什么"正好切掉，
   而那正是这条日志唯一值钱的部分。 */
.oper-event {
  vertical-align: middle;
}

/* 摘要为主：正文色、可读字号，最多两行 */
.oper-event__summary {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  max-width: 320px;
  overflow: hidden;
  white-space: normal;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--mauth-text);
}

/* 事件码为辅：等宽小字，留给排查时对日志用 */
.oper-event__code {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  letter-spacing: 0.02em;
  color: var(--mauth-text-faint);
}

/* 模块名最多 6-8 个字符（console / posecraft），给固定宽度免得它撑走整列 */
.oper-module {
  max-width: 76px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 来源列两行：IP 在上、设备码缩写在下。
   设备码给固定宽度 + 省略号，不参与表格自动布局的宽度竞争 */
.oper-origin {
  vertical-align: middle;
}

.oper-origin > span {
  display: block;
  white-space: nowrap;
}

.oper-origin__dev {
  max-width: 116px;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.oper-origin__dev.is-empty {
  opacity: 0.7;
}

.oper-table tbody td {
  height: auto;
  padding-top: 7px;
  padding-bottom: 7px;
}

/* 路径截断：`max-width` 写在单元格上在 auto 布局里不稳，套一层行内块才可靠。
   宽度给**像素**而不是 100% - 百分比在 auto 表格里会退回内容宽度（等于没限制）。 */
.oper-pathtext {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}
</style>
