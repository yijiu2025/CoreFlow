<script setup lang="ts">
/**
 * wechat · standard · 后台壳版式（转发）
 *
 * 桌面端沿用珍珠玻璃的骨架：微信的"手机 App 感"来自底部 TabBar 与压栈导航，1280px 上只会浪费横向空间。
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
  <div class="device-view-alias" data-mauth-view="wechat">
    <Base :ctx="ctx" />
  </div>
</template>

<style scoped>
.device-view-alias {
  display: contents;
}
</style>
