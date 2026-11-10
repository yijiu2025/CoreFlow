<script setup lang="ts">
/**
 * 图标（按名字取 lucide 组件）
 *
 * 菜单表只存字符串（`LayoutDashboard` 等），后端不该知道前端图标库；
 * 这里做一层「名字 → lucide 组件」映射，未知名字退回 `Circle`，
 * 避免菜单配置写错导致整条导航渲染失败。
 *
 * 名字支持三种写法（大小写与分隔符不敏感）：`RefreshCw` / `refresh-cw` / `refresh`。
 * 图谱与工具栏需要的小写短名（refresh / play / pause / check / chevronRight）
 * 走 `ALIAS`，不要为此新增第二套图标映射。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed } from 'vue';
import {
  BookMarked,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListTree,
  LogIn,
  Maximize,
  Minus,
  Network,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
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
  /** 图标名（菜单表 icon 字段，或 refresh / play 这类短名） */
  name?: string | null;
  /** 尺寸（px） */
  size?: number;
}>();

/** PascalCase 图标名 → 组件 */
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
  Wand2,
  RefreshCw,
  Play,
  Pause,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  Maximize,
  Minus,
  Layers,
  Plus,
  Pencil
};

/** 小写短名 → PascalCase（图谱工具栏与矩阵折叠按钮用） */
const ALIAS: Record<string, string> = {
  refresh: 'RefreshCw',
  reload: 'RefreshCw',
  play: 'Play',
  pause: 'Pause',
  check: 'Check',
  chevronright: 'ChevronRight',
  chevronleft: 'ChevronLeft',
  key: 'KeyRound',
  users: 'Users',
  role: 'ShieldCheck',
  menu: 'ListTree',
  chevron: 'ChevronRight',
  layers: 'Layers',
  eye: 'Eye',
  plus: 'Plus',
  minus: 'Minus',
  fit: 'Maximize',
  edit: 'Pencil'
};

/**
 * 解析图标名
 *
 * @param name 原始名（可为空）
 * @returns lucide 组件（未知时退回 Circle）
 */
function resolve(name?: string | null): unknown {
  if (!name) return Circle;
  if (ICONS[name]) return ICONS[name];
  const lower = name.toLowerCase();
  if (ALIAS[lower]) return ICONS[ALIAS[lower]];
  // 连字符 / 下划线 / 空格分隔统一成 PascalCase（refresh-cw → RefreshCw）
  const pascal = name
    .replace(/[-_\s]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : ''))
    .replace(/^./, s => s.toUpperCase());
  return ICONS[pascal] || Circle;
}

const component = computed(() => resolve(props.name));
const size = computed(() => props.size ?? 16);
</script>

<template>
  <component :is="component" :size="size" :stroke-width="1.7" />
</template>
