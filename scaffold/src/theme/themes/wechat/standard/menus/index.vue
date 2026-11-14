<script setup lang="ts">
/**
 * wechat · standard · 菜单管理版式（转发）
 *
 * 这个包在这一页没有自己的视觉语言，沿用珍珠玻璃的实现；**必须存在这个文件** ——
 * 版式 ≡ 包名，某包在某设备上没有版式时 `<ThemeView>` 会回退到内置包的版式，
 * 连带配色归属也跟着回退（「换了主题反而变蓝」就是这么来的）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import Base from '../../../default/standard/menus/index.vue';
import type { MenusViewContext } from '@/theme/views/menus';

defineProps<{ ctx: MenusViewContext }>();
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
