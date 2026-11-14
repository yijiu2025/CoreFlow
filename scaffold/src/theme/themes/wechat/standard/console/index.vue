<script setup lang="ts">
/**
 * 微信 · 桌面端 · 后台壳版式
 *
 * 桌面端**沿用珍珠玻璃的骨架**（侧栏 + 顶栏）：微信的"手机 App 感"来自底部 TabBar 与
 * 压栈导航，这两样在 1280px 上只会浪费横向空间、并把导航藏进底部。
 *
 * 但版式文件不能省：**版式 ≡ 包名**，找不到本包在该设备的版式时，整页会回退到
 * default 包的版式 —— 连带配色也回退（`getThemeRecord` 按解析后的包查）——
 * 于是「微信主题在桌面上变成蓝色」。所以这里必须存在，内容就是"用默认壳"。
 *
 * 桌面端的差异只剩配色：灰白表面 + 微信绿主操作（见 `palette-wechat.ts`）。
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
