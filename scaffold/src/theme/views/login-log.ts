/**
 * 登录日志页面域声明（page: login-log）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 登录日志是「概览读数 + 7×24 热力 + 明细」三段式；三段的口径都在容器里
 * （`views/monitor/LoginLog.vue`），版式只负责画。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { LogFilters, LogStats, LoginLogRow } from '@/api/types';
import type { LogHeat, LogYearPoint } from './log-shared';

// 热力 / 年视图的形状与操作日志共用一份（见 `log-shared.ts`）
export type { LogHeat, LogHeatCell, LogYearPoint } from './log-shared';

/** 列表 / 导出 / 清除共用的筛选条件 */
export interface LoginLogQuery {
  pageNum: number;
  pageSize: number;
  keyword: string;
  event: string;
  username: string;
  ip: string;
  startTime: string;
  endTime: string;
}

/** 登录日志版式上下文（版式只读它） */
export interface LoginLogViewContext {
  /** 当前渲染设备：`'mobile'` 走卡片，其余走 9 列表格 */
  device: Ref<string>;
  rows: Ref<LoginLogRow[]>;
  total: Ref<number>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  /** 概览读数（趋势序列挂在里面） */
  stats: Ref<LogStats | null>;
  /** 7×24 热力（未加载为 null） */
  heat: Ref<LogHeat | null>;
  /** 热力窗口固定 7 天（刻意没有 30 天档，见容器注释） */
  HEAT_DAYS: number;
  /** 热力视图窗口：`7d` 热力 / `year` 日历 */
  heatWindow: Ref<'7d' | 'year'>;
  heatOffset: Ref<number>;
  yearSeries: Ref<LogYearPoint[]>;
  yearLoading: Ref<boolean>;
  /** 读数区档位：热力 / 趋势 */
  view: Ref<'heat' | 'trend'>;
  heatHidden: Ref<boolean>;
  /** 查询条件（筛选维度的唯一来源） */
  query: LoginLogQuery;
  /** 已生效的筛选（列表 / 导出 / 清除共用同一份） */
  filters: ComputedRef<LogFilters>;
  canRead: boolean;
  canRemove: ComputedRef<boolean>;
  advancedOpen: Ref<boolean>;
  /** 高级筛选里已填的条数（按钮角标） */
  advancedCount: ComputedRef<number>;
  purgeFilters: Ref<LogFilters | null>;
  purgeMatched: Ref<number>;
  pageCount: ComputedRef<number>;
  /** 详情弹窗当前行（null = 关闭） */
  activeRow: Ref<LoginLogRow | null>;
  heatRangeLabel: ComputedRef<string>;
  seriesValues: ComputedRef<number[]>;
  seriesFailed: ComputedRef<number[]>;
  seriesLabels: ComputedRef<string[]>;
  /** 归属地文案（空值兜成破折号） */
  locationText: (row: LoginLogRow) => string;
  /** 时间拆成「日期 / 时刻」两段 */
  timeParts: (value: string) => { date: string; time: string };
  load: () => Promise<void>;
  search: () => void;
  turnPage: (delta: number) => void;
  switchView: (value: 'heat' | 'trend') => void;
  switchWindow: (value: '7d' | 'year') => Promise<void>;
  shiftHeat: (delta: number) => Promise<void>;
  toggleHeat: () => void;
  exportCsv: () => Promise<void>;
  openPurge: () => void;
  resetFilters: () => void;
  onPurged: (removed: number) => void;
}

/** 页面域声明（`<ThemeView page="login-log">` 依赖它） */
defineThemePage({ page: 'login-log' });
