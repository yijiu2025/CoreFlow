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
import { useRenderDevice } from '@/views/device/useRenderDevice';

/**
 * 当前渲染设备
 *
 * 封禁表 5 列（类型 / 对象 / 原因 / 剩余 / 创建时间），其中「对象」是长 IP 或指纹，
 * 手机上横滚会把"原因"挤成一条缝。手机上换成一行一条：对象当标题，其余压进第二行。
 */
const device = useRenderDevice();

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
    // 后端异常时可能回 `data: null`（不是 {}）——直接赋给 ref 会让模板里的
    // `summary.totalRequests` 抛 TypeError，整页白屏且错误信息指向渲染栈，
    // 看着像"前端崩了"而不是"接口没拿到数"。这里兜成空对象，让页面显示 0。
    summary.value = (sum as Record<string, number> | null) ?? {};
    blocks.value = list?.rows ?? [];
    total.value = list?.total ?? 0;
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
      <span class="page__sub">共 {{ total }} 次拦截 · 仅查看</span>
    </div>

    <div class="toolbar">
      <!-- 本页只有这一个动作，仍按"动作靠右"的规矩放：与其它页的刷新位置一致 -->
      <span class="toolbar__spacer"></span>
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
      <div v-if="device !== 'mobile'" class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 95px" />
            <col style="width: 210px" />
            <col style="width: 225px" />
            <col style="width: 78px" />
            <col style="width: 150px" />
          </colgroup>
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

      <!--
        手机端：一条封禁一张卡。
        对象（IP / 指纹）是这一行最关键的信息，放标题；类型与剩余时长是"要不要处理"
        的依据，紧跟在第二行；原因最长，放最后一行允许换行。
      -->
      <ul v-else class="mlist">
        <li v-for="(row, index) in blocks" :key="String(row.id ?? index)" class="mcard">
          <div class="mcard__head">
            <div class="mcard__main">
              <span class="mcard__title">
                <span class="mcard__title-text mono">{{ String(row.value ?? row.key ?? '—') }}</span>
              </span>
              <span class="mcard__sub">
                {{ String(row.kind || row.dimension || '—') }} ·
                剩余 {{ row.remainingSeconds ? `${row.remainingSeconds}s` : '—' }}
              </span>
              <span class="mcard__meta">
                <span>{{ String(row.reason || '未记录原因') }}</span>
              </span>
              <span class="mcard__sub mono">
                {{ row.createdAt ? new Date(String(row.createdAt)).toLocaleString('zh-CN') : '—' }}
              </span>
            </div>
          </div>
        </li>
        <li v-if="loading" class="mlist__hint">加载中…</li>
        <li v-else-if="blocks.length === 0" class="mlist__hint">当前没有生效中的封禁</li>
      </ul>
    </section>
  </div>
</template>
