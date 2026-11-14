<script setup lang="ts">
/**
 * 珍珠玻璃 · 桌面端 · 后台壳版式
 *
 * 版式只负责"长什么样"，一律从 ctx 取数据、调 ctx 上的回调（契约见
 * `theme/views/console.ts`）。这里之所以只有一行组件：桌面与手机真的是同一套 DOM
 * （窄屏侧栏改抽屉靠 CSS 断点），拆成两份只会让两边慢慢漂移。
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
