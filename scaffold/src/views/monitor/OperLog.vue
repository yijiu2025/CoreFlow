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
import { exportOperLogs, listOperLogs, operCalendar, operHeatmap, operLogStats } from '@/api/monitor';
import { hasLogFilter, pickLogFilters } from '@/utils/logFilters';
import type { LogFilters, LogStats, OperLogRow } from '@/api/types';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useAuthStore } from '@/stores/auth';
import { ThemeView } from 'skinsuite/vue';
import type { OperLogViewContext } from '@/theme/views/oper-log';

const auth = useAuthStore();

/**
 * 当前渲染设备
 *
 * 日志表 8 列（时间 / 操作者 / 模块 / 事件 / 路径 / 结果 / 来源 / 详情），
 * 手机上横滚是免不了的 —— 但"详情"在最右，等于这条记录的完整信息够不到。
 * 手机上换成一行一条：事件摘要 + 时间 + 操作者/IP，整行可点开详情。
 */
const device = useRenderDevice();

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
  deviceId: '',
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
  () =>
    [query.username, query.ip, query.deviceId, query.action, query.startTime, query.endTime].filter(v => v !== '')
      .length
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
function timeParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    date: `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  };
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

/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: OperLogViewContext = {
  device,
  rows,
  activeRow,
  total,
  loading,
  errorMessage,
  stats,
  heat,
  HEAT_DAYS,
  heatWindow,
  heatOffset,
  yearSeries,
  yearLoading,
  view,
  heatHidden,
  toast,
  query,
  timeWindow,
  advancedOpen,
  advancedCount,
  purgeFilters,
  purgeMatched,
  filters,
  canRemove,
  canRead: auth.hasPermission('admin:log:read'),
  pageCount,
  heatRangeLabel,
  seriesValues,
  seriesFailed,
  seriesLabels,
  shortDevice,
  timeParts,
  load,
  switchView,
  switchWindow,
  shiftHeat,
  toggleHeat,
  search,
  turnPage,
  exportCsv,
  applyTimeWindow,
  resetFilters,
  openPurge,
  onPurged
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/oper-log/`），容器只准备 ctx -->
  <ThemeView page="oper-log" :device="device" :ctx="ctx" scope="inherit" />
</template>
