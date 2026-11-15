<script setup lang="ts">
/**
 * spotlight · standard · 后台壳版式（转发）
 *
 * 聚光这个包的**真版式只有登录页**（`standard/login/`，独立视觉语言）；
 * 后台壳沿用珍珠玻璃的骨架，本文件只负责携带版式身份。
 *
 * 🔴 为什么必须有这个文件（而不是"没有就用内置包"）：
 *    缺 `index.vue` 时插件会记一条 `扫描跳过 …缺少版式组件` 的告警（dev 下每次启动都刷），
 *    而且本包其余页面（posts / users / roles…）全都有转发壳 —— 只缺 console 一处，
 *    读目录的人会以为"这里被漏掉了"。
 *    注意：**配色不受影响**（`colors/` 是独立注册的），所以删掉本文件不会让界面裸奔，
 *    但删掉 `colors/` 会 —— `?th=spotlight` 时 token 按 pkg=spotlight 查，查不到就清空。
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
  <div class="device-view-alias" data-mauth-view="spotlight">
    <Base :ctx="ctx" />
  </div>
</template>

<style scoped>
.device-view-alias {
  display: contents;
}
</style>
