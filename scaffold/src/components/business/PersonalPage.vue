<script setup lang="ts">
/**
 * 个人设置类页面的统一外壳（标题 / 副标题 / 右上操作 / 内容）
 *
 * 为什么要有这个组件：四个个人页原先各写一套页头 —— 有的 `h1`、有的 `h2`、
 * 有的没有副标题，有的还自己又套了一层 `.page`（控制台版式已经把内容放进
 * `<main class="page">`，再套一层就整页多缩进 24px，标题错位一眼可见）。
 * 结构收在一处之后，间距与标题层级才不会各自漂移。
 *
 * 🔴 根元素**不要**加 `.page`：外层已提供内边距。
 *
 * 主题包里的「个人资料」版式不走这个组件（版式归主题），但它必须渲染同样的
 * `.page__head` / `.page__title` / `.page__sub` 三个类，视觉才对得上。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
defineProps<{
  /** 页面标题（与路由 `meta.title` 保持一致，面包屑与浏览器标签也读那一份） */
  title: string;
  /** 一句说明「这一页能做什么」；不写就只显示标题 */
  sub?: string;
  /**
   * 收窄内容宽度（820px）
   *
   * 只有表单型页（外观与主题）需要：一行一个控件的设置页铺满 1400px 会很难读。
   * 带表格的页（令牌、通知矩阵）必须保持通栏，否则表格被压到横向滚动。
   */
  narrow?: boolean;
}>();
</script>

<template>
  <div class="personal" :class="{ 'personal--narrow': narrow }">
    <header class="page__head">
      <div class="personal__heading">
        <h1 class="page__title">{{ title }}</h1>
        <p v-if="sub" class="page__sub">{{ sub }}</p>
      </div>
      <!-- 页面级操作（刷新 / 新建…）靠右；面板内的操作仍放在面板标题行 -->
      <div v-if="$slots.actions" class="personal__actions">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.personal {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.personal--narrow {
  max-width: 820px;
}

.personal__heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.personal__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
</style>
