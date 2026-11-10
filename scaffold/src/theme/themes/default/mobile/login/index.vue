<script setup lang="ts">
/**
 * 登录页版式 · default / **mobile**
 *
 * 与桌面共用同一份实现：登录页的布局差异全部由宽度断点承担（≤720px 收起说明文字与
 * 卖点），没有第二套 DOM。这个文件存在只为满足「设备是页面身份」的目录口径 ——
 * `?th` 解析出的包要能在**当前设备**下找到版式，否则 ThemeView 会渲染空。
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
