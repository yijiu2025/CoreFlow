<script setup lang="ts">
/**
 * 珍珠玻璃 · 登录日志版式
 *
 * 版式只负责"长什么样"：概览读数、7×24 热力、明细三段都由容器算好
 * （`views/monitor/LoginLog.vue`），契约见 `theme/views/login-log.ts`。
 * 这里不取数、不判权限，只把 `ctx` 画出来。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { ChevronDown, ChevronLeft, ChevronRight, Download, Eye, RefreshCw, Search, SlidersHorizontal, Trash2 } from 'lucide-vue-next';
import HeatGrid from '@/components/charts/HeatGrid.vue';
import CalendarHeat from '@/components/charts/CalendarHeat.vue';
import TrendChart from '@/components/charts/TrendChart.vue';
import LoginLogDetailDialog from '@/components/business/LoginLogDetailDialog.vue';
import LogPurgeDialog from '@/components/business/LogPurgeDialog.vue';
import { hasLogFilter } from '@/utils/logFilters';
import { describeLoginEvent, loginEventLabel } from '@/utils/loginLogSummary';
import type { LoginLogViewContext } from '@/theme/views/login-log';

const props = defineProps<{ ctx: LoginLogViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
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
  query,
  filters,
  canRead,
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
} = props.ctx;
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">登录日志</h2>
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
      <div v-if="device !== 'mobile'" class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 100px" />
            <col style="width: 76px" />
            <col style="width: 100px" />
            <col style="width: 80px" />
            <col style="width: 150px" />
            <col style="width: 56px" />
            <col style="width: 118px" />
            <col style="width: 96px" />
          </colgroup>
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
              <!-- IP 与归属地合并成一列：9 列在 800px 内容区里放不下，
                   单独一列"归属地"只能显示"本地/北京"两三个字却占 70px，
                   并把说明列压到只剩 3 个字。合并后说明列回到 118px。 -->
              <th title="来源 IP 与归属地（长 IP 会省略，完整值见行详情）">IP / 归属地</th>
              <th>结果</th>
              <th>说明</th>
              <th class="log-col-act">详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="`${row.id}-${row.created_at}`" class="log-row" @click="activeRow = row">
              <!--
                时间两行：日期在上、时分秒在下。
                时间列独占 145px 会把说明列压到看不见；两行后只要 100px，
                且日期与时间各自完整（比"2026/11/14 18:1…"这种截断好用得多）。
              -->
              <td class="mono log-time" :title="new Date(row.created_at).toLocaleString('zh-CN')">
                <span>{{ timeParts(row.created_at).date }}</span>
                <span class="log-time__hms">{{ timeParts(row.created_at).time }}</span>
              </td>
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
              <td class="mono log-net" :title="`${row.ip || '—'} ${locationText(row)}`">
                <span>{{ row.ip || '—' }}</span>
                <span v-if="locationText(row) !== '—'" class="log-net__region">{{ locationText(row) }}</span>
              </td>
              <td>
                <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'login-tag--fail'">{{
                  row.status === 1 ? '成功' : '失败'
                }}</span>
              </td>
              <td class="log-desc" :title="describeLoginEvent(row)">{{ describeLoginEvent(row) }}</td>
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
              <td colspan="8"><div class="empty">该条件下没有登录记录</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!--
        手机端：一条记录一张卡，整行可点开详情。
        标题行是"事件名 + 结果"，副标题是账号与时间，元信息放 IP 与应用 ——
        UA / 设备码 / 失败原因这些长字段只在详情弹窗里出现，列表里放不下也没必要。
      -->
      <ul v-else class="mlist">
        <li
          v-for="row in rows"
          :key="`${row.id}-${row.created_at}`"
          class="mcard is-tappable"
          role="button"
          tabindex="0"
          @click="activeRow = row"
          @keydown.enter.prevent="activeRow = row"
        >
          <div class="mcard__head">
            <div class="mcard__main">
              <span class="mcard__title">
                <span class="mcard__title-text">{{ loginEventLabel(row.event) }}</span>
              </span>
              <span class="mcard__sub">
                <span v-if="row.user_status === -1 && row.prev_username" class="log-prev">
                  <i class="log-prev__tag">注销-</i>{{ row.prev_username }}
                </span>
                <template v-else>{{ row.username || '—' }}</template>
                · {{ timeParts(row.created_at).date }} {{ timeParts(row.created_at).time }}
              </span>
              <span class="mcard__meta">
                <span class="mono">{{ row.ip || '无 IP' }}</span>
                <span v-if="locationText(row) !== '—'">{{ locationText(row) }}</span>
                <span>{{ row.app_id || '—' }}</span>
              </span>
            </div>
            <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'login-tag--fail'">
              {{ row.status === 1 ? '成功' : '失败' }}
            </span>
          </div>
        </li>
        <li v-if="loading" class="mlist__hint">加载中…</li>
        <li v-else-if="rows.length === 0" class="mlist__hint">该条件下没有登录记录</li>
      </ul>

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

  </div>
</template>

<style scoped>
/* 失败：固定用危险色。`tag--off` 在部分主题里是"停用/中性"灰，
   拿它渲染登录失败会让红绿对比消失，扫表时看不出哪几条是异常。 */
.login-tag--fail {
  background: var(--mauth-danger-soft, color-mix(in srgb, var(--mauth-danger) 14%, transparent));
  color: var(--mauth-danger);
}

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

/*
 * 说明：**单行省略**，不换行。
 *
 * 这类文本动辄几十字，一旦换行整张表的行高会在 40–90px 之间跳（相邻行忽高忽低，
 * 扫读时找不到对齐线）；而且 `white-space: normal` 还会盖掉全局 `.table td` 的
 * nowrap，让定宽布局下的列被人为撑开 —— 文字就"挤"到右侧详情列上了。
 * 全文由模板上的 `:title` 提供（悬停可看）。
 */
/* IP 与归属地同格：归属地用弱化小字跟在 IP 后面，扫读时先看 IP、需要时再看地区 */
.log-net__region {
  margin-left: 8px;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

/*
 * 时间两行：日期 / 时分秒 —— 单行要 145px，两行只要 100px
 *
 * 🔴 不要在 `<td>` 上写 `display: flex`：一旦单元格不再是 `table-cell`，
 *    外层会套一个匿名单元格把样式打断 —— `vertical-align` 失效（时间贴顶）、
 *    行高与相邻格对不上（分割线错位）。两行用内部 span 各自成块实现，
 *    td 本身保持 table-cell，竖直居中交给 `.log-row td`。
 */
.log-time {
  line-height: 1.2;
  font-size: 11.5px;
}

.log-time > span {
  display: block;
}

/* td 的默认竖直对齐随浏览器 UA 样式而异，这里显式钉住；行高仍用全局 44px */
.log-row td {
  vertical-align: middle;
}

.log-time__hms {
  color: var(--mauth-text-soft);
}

.log-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
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
