/**
 * 日志类页面共用的版式词汇（login-log / oper-log）
 *
 * 两个日志页的「概览 + 热力 + 年视图 + 明细」结构一致，只是行类型与几处文案不同。
 * 把这三组形状放在一处：两个契约共用一份定义，改一处两边同步 —— 各写一份必然漂移。
 *
 * 本文件是**纯类型**模块，没有副作用（插件扫到它只会空跑一遍 defineThemePage 之外什么也不做）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

/** 热力格（7×24） */
export interface LogHeatCell {
  dow: number;
  hour: number;
  total: number;
  failed: number;
}

/** 热力数据 + 分档阈值 */
export interface LogHeat {
  cells: LogHeatCell[];
  threshold: number;
}

/** 年视图里的一天 */
export interface LogYearPoint {
  date: string;
  total: number;
  failed: number;
}
