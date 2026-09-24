<script setup lang="ts">
/**
 * 登录页 · **电脑端**基础版式（占位骨架）
 *
 * === 它在三级结构里的位置 ===
 * `themes/default/web/login/index.vue` = 主题包 `default` 在**电脑端**的登录页基础版式。
 * 容器（`view/web/login/index.vue`）按自身设备 `'web'` 在**当前包 × web** 下查找版式
 * （见 `theme/views/registry.ts` 的「版式跟随主题包与设备」）。
 *
 * === ⚠️ 现状：这是骨架，不是最终实现 ===
 * 电脑端核心组件（`StandardLogin.vue` 859 行、`MiniLogin.vue` 586 行）目前是
 * **业务与 UI 揉在一起**的单体，尚未按「业务容器 + 版式」拆分，因此本文件
 * **暂时没有任何消费方** —— 它存在是为了：
 *   1. 把 `themes/default/web/<page>/` 这层目录骨架立起来，glob 有东西可扫；
 *   2. 固定电脑端版式的契约入口，后续把单体里的 UI 抽出来时有明确的落点。
 * 容器重构落地后，本文件会被真正的电脑端版式替换，那时不需要改机制。
 *
 * 因此这里刻意**只渲染一个最小可辨识的占位**，不照搬单体 UI —— 照搬会立刻产生
 * 第二份 UI 副本，而它暂时无人渲染、无人测试，必然与单体漂移。
 *
 * === 契约 ===
 * 与移动端同一份 `theme/views/login.ts`（契约不跟着进包，各包各端共用一份）。
 * 版式只读 `ctx`、只调 `ctx.actions`，禁止出现请求 / 校验 / 路由 / store。
 *
 * @author yijiu2025
 * @since 2026-09-24
 */
import { toRef } from 'vue';
import type { LoginViewProps } from '@/theme/views/login';

const props = defineProps<LoginViewProps>();
const ctx = toRef(props, 'ctx');
</script>

<template>
  <div class="mauth-view-placeholder" data-mauth-view="web-base">
    <h1 class="mauth-view-placeholder__title">{{ ctx.title || ctx.appName }}</h1>
    <p class="mauth-view-placeholder__hint">
      电脑端版式骨架（{{ ctx.appName }}）——待「业务容器 + 版式」重构后替换。
    </p>
  </div>
</template>

<style scoped>
/* 占位样式刻意保持极简：它不参与最终呈现，只用于确认"这个目录被扫到且能渲染"。
   取值仍走 --mauth-* token，避免在这里留下裸色值。 */
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
