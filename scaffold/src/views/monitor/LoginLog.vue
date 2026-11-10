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
import { Download, RefreshCw, Search } from 'lucide-vue-next';
import { exportLoginLogs, listLoginLogs, loginHeatmap, loginLogStats } from '@/api/monitor';
import type { LogStats, LoginLogRow } from '@/api/types';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const rows = ref<LoginLogRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const stats = ref<LogStats | null>(null);
const heat = ref<{ cells: Array<{ dow: number; hour: number; total: number; failed: number }>; threshold: number } | null>(null);
const days = ref<7 | 30>(7);
const toast = ref('');
const query = reactive({ pageNum: 1, pageSize: 20, keyword: '', event: '' });

const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 总页数 */
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / query.pageSize)));

/** 热力格：dow × hour → 该格的次数与失败数 */
const grid = computed(() => {
  const map = new Map<string, { total: number; failed: number }>();
  for (const cell of heat.value?.cells || []) {
    map.set(`${cell.dow}-${cell.hour}`, { total: cell.total, failed: cell.failed });
  }
  return WEEK.map((label, dow) => ({
    label,
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, ...(map.get(`${dow}-${hour}`) || { total: 0, failed: 0 }) }))
  }));
});

/** 单格颜色深度：按当日最大值归一 */
const maxCell = computed(() => Math.max(1, ...(heat.value?.cells || []).map(c => c.total)));

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
 * 事件中文名（日志里存的是英文事件码，运维看的是"发生了什么"）
 *
 * @param event 事件码
 * @returns 中文名
 */
function eventLabel(event: string): string {
  const map: Record<string, string> = {
    LOGIN: '登录',
    LOGIN_SUCCESS: '登录成功',
    LOGIN_FAILED: '登录失败',
    LOGOUT: '退出登录',
    KICK: '会话被踢出'
  };
  return map[event] || event;
}

/**
 * 一句话说明这条日志意味着什么
 *
 * 重点是 **KICK**：它每次登录后都会紧跟着出现一条，看着像异常，其实是
 * 「单设备单登录」把上一次的旧会话顶掉 —— 新登录踢旧的，属正常行为。
 *
 * @param row 日志行
 * @returns 说明文案
 */
function describe(row: { event: string; details?: Record<string, unknown> }): string {
  const reason = String(row.details?.reason || '');
  if (row.event === 'LOGIN' || row.event === 'LOGIN_SUCCESS') return '登录成功，已创建新会话';
  if (row.event === 'LOGOUT') return '主动退出，会话已注销';
  if (row.event === 'KICK') {
    const reasons: Record<string, string> = {
      single_device_login: '同应用同设备类型的新登录，把上一次的旧会话顶下线（单设备单登录）',
      kick_by_device_id: '管理员按设备远程下线',
      user_kicked: '管理员主动下线该会话',
      kick_all: '该用户全部会话被清空（改密 / 注销 / 管理员操作）'
    };
    return reasons[reason] || `会话被踢出（${reason || '原因未记录'}）`;
  }
  return '—';
}

/** 加载全部数据 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [list, summary, map] = await Promise.all([
      listLoginLogs({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        keyword: query.keyword || undefined,
        event: query.event || undefined
      }),
      loginLogStats('7d'),
      loginHeatmap(days.value)
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

/** 切换热力回溯天数 */
async function switchDays(value: 7 | 30): Promise<void> {
  days.value = value;
  try {
    heat.value = await loginHeatmap(value);
  } catch (err) {
    notify(err instanceof Error ? err.message : '热力加载失败');
  }
}

/** 导出 */
async function exportCsv(): Promise<void> {
  try {
    await exportLoginLogs({ keyword: query.keyword || undefined, event: query.event || undefined });
  } catch (err) {
    notify(err instanceof Error ? err.message : '导出失败');
  }
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
        <div class="stat__label">登录账号</div>
        <div class="stat__value">{{ stats?.users ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat__label">来源 IP</div>
        <div class="stat__value">{{ stats?.ips ?? 0 }}</div>
      </div>
    </div>

    <section class="panel" style="margin-top: 14px">
      <header class="panel__head">
        <span class="panel__title">登录热力（星期 × 小时）</span>
        <span class="toolbar__spacer"></span>
        <button class="btn btn--sm" type="button" :class="{ 'btn--primary': days === 7 }" @click="switchDays(7)">近 7 天</button>
        <button class="btn btn--sm" type="button" :class="{ 'btn--primary': days === 30 }" @click="switchDays(30)">近 30 天</button>
      </header>
      <div class="panel__body">
        <div class="heat">
          <div v-for="row in grid" :key="row.label" class="heat__row">
            <span class="heat__label">{{ row.label }}</span>
            <span
              v-for="cell in row.hours"
              :key="cell.hour"
              class="heat__cell"
              :title="`${row.label} ${cell.hour}:00 · ${cell.total} 次（失败 ${cell.failed}）`"
              :style="{ opacity: 0.12 + (cell.total / maxCell) * 0.88 }"
            ></span>
          </div>
        </div>
        <p class="field__label" style="margin-top: 8px">颜色越深表示该时段登录越集中；悬停可看具体次数。</p>
      </div>
    </section>

    <div class="toolbar" style="margin-top: 14px">
      <input v-model="query.keyword" class="input" style="width: 220px" placeholder="账号 / IP / 归属地" @keyup.enter="search" />
      <select v-model="query.event" class="select" style="width: 160px" @change="search">
        <option value="">全部事件</option>
        <option value="LOGIN">LOGIN</option>
        <option value="LOGIN_FAILED">LOGIN_FAILED</option>
        <option value="LOGOUT">LOGOUT</option>
      </select>
      <button class="btn btn--sm" type="button" @click="search"><Search :size="15" /> 查询</button>
      <button class="btn btn--ghost btn--sm" type="button" :disabled="loading" @click="load"><RefreshCw :size="15" /> 刷新</button>
      <span class="toolbar__spacer"></span>
      <button v-if="auth.hasPermission('admin:log:read')" class="btn btn--sm" type="button" @click="exportCsv">
        <Download :size="15" /> 导出
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>账号</th>
              <th>事件</th>
              <th>应用</th>
              <th>IP</th>
              <th>归属地</th>
              <th>结果</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="`${row.id}-${row.created_at}`">
              <td class="mono">{{ new Date(row.created_at).toLocaleString('zh-CN') }}</td>
              <td>{{ row.username || '—' }}</td>
              <td>
                {{ eventLabel(row.event) }}
                <span class="mono log-code">{{ row.event }}</span>
              </td>
              <td>{{ row.app_id || '—' }}</td>
              <td class="mono">{{ row.ip || '—' }}</td>
              <td>{{ row.location || '—' }}</td>
              <td>
                <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">{{ row.status === 1 ? '成功' : '失败' }}</span>
              </td>
              <td class="log-desc">{{ describe(row) }}</td>
            </tr>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="8"><div class="empty">该条件下没有登录记录</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span class="mono">第 {{ query.pageNum }} / {{ pageCount }} 页</span>
        <button class="btn btn--sm" type="button" :disabled="query.pageNum <= 1" @click="turnPage(-1)">上一页</button>
        <button class="btn btn--sm" type="button" :disabled="query.pageNum >= pageCount" @click="turnPage(1)">下一页</button>
      </div>
    </section>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.log-code {
  margin-left: 6px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.log-desc {
  max-width: 340px;
  white-space: normal;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
  line-height: 1.5;
}

.heat {
  display: grid;
  gap: 3px;
  overflow-x: auto;
}

.heat__row {
  display: grid;
  grid-template-columns: 34px repeat(24, minmax(12px, 1fr));
  gap: 3px;
  align-items: center;
}

.heat__label {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.heat__cell {
  height: 14px;
  border-radius: 3px;
  background: var(--mauth-primary);
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
