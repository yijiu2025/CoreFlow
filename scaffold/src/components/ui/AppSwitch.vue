<script setup lang="ts">
/**
 * 开关（布尔值即时切换）
 *
 * 用原生 `button[role=switch]` 而不是 checkbox：它自己就是焦点目标，
 * 键盘空格/回车天然可用，也不需要包一层 label 去关联。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
    /** 无障碍名称（按钮没有可见文字，必须给） */
    label?: string;
  }>(),
  { disabled: false, label: '' }
);

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

function toggle(): void {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    :class="['switch', { 'is-on': modelValue }]"
    @click="toggle"
  >
    <span class="switch__knob" aria-hidden="true" />
  </button>
</template>

<style scoped>
.switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
  width: 38px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  /* 关：凹槽色；开：状态色（青柠/成功色，深浅两态都由令牌决定） */
  background: color-mix(in srgb, var(--mauth-text) 16%, transparent);
  cursor: pointer;
  transition: background 0.2s var(--ease);
}

.switch.is-on {
  background: var(--mauth-success);
}

.switch:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.switch:focus-visible {
  outline: 2px solid var(--mauth-focus);
  outline-offset: 2px;
}

.switch__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--mauth-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--mauth-text) 22%, transparent);
  transition: transform 0.2s var(--ease-out);
}

.switch.is-on .switch__knob {
  transform: translateX(16px);
}

@media (prefers-reduced-motion: reduce) {
  .switch,
  .switch__knob {
    transition: none;
  }
}
</style>
