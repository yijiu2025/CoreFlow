/**
 * 监控与工作台接口（工作台 / 操作日志 / 登录日志 / 防火墙只读）
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { del, download, get, post } from './http';
import type {
  DashboardSummary,
  LogFilters,
  LogStats,
  LoginLogRow,
  OperLogRow,
  PageResult,
  StepUpChallenge,
  StepUpPayload
} from './types';

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

/**
 * 清除操作日志：第一步（算命中条数 + 签发二次验证凭据）
 *
 * `filters` 必须与真正执行时**完全相同**：后端用它派生范围指纹并绑到凭据上，
 * 改过的条件在第二步会被拒（防止"为清 A 范围验证、去删 B 范围"）。
 */
export function operPurgeChallenge(
  filters: LogFilters,
  method?: 'email' | 'password'
): Promise<StepUpChallenge & { matched: number }> {
  return post(`${BASE}/oper-logs/purge/challenge`, { filters, method });
}

/** 清除操作日志：第二步（校验凭据 + 删除 + 留痕） */
export function operPurge(filters: LogFilters, stepUp: StepUpPayload): Promise<{ removed: number }> {
  return post(`${BASE}/oper-logs/purge`, { filters, stepUp });
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
export function loginHeatmap(
  days: 7 | 30,
  offset = 0
): Promise<{
  days: number;
  offset: number;
  threshold: number;
  cells: Array<{ dow: number; hour: number; total: number; failed: number }>;
  anomalies: Array<{ kind: string; key: string; failed: number; total: number; spread: number }>;
}> {
  return get(`${BASE}/login-logs/heatmap`, { days, offset });
}

/** 登录日历（按天，供「年」档热力；`offset` 向过去翻页） */
export function loginCalendar(
  days = 365,
  offset = 0
): Promise<{ days: number; offset: number; series: Array<{ date: string; total: number; failed: number }> }> {
  return get(`${BASE}/login-logs/calendar`, { days, offset });
}

/**
 * 操作热力（7×24）
 *
 * 只有格子，没有"异常来源"：操作日志的可疑来源要靠 `details` 里的对象去判断，
 * 不是按 IP 计数能说明的，硬凑一个聚合反而误导。
 */
export function operHeatmap(
  days: 7 | 30,
  offset = 0
): Promise<{
  days: number;
  offset: number;
  cells: Array<{ dow: number; hour: number; total: number; failed: number }>;
}> {
  return get(`${BASE}/oper-logs/heatmap`, { days, offset });
}

/** 操作日历（按天，供「年」档热力；`offset` 向过去翻页） */
export function operCalendar(
  days = 365,
  offset = 0
): Promise<{ days: number; offset: number; series: Array<{ date: string; total: number; failed: number }> }> {
  return get(`${BASE}/oper-logs/calendar`, { days, offset });
}

/** 清除登录日志：第一步（算命中条数 + 签发二次验证凭据） */
export function loginPurgeChallenge(
  filters: LogFilters,
  method?: 'email' | 'password'
): Promise<StepUpChallenge & { matched: number }> {
  return post(`${BASE}/login-logs/purge/challenge`, { filters, method });
}

/** 清除登录日志：第二步（校验凭据 + 删除 + 留痕） */
export function loginPurge(filters: LogFilters, stepUp: StepUpPayload): Promise<{ removed: number }> {
  return post(`${BASE}/login-logs/purge`, { filters, stepUp });
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
