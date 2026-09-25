<script setup lang="ts">
/**
 * 注册页 · **电脑端**基础版式（占位骨架）
 *
 * === ⚠️ 现状：这是骨架，不是最终实现 ===
 * 同 `web/login/index.vue`：电脑端 `StandardRegister.vue`（710 行）与
 * `MiniRegister.vue`（695 行）仍是「业务 + UI」单体，尚未拆分，故本文件
 * 暂时没有消费方。它只用来立起 `themes/default/web/register/` 这层目录骨架
 * 并固定契约入口。详见 `web/login/index.vue` 的同段说明。
 *
 * === 契约 ===
 * 与移动端同一份 `theme/views/register.ts`；版式只读 `ctx`、只调 `ctx.actions`。
 *
 * @author yijiu2025
 * @since 2026-09-24
 */
import { toRef } from 'vue';
import type { RegisterViewProps } from '@/theme/views/register';

const props = defineProps<RegisterViewProps>();
const ctx = toRef(props, 'ctx');
</script>

<template>
  <div class="mauth-view-placeholder" data-mauth-view="web-base">
    <h1 class="mauth-view-placeholder__title">{{ ctx.appName }}</h1>
    <p class="mauth-view-placeholder__hint">
      电脑端版式骨架（注册 · 第 {{ ctx.step }}/{{ ctx.totalSteps }} 步）——待「业务容器 + 版式」重构后替换。
    </p>
  </div>
</template>

<style scoped>
/* 与 login 占位同一套极简样式（各页独立，不抽公共文件：占位将来会被删掉，
   抽公共只会多一个需要清理的引用）。 */
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
