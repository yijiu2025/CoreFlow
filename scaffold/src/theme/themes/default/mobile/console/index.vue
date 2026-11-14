<script setup lang="ts">
/**
 * default · mobile · 后台壳版式（转发）
 *
 * 手机端与桌面端是同一套 DOM（窄屏侧栏改抽屉、内容区改单列，全在 CSS 断点里）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import Base from '../../../default/standard/console/index.vue';
import type { ConsoleViewContext } from '@/theme/views/console';

defineProps<{ ctx: ConsoleViewContext }>();
</script>

<template>
  <!-- display:contents：本层只为携带版式身份（data-mauth-view = 包名），不生成盒子 -->
  <div class="device-view-alias" data-mauth-view="default">
    <Base :ctx="ctx" />
  </div>
</template>

<style scoped>
.device-view-alias {
  display: contents;
}
</style>
