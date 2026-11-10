<script setup lang="ts">
/**
 * 防火墙监控（只读）
 *
 * 汇总与封禁名单来自本仓既有防火墙数据源（`getSummaryAggregated` / `getActiveBlocks`），
 * 不在这里实现任何写操作 —— 加黑 / 解封仍走防火墙自己的控制台，避免两处状态不一致。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { onMounted, ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { firewallBlocks, firewallSummary } from '@/api/monitor';

const summary = ref<Record<string, number>>({});
const blocks = ref<Array<Record<string, unknown>>>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');

/** 数值格式化（大数字加千分位） */
function num(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '—';
}

/** 加载汇总与封禁名单 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [sum, list] = await Promise.all([firewallSummary(), firewallBlocks({ pageNum: 1, pageSize: 50 })]);
    summary.value = sum as Record<string, number>;
    blocks.value = list.rows;
    total.value = list.total;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">防火墙监控</h2>
      <span class="page__sub">只读视图 · 写操作请在防火墙控制台进行</span>
    </div>

    <div class="toolbar">
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load"><RefreshCw :size="15" /> 刷新</button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <div class="stats">
      <div class="stat">
        <div class="stat__label">总请求</div>
        <div class="stat__value">{{ num(summary.totalRequests) }}</div>
      </div>
      <div class="stat">
        <div class="stat__label">已拦截</div>
        <div class="stat__value">{{ num(summary.totalBlocked) }}</div>
      </div>
      <div class="stat">
        <div class="stat__label">缓冲区记录</div>
        <div class="stat__value">{{ num(summary.bufferedCount) }}</div>
      </div>
      <div class="stat">
        <div class="stat__label">生效封禁</div>
        <div class="stat__value">{{ total }}</div>
      </div>
    </div>

    <section class="panel" style="margin-top: 14px">
      <header class="panel__head">
        <span class="panel__title">生效中的封禁（前 50 条）</span>
      </header>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>类型</th>
              <th>对象</th>
              <th>原因</th>
              <th>剩余</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in blocks" :key="String(row.id ?? index)">
              <td>{{ String(row.kind || row.dimension || '—') }}</td>
              <td class="mono">{{ String(row.value ?? row.key ?? '—') }}</td>
              <td>{{ String(row.reason || '—') }}</td>
              <td class="mono">{{ row.remainingSeconds ? `${row.remainingSeconds}s` : '—' }}</td>
              <td class="mono">{{ row.createdAt ? new Date(String(row.createdAt)).toLocaleString('zh-CN') : '—' }}</td>
            </tr>
            <tr v-if="!loading && blocks.length === 0">
              <td colspan="5"><div class="empty">当前没有生效中的封禁</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
