<script setup lang="ts">
/**
 * spotlight · mobile · 后台壳版式（转发）
 *
 * 同 `standard/console`：聚光的真版式只有登录页，后台壳沿用珍珠玻璃的骨架。
 * 桌面与手机是同一套 DOM（窄屏侧栏改抽屉、内容区改单列，全在 CSS 断点里），
 * 所以这里与桌面端指向同一个 Base。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import Base from '../../../default/standard/console/index.vue';
import type { ConsoleViewContext } from '@/theme/views/console';

defineProps<{ ctx: ConsoleViewContext }>();
</script>

<template>
  <div class="device-view-alias" data-mauth-view="spotlight">
    <Base :ctx="ctx" />
  </div>
</template>

<style scoped>
.device-view-alias {
  display: contents;
}
</style>
