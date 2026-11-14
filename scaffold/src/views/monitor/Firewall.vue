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
import { firewallBlocks, firewallSummary } from '@/api/monitor';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { ThemeView } from 'skinsuite/vue';
import type { FirewallViewContext } from '@/theme/views/firewall';

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

/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: FirewallViewContext = {
  device,
  summary,
  blocks,
  total,
  loading,
  errorMessage,
  num,
  load
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/firewall/`），容器只准备 ctx -->
  <ThemeView page="firewall" :device="device" :ctx="ctx" />
</template>
