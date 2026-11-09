/**
 * 监控与工作台接口（工作台 / 操作日志 / 登录日志 / 防火墙只读）
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { del, download, get } from './http';
import type { DashboardSummary, LogStats, LoginLogRow, OperLogRow, PageResult } from './types';

const BASE = '/admin/console/v1';

/** 工作台概览 */
export function dashboardSummary(): Promise<DashboardSummary> {
  return get(`${BASE}/dashboard/summary`);
}

/* ── 操作日志 ─────────────────────────────────────────────── */

/** 操作日志分页 */
export function listOperLogs(query: Record<string, unknown>): Promise<PageResult<OperLogRow>> {
  return get(`${BASE}/oper-logs`, query);
}

/** 操作日志统计 */
export function operLogStats(range: string): Promise<LogStats> {
  return get(`${BASE}/oper-logs/stats`, { range });
}

/** 操作日志泳道 */
export function operTimeline(date?: string): Promise<{
  date: string;
  nowSec: number | null;
  lanes: Array<{ module: string; count: number; blocks: Array<Record<string, unknown>> }>;
}> {
  return get(`${BASE}/oper-logs/timeline`, date ? { date } : undefined);
}

/** 导出操作日志 */
export function exportOperLogs(query: Record<string, unknown>): Promise<void> {
  return download(`${BASE}/oper-logs/export`, 'oper-logs.csv', query);
}

/** 删除单条操作日志 */
export function removeOperLog(id: number): Promise<null> {
  return del(`${BASE}/oper-logs/${id}`);
}

/* ── 登录日志 ─────────────────────────────────────────────── */

/** 登录日志分页 */
export function listLoginLogs(query: Record<string, unknown>): Promise<PageResult<LoginLogRow>> {
  return get(`${BASE}/login-logs`, query);
}

/** 登录日志统计 */
export function loginLogStats(range: string): Promise<LogStats> {
  return get(`${BASE}/login-logs/stats`, { range });
}

/** 登录热力（7×24 + 异常来源） */
export function loginHeatmap(days: 7 | 30): Promise<{
  days: number;
  threshold: number;
  cells: Array<{ dow: number; hour: number; total: number; failed: number }>;
  anomalies: Array<{ kind: string; key: string; failed: number; total: number; spread: number }>;
}> {
  return get(`${BASE}/login-logs/heatmap`, { days });
}

/** 导出登录日志 */
export function exportLoginLogs(query: Record<string, unknown>): Promise<void> {
  return download(`${BASE}/login-logs/export`, 'login-logs.csv', query);
}

/* ── 防火墙（只读） ───────────────────────────────────────── */

/** 防火墙汇总 */
export function firewallSummary(): Promise<Record<string, unknown>> {
  return get(`${BASE}/firewall/summary`);
}

/** 封禁名单 */
export function firewallBlocks(query: Record<string, unknown>): Promise<PageResult<Record<string, unknown>>> {
  return get(`${BASE}/firewall/blocks`, query);
}
