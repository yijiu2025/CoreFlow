<script setup lang="ts">
/**
 * 珍珠玻璃 · 手机端 · 后台壳版式
 *
 * 与 `standard/` 共用同一个实现：手机端不是"另一套壳"，只是侧栏改抽屉、
 * 内容区改单列（`layout.css` / `components.css` 的 820px 断点）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import ConsoleChrome from '@/components/layout/ConsoleChrome.vue';
import type { ConsoleViewContext } from '@/theme/views/console';

defineProps<{ ctx: ConsoleViewContext }>();
</script>

<template>
  <ConsoleChrome :ctx="ctx" />
</template>
