<script setup lang="ts">
/**
 * tablet（平板）忘记密码容器 —— 业务零复制的薄转发（同 `tablet/login/index.vue`）
 *
 * 转发 StandardForgot 的完整业务，用 `device="tablet"` 覆盖设备身份，
 * 让主题作用域与版式加载走 tablet 而非 standard。
 *
 * @author yijiu2025
 * @since 2026-09-27
 */
import StandardForgot from '@/view/web/forgot-password/StandardForgot.vue';
</script>

<template>
  <StandardForgot device="tablet" />
</template>
