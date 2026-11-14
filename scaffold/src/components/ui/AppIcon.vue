<script setup lang="ts">
/**
 * 图标（按名字取 lucide 组件）
 *
 * 映射表在 `icon-registry.ts` —— 菜单表单的下拉也从那里取，
 * 保证「能选的图标名」与「能渲染的图标名」是同一份，
 * 不会出现选了某个名字却渲染成圆形的情况。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed } from 'vue';
import { resolveIcon } from './icon-registry';

const props = defineProps<{
  /** 图标名（菜单表 icon 字段，或 refresh / play 这类短名） */
  name?: string | null;
  /** 尺寸（px） */
  size?: number;
}>();

const component = computed(() => resolveIcon(props.name));
const size = computed(() => props.size ?? 16);
</script>

<template>
  <component :is="component" :size="size" :stroke-width="1.7" />
</template>
