<script setup lang="ts">
/**
 * 重置密码页 · **电脑端**基础版式（占位骨架）
 *
 * === ⚠️ 现状：这是骨架，不是最终实现 ===
 * 同 `web/login/index.vue`：电脑端 `DesktopForgot.vue` / `ResetByCode.vue` /
 * `ResetByLink.vue` 三件仍是「业务 + UI」单体，尚未拆分，故本文件暂时没有消费方。
 * 它只用来立起 `themes/default/web/forgot-password/` 这层目录骨架并固定契约入口。
 *
 * === 契约 ===
 * 与移动端同一份 `theme/views/forgot-password.ts`；版式只读 `ctx`、只调 `ctx.actions`。
 *
 * @author yijiu2025
 * @since 2026-09-24
 */
import { toRef } from 'vue';
import type { ForgotPasswordViewProps } from '@/theme/views/forgot-password';

const props = defineProps<ForgotPasswordViewProps>();
const ctx = toRef(props, 'ctx');
</script>

<template>
  <div class="mauth-view-placeholder" data-mauth-view="web-base">
    <h1 class="mauth-view-placeholder__title">{{ ctx.title }}</h1>
    <p class="mauth-view-placeholder__hint">
      电脑端版式骨架（重置密码 · 第 {{ ctx.step }}/{{ ctx.totalSteps }} 步）——待「业务容器 + 版式」重构后替换。
    </p>
  </div>
</template>

<style scoped>
.mauth-view-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 24px;
  color: var(--mauth-text-body);
}

.mauth-view-placeholder__title {
  font-size: 20px;
  font-weight: 600;
}

.mauth-view-placeholder__hint {
  font-size: 14px;
  color: var(--mauth-text-faint);
}
</style>
