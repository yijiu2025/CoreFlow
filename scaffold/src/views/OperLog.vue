<script setup lang="ts">
/**
 * 操作日志
 *
 * 概览读数 + 明细。数据源 `audit_logs`：`module=app_id`、`action=event`，
 * 方法 / 路径 / 耗时来自 `details` JSON（无则为空，不做伪造）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { Download, RefreshCw, Search } from 'lucide-vue-next';
import { exportOperLogs, listOperLogs, operLogStats } from '@/api/monitor';
import type { LogStats, OperLogRow } from '@/api/types';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const rows = ref<OperLogRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const stats = ref<LogStats | null>(null);
const toast = ref('');
const query = reactive({ pageNum: 1, pageSize: 20, keyword: '', status: null as number | null, range: '7d' });

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
    const [list, summary] = await Promise.all([
      listOperLogs({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        keyword: query.keyword || undefined,
        status: query.status ?? undefined
      }),
      operLogStats(query.range)
    ]);
    rows.value = list.rows;
    total.value = list.total;
    stats.value = summary;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

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
    await exportOperLogs({ keyword: query.keyword || undefined, status: query.status ?? undefined });
  } catch (err) {
    notify(err instanceof Error ? err.message : '导出失败');
  }
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

    <div class="toolbar" style="margin-top: 14px">
      <input v-model="query.keyword" class="input" style="width: 220px" placeholder="事件 / IP / 账号" @keyup.enter="search" />
      <select v-model.number="query.status" class="select" style="width: 120px">
        <option :value="null">全部结果</option>
        <option :value="1">成功</option>
        <option :value="0">失败</option>
      </select>
      <select v-model="query.range" class="select" style="width: 120px" @change="load">
        <option value="24h">24 小时</option>
        <option value="7d">7 天</option>
        <option value="30d">30 天</option>
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
              <th>模块</th>
              <th>事件</th>
              <th>路径</th>
              <th>耗时</th>
              <th>结果</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td class="mono">{{ new Date(row.created_at).toLocaleString('zh-CN') }}</td>
              <td>{{ row.username || '—' }}</td>
              <td>{{ row.module }}</td>
              <td class="mono">{{ row.action }}</td>
              <td class="mono">{{ row.path || '—' }}</td>
              <td class="mono">{{ row.cost_ms ? `${row.cost_ms} ms` : '—' }}</td>
              <td>
                <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">{{ row.status === 1 ? '成功' : '失败' }}</span>
              </td>
              <td class="mono">{{ row.ip || '—' }}</td>
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
        <button class="btn btn--sm" type="button" :disabled="query.pageNum >= pageCount" @click="turnPage(1)">下一页</button>
      </div>
    </section>

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
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 12px;
}
</style>
