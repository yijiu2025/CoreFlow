<script setup lang="ts">
/**
 * 图标（按菜单里存的图标名取组件）
 *
 * 菜单表只存字符串（`LayoutDashboard` 等），后端不该知道前端图标库；
 * 这里做一层「名字 → lucide 组件」映射，未知名字退回 `Circle`，
 * 避免菜单配置写错导致整条导航渲染失败。
 *
 * @author yijiu2025
 */
import { computed } from 'vue';
import {
  BookMarked,
  Briefcase,
  Circle,
  LayoutDashboard,
  ListTree,
  LogIn,
  Network,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wand2,
  Wrench
} from 'lucide-vue-next';

const props = defineProps<{
  /** 图标名（与菜单表 icon 字段一致） */
  name?: string | null;
  /** 尺寸（px） */
  size?: number;
}>();

const ICONS: Record<string, unknown> = {
  LayoutDashboard,
  Settings,
  Users,
  ShieldCheck,
  Shield,
  ListTree,
  Network,
  Briefcase,
  BookMarked,
  SlidersHorizontal,
  ScrollText,
  LogIn,
  Wrench,
  Wand2
};

const component = computed(() => (props.name && ICONS[props.name]) || Circle);
const size = computed(() => props.size ?? 16);
</script>

<template>
  <component :is="component" :size="size" :stroke-width="1.7" />
</template>
