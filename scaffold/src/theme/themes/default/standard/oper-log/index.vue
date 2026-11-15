<script setup lang="ts">
/**
 * 珍珠玻璃 · 操作日志版式
 *
 * 版式只负责"长什么样"：概览读数、7×24 热力、明细都由容器算好
 * （`views/monitor/OperLog.vue`），契约见 `theme/views/oper-log.ts`。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { ChevronDown, ChevronLeft, ChevronRight, Download, Eye, RefreshCw, Search, SlidersHorizontal, Trash2 } from 'lucide-vue-next';
import LogPurgeDialog from '@/components/business/LogPurgeDialog.vue';
import HeatGrid from '@/components/charts/HeatGrid.vue';
import CalendarHeat from '@/components/charts/CalendarHeat.vue';
import TrendChart from '@/components/charts/TrendChart.vue';
import OperLogDetailDialog from '@/components/business/OperLogDetailDialog.vue';
import { hasLogFilter } from '@/utils/logFilters';
import { summarizeOperEvent } from '@/utils/operLogSummary';
import type { OperLogViewContext } from '@/theme/views/oper-log';

const props = defineProps<{ ctx: OperLogViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
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
  query,
  timeWindow,
  advancedOpen,
  advancedCount,
  purgeFilters,
  purgeMatched,
  filters,
  canRead,
  canRemove,
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
} = props.ctx;
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">操作日志</h2>
      <span class="page__sub">共 {{ total }} 条</span>
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
        placeholder="操作者 / 事件 / IP / 路径 / 设备码"
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
        <!-- 刷新放在动作组首位：它是"重查一遍"，与导出/删除同属动作，不跟筛选项混排 -->
        <button class="btn btn--sm" type="button" :disabled="loading" @click="load">
          <RefreshCw :size="15" /> 刷新
        </button>
        <button
          v-if="canRead"
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
        v-model="query.deviceId"
        class="input"
        style="width: 200px"
        placeholder="设备码（含片段即可）"
        title="按设备码子串匹配，如 WEB-DaBOS 或整串；用于把同一台设备上的操作串起来"
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
      <div v-if="device !== 'mobile'" class="table-wrap">
        <table class="table oper-table">
          <colgroup>
            <col style="width: 90px" />
            <col style="width: 68px" />
            <col style="width: 76px" />
            <col style="width: 120px" />
            <col style="width: 160px" />
            <!-- 结果列 62：`tag` 高 22、左右各 8px 内边距，「成功」两字共 40px，
                 52px 减去单元格左右 10px 只剩 32 ⇒ 标签被截成「成」 -->
            <col style="width: 62px" />
            <col style="width: 124px" />
            <col style="width: 84px" />
          </colgroup>
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
              <!-- 时间两行（日期 / 时分秒）：单行 14 个字符要 141px，会挤掉路径列 -->
              <td class="mono oper-time" :title="`${timeParts(row.created_at).date} ${timeParts(row.created_at).time}`">
                <span>{{ timeParts(row.created_at).date }}</span>
                <span class="oper-time__hms">{{ timeParts(row.created_at).time }}</span>
              </td>
              <!-- 悬停显示邮箱/uid：列表列宽有限，账号名重名时靠它区分 -->
              <td :title="row.email || row.uid || ''">{{ row.username || '—' }}</td>
              <td class="oper-module" :title="row.module">{{ row.module }}</td>
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

      <!--
        手机端：一条记录一张卡，整行可点开详情。
        摘要（中文动词）比事件码重要，所以它占标题行；时间与操作者压进副标题；
        「结果」用小胶囊贴在标题右端 —— 扫一眼先看成功/失败。
      -->
      <ul v-else class="mlist">
        <li
          v-for="row in rows"
          :key="row.id"
          class="mcard is-tappable"
          role="button"
          tabindex="0"
          @click="activeRow = row"
          @keydown.enter.prevent="activeRow = row"
        >
          <div class="mcard__head">
            <div class="mcard__main">
              <span class="mcard__title">
                <span class="mcard__title-text">{{ summarizeOperEvent(row) }}</span>
              </span>
              <span class="mcard__sub mono">
                {{ timeParts(row.created_at).date }} {{ timeParts(row.created_at).time }}
                · {{ row.username || '—' }}
                <template v-if="row.module"> · {{ row.module }}</template>
              </span>
              <span class="mcard__meta">
                <span class="mono">{{ row.ip || '无 IP' }}</span>
                <span v-if="row.device_id" class="mono">{{ shortDevice(row.device_id) }}</span>
                <span class="mono">{{ row.action }}</span>
              </span>
            </div>
            <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">
              {{ row.status === 1 ? '成功' : '失败' }}
            </span>
          </div>
        </li>
        <li v-if="loading" class="mlist__hint">加载中…</li>
        <li v-else-if="rows.length === 0" class="mlist__hint">该条件下没有操作记录</li>
      </ul>

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
  text-align: left;
  white-space: nowrap;
}

/* 时间两行：日期 / 时分秒（单行要 141px，两行 90px 就够） */
.oper-time {
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.2;
  font-size: 11.5px;
}

.oper-time__hms {
  color: var(--mauth-text-soft);
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
