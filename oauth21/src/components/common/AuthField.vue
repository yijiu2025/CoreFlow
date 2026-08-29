<!--
  通用输入字段外壳
  只负责"图标 + 输入框容器 + 错误位"结构，
  input 元素通过默认 slot 由父组件提供（避免 v-model / 验证 props 透传复杂度）

  使用示例：
    <AuthField :error="!!errors.email" :error-message="errors.email">
      <template #icon><Icons name="mail" :size="18" /></template>
      <input v-model="email" v-bind="emailProps" type="email" class="auth-input" />
    </AuthField>

  @author yijiu2025
  @since 2026-08-29
-->
<script setup lang="ts">
/**
 * 通用输入字段 props
 * - error: 错误状态（控制 is-error 红色边框）
 * - errorMessage: 错误文案（显示在输入框下方固定高度位）
 * - size: 输入框高度（sm=40 / md=46 / lg=52）
 * - icon slot 放左侧图标（可选）
 * - 默认 slot 放 input 元素（v-model + 验证 props 由父组件管）
 */
defineProps<{
  error?: boolean;
  errorMessage?: string;
  size?: 'sm' | 'md' | 'lg';
}>();
</script>

<template>
  <div class="auth-field-cell">
    <div class="auth-field-row" :class="{ 'is-error': error, [`size-${size || 'md'}`]: true }">
      <span v-if="$slots.icon" class="auth-field-icon" aria-hidden="true">
        <slot name="icon" />
      </span>
      <div class="auth-field-input-wrap">
        <slot />
      </div>
    </div>
    <div class="auth-field-err">{{ errorMessage || ' ' }}</div>
  </div>
</template>

<style scoped>
.auth-field-cell {
  display: flex;
  flex-direction: column;
}
.auth-field-row {
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 14px;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  transition: all 0.2s;
}
:global(.dark) .auth-field-row {
  background: #0f172a;
  border-color: #1e293b;
}
.auth-field-row:focus-within {
  background: #fff;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}
:global(.dark) .auth-field-row:focus-within {
  background: #0f172a;
  border-color: #818cf8;
}
.auth-field-row.size-sm { height: 40px; }
.auth-field-row.size-lg { height: 52px; }
.auth-field-row.is-error {
  border-color: #ef4444;
  background: #fef2f2;
}
:global(.dark) .auth-field-row.is-error {
  background: rgba(239, 68, 68, 0.1);
}
.auth-field-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  flex-shrink: 0;
}
:global(.dark) .auth-field-icon { color: #64748b; }
.auth-field-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}
.auth-field-err {
  height: 18px;
  line-height: 18px;
  margin-top: 3px;
  padding-left: 4px;
  font-size: 11px;
  color: #ef4444;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
