/**
 * 工作台页面域声明（page: dashboard）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 工作台是**纯读数页**：所有聚合都在容器里算完（问候语、趋势柱高度、成功率刻度环端点），
 * 版式只把结果画出来 —— 这样换一套视觉不用重算一遍统计口径。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { DashboardSummary } from '@/api/types';

/** 趋势柱（容器按最大值归一到百分比高度） */
export interface DashboardTrendBar {
  bucket: string;
  total: number;
  failed: number;
  height: string;
  failedShare: number;
  label: string;
  isToday: boolean;
}

/** 刻度环上的一根刻度（viewBox 归一化到 0..1） */
export interface RingTick {
  key: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
  on: boolean;
}

/** 四格读数 */
export interface ResourceItem {
  label: string;
  value: number;
}

/** 常用入口瓦片 */
export interface ShortcutItem {
  label: string;
  /** 目标路由路径 */
  path: string;
  /** 副标：所属目录名（菜单树里的父级） */
  sub: string;
  /** 菜单表里的图标名（交给 `AppIcon` 解析），为空时用默认图标 */
  icon: string | null;
}

/** 工作台版式上下文（版式只读它） */
export interface DashboardViewContext {
  /** 汇总数据（未拿到时为 null，版式按 0 渲染） */
  data: Ref<DashboardSummary | null>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  /** 顶栏问候语里的账号名（容器取 `me`，版式不碰 store） */
  userName: ComputedRef<string>;
  greeting: ComputedRef<string>;
  /** 今天的日期文案 */
  today: ComputedRef<string>;
  /** 状态一句话（成功率高/有失败等） */
  statusLine: ComputedRef<string>;
  trendBars: ComputedRef<DashboardTrendBar[]>;
  /** 峰值柱下标（无数据为 null） */
  trendPeakIndex: ComputedRef<number | null>;
  onlineCount: ComputedRef<number>;
  trendMax: ComputedRef<number>;
  /** 悬停的柱下标（版式里的纯展示状态） */
  trendHover: Ref<number | null>;
  ringTicks: ComputedRef<RingTick[]>;
  /** 刻度环末端收口点（0 点亮时为 null） */
  ringCap: ComputedRef<{ x: number; y: number } | null>;
  resources: ComputedRef<ResourceItem[]>;
  /**
   * 常用入口瓦片
   *
   * 🔴 **已按权限过滤**（容器用路由 `meta.permission` 判，与路由守卫同源），
   * 版式不再自己判 —— 两处各判一次必然分叉成"入口看得见、点进去没权限"。
   */
  shortcuts: ComputedRef<ShortcutItem[]>;
  load: () => Promise<void>;
  /** 相对时间（"3 分钟前"） */
  ago: (iso: string) => string;
  /** 无头像时的首字母兜底 */
  initial: (name: string | null) => string;
}

/** 页面域声明（`<ThemeView page="dashboard">` 依赖它） */
defineThemePage({ page: 'dashboard' });
