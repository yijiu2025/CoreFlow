<script setup lang="ts">
/**
 * 登录页版式 · spotlight / **mobile**
 *
 * 与桌面共用同一份实现：≤1024px 时左侧叙事面板整块让位，右侧登录卡撑满，
 * 设备差异由 CSS 承担，没有第二套 DOM。文件存在只为满足设备目录口径
 * （`?th=spotlight` 必须在当前设备下能找到版式，否则 ThemeView 渲染空）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import StandardLogin from '../../standard/login/index.vue';
import type { LoginViewProps } from '@/theme/views/login';

defineProps<LoginViewProps>();
</script>

<template>
  <StandardLogin :ctx="ctx" />
</template>
