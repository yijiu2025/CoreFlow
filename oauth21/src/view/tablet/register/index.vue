<script setup lang="ts">
/**
 * tablet（平板）注册容器 —— 业务零复制的薄转发（同 `tablet/login/index.vue`）
 *
 * 转发 StandardRegister 的完整业务，用 `device="tablet"` 覆盖设备身份，
 * 让主题作用域与版式加载走 tablet 而非 standard。
 *
 * @author yijiu2025
 * @since 2026-09-27
 */
import StandardRegister from '@/view/web/register/StandardRegister.vue';
</script>

<template>
  <StandardRegister device="tablet" />
</template>
