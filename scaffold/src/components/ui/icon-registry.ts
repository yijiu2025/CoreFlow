/**
 * 应用图标注册表（菜单 `icon` 字段的唯一取值来源）
 *
 * 为什么要有这张表：菜单表只存字符串，后端不该知道前端图标库；而**能用的名字
 * 就是这里注册过的这些** —— 写别的（哪怕 lucide 里真有）会静默退回圆形。
 * 所以「图标名有哪些」这件事必须能从代码里查到，也必须能让表单直接选，而不是让人背名字。
 *
 * 名字支持三种写法（大小写与分隔符不敏感）：`RefreshCw` / `refresh-cw` / `refresh`。
 * 图谱与工具栏需要的小写短名走 `ALIAS`，不要为此新增第二套图标映射。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import type { Component } from 'vue';
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

/** PascalCase 图标名 → 组件（表单下拉与 AppIcon 共用这一份） */
const ICONS: Record<string, Component> = {
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

/** 可选的图标名（菜单表单下拉用；顺序 = 注册顺序） */
const ICON_NAMES = Object.keys(ICONS);

/**
 * 解析图标名
 *
 * @param name 原始名（可为空）
 * @returns lucide 组件（未知时退回 Circle）
 */
function resolveIcon(name?: string | null): Component {
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

export { ALIAS, ICONS, ICON_NAMES, resolveIcon };
