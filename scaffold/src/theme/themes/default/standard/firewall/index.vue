<script setup lang="ts">
/**
 * 珍珠玻璃 · 防火墙监控版式
 *
 * 版式只负责"长什么样"：汇总读数与封禁名单都来自容器（`views/monitor/Firewall.vue`），
 * 契约见 `theme/views/firewall.ts`。这里一行请求都没有。
 *
 * 桌面端五列表格、手机端一人一卡（对象当标题）留在同一份实现里按 `ctx.device` 切：
 * 手机端不是另一套页面，只是把一行折成一张卡。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { RefreshCw } from 'lucide-vue-next';
import type { FirewallViewContext } from '@/theme/views/firewall';

const props = defineProps<{ ctx: FirewallViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  device,
  summary,
  blocks,
  total,
  loading,
  errorMessage,
  num,
  load
} = props.ctx;
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

