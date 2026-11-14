<script setup lang="ts">
/**
 * 登录日志
 *
 * 概览读数 + 7×24 热力 + 明细。数据源 `session_logs`（与 oauth21 登录同源，
 * 不另建表）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { exportLoginLogs, listLoginLogs, loginCalendar, loginHeatmap, loginLogStats } from '@/api/monitor';
import { hasLogFilter, pickLogFilters } from '@/utils/logFilters';
import type { LogFilters, LogStats, LoginLogRow } from '@/api/types';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useAuthStore } from '@/stores/auth';
import { ThemeView } from 'skinsuite/vue';
import type { LoginLogViewContext, LoginLogQuery } from '@/theme/views/login-log';

const auth = useAuthStore();

/**
 * 当前渲染设备
 *
 * 登录日志 9 列，手机上横滚时"详情"在最后一列 —— 够不到。手机上换成一行一条：
 * 事件名 + 账号 + 时间/IP，整行可点开详情（完整 UA、设备码、失败原因都在弹窗里）。
 */
const device = useRenderDevice();

const rows = ref<LoginLogRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const stats = ref<LogStats | null>(null);
const heat = ref<{
  cells: Array<{ dow: number; hour: number; total: number; failed: number }>;
  threshold: number;
} | null>(null);
/**
 * 热力窗口固定 7 天
 *
 * 🔴 这里**刻意没有 7 天 / 30 天 的切换**。`loginHeatmap` 走的是
 * `created_at >= NOW() - INTERVAL n DAY`，在数据还没积累到 7 天以上时，
 * 7 与 30 返回的格子**完全相同** —— 按了没反应，比没有按钮更糟。
 * 等真实数据铺满 30 天再把这档加回来，一行的事。
 */
const HEAT_DAYS = 7;
/**
 * 热力窗口：7 天（星期 × 小时）或一年（周 × 星期几）
 *
 * 两个窗口是**两种图**，不是同一张图换个范围：前者看"星期几的几点"，后者看
 * "哪几周在忙"。年档单独取一次 `stats`（365 个日桶，带 ISO 日期），
 * 与上面读数卡的 7 天口径互不影响。
 */
const heatWindow = ref<'7d' | 'year'>('7d');
/** 热力窗口向过去翻了几页（0 = 最新）；只影响热力，不动上方读数卡 */
const heatOffset = ref(0);
/** 年档的日序列（只在切到「年」时拉一次） */
/** 年档的日序列（{date,total,failed}，由 /calendar 单独取） */
const yearSeries = ref<Array<{ date: string; total: number; failed: number }>>([]);
const yearLoading = ref(false);
/**
 * 视图：热力格 / 趋势曲线
 *
 * 默认趋势：7×24 的格子在这个数据量下绝大多数是空白，折线才看得出"有没有登录"。
 */
const view = ref<'heat' | 'trend'>('trend');
/** 是否收起热力面板（两个监控页都有，给不想占屏的人一个开关） */
const heatHidden = ref(false);
const toast = ref('');
const query = reactive({
  pageNum: 1,
  pageSize: 20,
  keyword: '',
  event: '',
  // 以下是筛选条件（独立维度，与列表 / 导出 / 清除共用）
  username: '',
  ip: '',
  startTime: '',
  endTime: ''
});

/**
 * 当前生效的筛选条件
 *
 * 🔴 列表、导出、清除必须读同一份：清除时后端用它算命中数与二次验证的范围指纹。
 */
const filters = computed<LogFilters>(() => pickLogFilters(query as unknown as Record<string, unknown>));
const canRemove = computed(() => auth.hasPermission('admin:log:remove'));
/** 高级筛选面板开关（账号 / IP / 精确时间） */
const advancedOpen = ref(false);

/** 高级面板里有几项在生效（收起时用徽标提示） */
const advancedCount = computed(
  () => [query.username, query.ip, query.startTime, query.endTime].filter(v => v !== '').length
);

/** 清除弹窗用的条件快照（与列表不是同一个引用：打开后就固定） */
const purgeFilters = ref<LogFilters | null>(null);
const purgeMatched = ref(0);

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

/**
 * 事件与说明的翻译都移到 `utils/loginLogSummary.ts`
 *
 * 列表和详情弹窗必须说**同一句话** —— 各写一份的下场是列表说"会话被踢出"、
 * 弹窗说"旧会话被顶下线"，同一个 reason 两种措辞，看的人会以为不是一回事。
 */
const activeRow = ref<LoginLogRow | null>(null);

/**
 * 归属地的展示值
 *
 * 本机发起的请求（127.0.0.1 / ::1）没有地理归属，显示「本地」比「—」有用得多 ——
 * 管理员在自己机器上操作时，一列「—」会让人以为是数据缺失。其余情况没解析就留「—」。
 *
 * @param row 登录日志行
 * @returns 展示文本
 */
function locationText(row: LoginLogRow): string {
  if (row.location) return row.location;
  const ip = String(row.ip || '').trim();
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return '本地';
  return '—';
}

/**
 * 把时间拆成「日期」「时分秒」两段
 *
 * 表格里一行放两段（上下排）：定宽布局下列宽是硬约束，单行完整时间要 145px，
 * 会挤掉说明列；拆开后 100px 就能同时保住日期与秒级精度。
 *
 * @param value ISO 时间串
 * @returns 日期与时间两段文本
 */
function timeParts(value: string): { date: string; time: string } {
  const d = new Date(value);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  };
}

/** 加载全部数据 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [list, summary, map] = await Promise.all([
      listLoginLogs({ pageNum: query.pageNum, pageSize: query.pageSize, ...filters.value }),
      loginLogStats('7d'),
      loginHeatmap(HEAT_DAYS, heatOffset.value)
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

/** 查询 */
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

/**
 * 切换视图
 *
 * @param value 目标视图
 */
function switchView(value: 'heat' | 'trend'): void {
  view.value = value;
}

/**
 * 切热力窗口
 *
 * 年档才去拉 365 天序列，且**只拉一次**（切回 7 天不清缓存）—— 这是一年粒度的
 * 聚合，短时间内不会变；每次点都重算等于让用户在两张图之间等两次请求。
 *
 * @param value 目标窗口
 */
async function loadYear(): Promise<void> {
  yearLoading.value = true;
  try {
    // 日历要完整日期（`YYYY-MM-DD`），不能用 stats 的 `MM-DD` 桶名
    const result = await loginCalendar(365, heatOffset.value);
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
 * 换窗口等于换页长，旧的翻页偏移没有意义 —— 回到最新。
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
 * @param delta -1 = 上一段（更早），+1 = 下一段（更近）
 */
async function shiftHeat(delta: number): Promise<void> {
  const next = Math.max(0, heatOffset.value - delta);
  if (next === heatOffset.value) return;
  heatOffset.value = next;
  if (heatWindow.value === 'year') await loadYear();
  else await loadHeat();
}

/** 只重拉热力（不动列表与读数卡） */
async function loadHeat(): Promise<void> {
  try {
    heat.value = await loginHeatmap(HEAT_DAYS, heatOffset.value);
  } catch (err) {
    notify(err instanceof Error ? err.message : '热力加载失败');
  }
}

/**
 * 当前热力窗口的日期范围（`M/D – M/D`）
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

/* ── 趋势视图的数据：直接取后端已补零的稠密序列 ── */
const seriesValues = computed(() => (stats.value?.series ?? []).map(item => Number(item.total || 0)));
const seriesFailed = computed(() => (stats.value?.series ?? []).map(item => Number(item.failed || 0)));
const seriesLabels = computed(() => (stats.value?.series ?? []).map(item => item.bucket));

/** 导出 */
async function exportCsv(): Promise<void> {
  try {
    // 带上全部筛选条件：否则导出的文件比屏幕上的多出一堆行
    await exportLoginLogs({ ...filters.value });
  } catch (err) {
    notify(err instanceof Error ? err.message : '导出失败');
  }
}

/**
 * 打开「删除日志」
 *
 * 无条件时即**删除全部**：后端要求至少一个条件，所以补一个足够早的起点 ——
 * 语义等同全部，同时那次删除仍带着可审计的范围。
 */
function openPurge(): void {
  if (hasLogFilter(filters.value)) {
    purgeFilters.value = filters.value;
    purgeMatched.value = total.value;
    return;
  }
  purgeFilters.value = { startTime: '1970-01-01 00:00:00' };
  purgeMatched.value = total.value;
}

/** 清空全部筛选条件（关键词、事件、账号、IP、起止一起清） */
function resetFilters(): void {
  query.keyword = '';
  query.event = '';
  query.username = '';
  query.ip = '';
  query.startTime = '';
  query.endTime = '';
  search();
}

/**
 * 清除完成
 *
 * 列表与热力一起重取：删完还挂着旧总数/旧色块，最容易被当成"没生效"。
 *
 * @param removed 实际删除条数
 */
function onPurged(removed: number): void {
  purgeFilters.value = null;
  query.pageNum = 1;
  notify(`已清除 ${removed} 条登录日志`);
  load();
}

onMounted(load);

/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: LoginLogViewContext = {
  device,
  rows,
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
  filters,
  canRead: auth.hasPermission('admin:log:read'),
  canRemove,
  advancedOpen,
  advancedCount,
  purgeFilters,
  purgeMatched,
  pageCount,
  activeRow,
  heatRangeLabel,
  seriesValues,
  seriesFailed,
  seriesLabels,
  locationText,
  timeParts,
  load,
  search,
  turnPage,
  switchView,
  switchWindow,
  shiftHeat,
  toggleHeat,
  exportCsv,
  openPurge,
  resetFilters,
  onPurged
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/login-log/`），容器只准备 ctx -->
  <ThemeView page="login-log" :device="device" :ctx="ctx" />
</template>
