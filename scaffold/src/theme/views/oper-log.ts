/**
 * 操作日志页面域声明（page: oper-log）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 与登录日志同构（概览 + 热力 + 明细），差别只有三处：行类型、时间窗（一个控件同时
 * 约束列表与统计）、设备码的短名。热力与年视图的形状与登录日志共用 `log-shared.ts`。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { LogFilters, LogStats, OperLogRow } from '@/api/types';
import type { LogHeat, LogYearPoint } from './log-shared';

export type { LogHeat, LogHeatCell, LogYearPoint } from './log-shared';

/** 时间窗档位（一个控件同时约束列表与统计，见容器注释） */
export type OperTimeWindow = 'all' | '24h' | '7d' | '30d' | 'custom';

/** 列表 / 导出 / 清除共用的筛选条件 */
export interface OperLogQuery {
  pageNum: number;
  pageSize: number;
  keyword: string;
  status: number | null;
  username: string;
  ip: string;
  deviceId: string;
  action: string;
  startTime: string;
  endTime: string;
}

/** 操作日志版式上下文（版式只读它） */
export interface OperLogViewContext {
  /** 当前渲染设备：`'mobile'` 走卡片，其余走表格 */
  device: Ref<string>;
  rows: Ref<OperLogRow[]>;
  activeRow: Ref<OperLogRow | null>;
  total: Ref<number>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  stats: Ref<LogStats | null>;
  heat: Ref<{ cells: LogHeat['cells'] } | null>;
  /** 热力窗口固定 7 天（与登录日志同一口径） */
  HEAT_DAYS: number;
  heatWindow: Ref<'7d' | 'year'>;
  heatOffset: Ref<number>;
  yearSeries: Ref<LogYearPoint[]>;
  yearLoading: Ref<boolean>;
  view: Ref<'heat' | 'trend'>;
  heatHidden: Ref<boolean>;
  toast: Ref<string>;
  query: OperLogQuery;
  /** 时间窗（同时约束列表与统计） */
  timeWindow: Ref<OperTimeWindow>;
  advancedOpen: Ref<boolean>;
  advancedCount: ComputedRef<number>;
  purgeFilters: Ref<LogFilters | null>;
  purgeMatched: Ref<number>;
  filters: ComputedRef<LogFilters>;
  canRead: boolean;
  canRemove: ComputedRef<boolean>;
  pageCount: ComputedRef<number>;
  heatRangeLabel: ComputedRef<string>;
  seriesValues: ComputedRef<number[]>;
  seriesFailed: ComputedRef<number[]>;
  seriesLabels: ComputedRef<string[]>;
  /** 设备码 → 短名（`pc` / `h5` …） */
  shortDevice: (code: string) => string;
  /** 时间拆成「日期 / 时刻」两段 */
  timeParts: (iso: string) => { date: string; time: string };
  load: () => Promise<void>;
  switchView: (value: 'heat' | 'trend') => void;
  switchWindow: (value: '7d' | 'year') => Promise<void>;
  shiftHeat: (delta: number) => Promise<void>;
  toggleHeat: () => void;
  search: () => void;
  turnPage: (delta: number) => void;
  exportCsv: () => Promise<void>;
  applyTimeWindow: () => void;
  resetFilters: () => void;
  openPurge: () => void;
  onPurged: (removed: number) => void;
}

/** 页面域声明（`<ThemeView page="oper-log">` 依赖它） */
defineThemePage({ page: 'oper-log' });
