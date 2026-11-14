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
import { exportLoginLogs, listLoginLogs, loginCalendar, loginHeatmap, loginLogStats } from '@/api/monitor';
import HeatGrid from '@/components/charts/HeatGrid.vue';
import CalendarHeat from '@/components/charts/CalendarHeat.vue';
import TrendChart from '@/components/charts/TrendChart.vue';
import LoginLogDetailDialog from '@/components/business/LoginLogDetailDialog.vue';
import LogPurgeDialog from '@/components/business/LogPurgeDialog.vue';
import { hasLogFilter, pickLogFilters } from '@/utils/logFilters';
import { describeLoginEvent, loginEventLabel } from '@/utils/loginLogSummary';
import type { LogFilters, LogStats, LoginLogRow } from '@/api/types';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

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
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">登录日志</h2>
      <span class="page__sub">共 {{ total }} 条 · 数据源 session_logs</span>
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
        <div class="stat__label">账号数</div>
        <div class="stat__value">{{ stats?.users ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat__label">来源 IP</div>
        <div class="stat__value">{{ stats?.ips ?? 0 }}</div>
      </div>
    </div>

    <section class="panel" style="margin-top: 14px">
      <header class="panel__head">
        <span class="panel__title">
          {{
            view === 'heat'
              ? heatWindow === 'year'
                ? '登录热力（周 × 星期）'
                : '登录热力（星期 × 小时）'
              : '登录与失败趋势'
          }}
          <i class="panel__sub">{{ heatWindow === 'year' ? '近一年' : `近 ${HEAT_DAYS} 天` }} · {{ heatRangeLabel }}</i>
        </span>
        <span v-if="view === 'heat'" class="view-switch heat-nav">
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
          primary-label="登录"
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
        placeholder="账号 / IP / 归属地"
        @keyup.enter="search"
      />
      <!-- 选项 = `models/session/SessionLog.js` 里 event 字段注释列出的全集。
             以前只写了 LOGIN / LOGIN_FAILED / LOGOUT，而库里最多的是 KICK（41/96），
             等于把最常见的一类事件从筛选里漏掉了 —— 用户在列表里看到 KICK，
             却找不到能筛它的选项。 -->
      <select v-model="query.event" class="select" style="width: 132px" @change="search">
        <option value="">全部事件</option>
        <option value="LOGIN">登录</option>
        <option value="LOGIN_FAILED">登录失败</option>
        <option value="LOGOUT">退出登录</option>
        <option value="KICK">会话下线</option>
        <option value="SESSION_REFRESH">会话续期</option>
        <option value="FORBIDDEN">访问被拒</option>
      </select>
      <button class="btn btn--sm" type="button" @click="search"><Search :size="15" /> 查询</button>
      <button class="btn btn--ghost btn--sm" type="button" :disabled="loading" @click="load">
        <RefreshCw :size="15" /> 刷新
      </button>

      <!--
          精确条件（账号 / IP / 起止）收进「高级」：它们与关键词是同一件事的不同粒度，
          平铺成第二行会让整块看起来是重复的两套筛选。
          收起时用徽标提示"里面还有条件在生效"。
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
        style="width: 180px"
        placeholder="账号（含注销前用户名）"
        @keyup.enter="search"
      />
      <input
        v-model="query.ip"
        class="input"
        style="width: 160px"
        placeholder="IP 前缀，如 192.168"
        @keyup.enter="search"
      />
      <span class="filter-sep"></span>
      <input v-model="query.startTime" class="input" style="width: 180px" type="datetime-local" @change="search" />
      <span class="filter-tilde">~</span>
      <input v-model="query.endTime" class="input" style="width: 180px" type="datetime-local" @change="search" />
      <span class="filter-hint">精确到分钟，留空表示不限</span>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>时间</th>
              <!-- 登录日志只有当事人一方：这列就是"谁在登录"，不是"谁被操作"。
                   操作日志里才存在"操作者 / 被操作账号"两个角色（见那边的详情弹窗） -->
              <th
                title="本条记录所属的账号（当事人）。管理员发起的事件（如踢下线）里，操作者不是这个人，操作者见「说明」与详情的「操作者」一行"
              >
                账号
              </th>
              <th>事件</th>
              <th>应用</th>
              <th>IP</th>
              <th>归属地</th>
              <th>结果</th>
              <th>说明</th>
              <th class="log-col-act"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="`${row.id}-${row.created_at}`" class="log-row" @click="activeRow = row">
              <td class="mono">{{ new Date(row.created_at).toLocaleString('zh-CN') }}</td>
              <!-- 已注销账号：显示「注销-注销前用户名」。注销执行时 username 被换成
                   「已注销用户#N」（PII 擦除），只剩占位名根本看不出是谁；
                   快照功能上线前注销的拿不到原名，如实保留占位名并给悬停说明。 -->
              <td>
                <span v-if="row.user_status === -1 && row.prev_username" class="log-prev">
                  <i class="log-prev__tag">注销-</i>{{ row.prev_username }}
                </span>
                <span
                  v-else-if="row.user_status === -1"
                  class="log-gone"
                  :title="`该账号已注销，注销前的用户名未留存（user_id=${row.user_id}）`"
                >
                  {{ row.username || '—' }}
                </span>
                <template v-else>{{ row.username || '—' }}</template>
              </td>
              <td>
                {{ loginEventLabel(row.event) }}
                <span class="mono log-code">{{ row.event }}</span>
              </td>
              <td>{{ row.app_id || '—' }}</td>
              <td class="mono">{{ row.ip || '—' }}</td>
              <td>{{ locationText(row) }}</td>
              <td>
                <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">{{
                  row.status === 1 ? '成功' : '失败'
                }}</span>
              </td>
              <td class="log-desc">{{ describeLoginEvent(row) }}</td>
              <td class="log-col-act">
                <button
                  class="log-open"
                  type="button"
                  :aria-label="`查看 #${row.id} 的登录详情`"
                  @click.stop="activeRow = row"
                >
                  <Eye :size="14" /> 详情
                </button>
              </td>
            </tr>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="9"><div class="empty">该条件下没有登录记录</div></td>
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

    <LoginLogDetailDialog :row="activeRow" @close="activeRow = null" />

    <LogPurgeDialog
      :scope="'login'"
      :filters="purgeFilters"
      :matched="purgeMatched"
      @close="purgeFilters = null"
      @done="onPurged"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.log-code {
  margin-left: 6px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* 已注销账号：前缀用淡色、名字保持正文色 —— 要读的是名字，不是这两个字 */
.log-prev__tag {
  margin-right: 1px;
  font-style: normal;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* 拿不到原名时降低视觉权重：它是占位名，不是一个真账号 */
.log-gone {
  color: var(--mauth-text-faint);
}

.log-desc {
  max-width: 300px;
  white-space: normal;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
  line-height: 1.5;
}

/* 整行可点：悬停给反馈，否则用户不会知道这行能打开 */
.log-row {
  cursor: pointer;
  transition: background 0.14s var(--ease);
}

.log-row:hover {
  background: var(--mauth-hover);
}

/* 详情列：只占一个按钮的宽度，右对齐、不换行。
   刻意**不用**全局 `.col-actions`（吸右）—— 表刚好比容器宽一点点时，
   吸右列会把「说明」压在下面，看起来像说明被截断。 */
/* 筛选行：与主工具栏分段，用虚线把"查询/导出/清除"和"条件"分开 */
.toolbar--filters {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--mauth-border);
}

/* 高级面板展开箭头 */
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

.filter-sep {
  width: 1px;
  height: 18px;
  background: var(--mauth-border);
}

.filter-tilde {
  color: var(--mauth-text-faint);
  font-size: 12px;
}

.log-col-act {
  width: 1%;
  text-align: right;
  white-space: nowrap;
}

.log-open {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-faint);
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease),
    border-color 0.16s var(--ease);
}

.log-open:hover,
.log-row:hover .log-open {
  border-color: var(--mauth-border-strong);
  background: var(--mauth-surface);
  color: var(--mauth-text);
}

/* 视图切换：和窗口按钮并排，但用一段内间距把"看什么"和"看多久"分开 */
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
  padding-right: 10px;
  margin-right: 2px;
  border-right: 1px solid var(--mauth-border);
}

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
</style>
