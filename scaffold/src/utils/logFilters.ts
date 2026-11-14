/**
 * 日志筛选条件的口径统一
 *
 * 列表、导出、清除三个入口共用同一份条件对象。任何一处理解不一致，都会直接体现为
 * 「预览说 3 条、实际删 30 条」这类事故，所以这里只放纯函数、不放状态。
 *
 * 🔴 **不要**把"按 IP 清除"做成 keyword 筛选：keyword 是 OR 模糊匹配，
 *    输 `127.0.0.1` 会把任何字段里恰好含有这串字符的记录一起删掉。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import type { LogFilters } from '@/api/types';

/** 筛选键（与后端 FILTER_KEYS 保持一致；多传的键会被后端丢弃） */
const FILTER_KEYS = ['keyword', 'status', 'startTime', 'endTime', 'username', 'ip', 'event', 'action'] as const;

/**
 * 规范化时间字面量
 *
 * `<input type="datetime-local">` 给出的是 `2026-11-01T00:00`（带 T、无秒）。MySQL 能
 * 隐式接受这种写法，但那是**依赖数据库的宽松解析**：换个版本或开了严格模式就会变成
 * 一条语法错误，而错误信息完全指不到"是时间格式的问题"。
 *
 * 统一成 `YYYY-MM-DD HH:MM:SS`，前后端看到的是同一个字符串，指纹也稳定。
 *
 * @param value 原始值
 * @returns 规范化后的时间
 */
function normalizeTime(value: unknown): string {
  const text = String(value ?? '')
    .trim()
    .replace('T', ' ');
  if (!text) return '';
  // 只有分钟精度（16 位）时补秒；带秒或只有日期的原样放行
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text) ? `${text}:00` : text;
}

/**
 * 从页面查询状态里抽出条件
 *
 * @param raw 页面上的查询对象（含 pageNum / pageSize 等无关字段）
 * @returns 只含白名单键、且剔除空值的条件
 */
export function pickLogFilters(raw: Record<string, unknown>): LogFilters {
  const out: LogFilters = {};
  for (const key of FILTER_KEYS) {
    const value = raw[key];
    if (value === null || value === undefined || value === '') continue;
    if (key === 'startTime' || key === 'endTime') {
      const time = normalizeTime(value);
      if (time) Object.assign(out, { [key]: time });
      continue;
    }
    // status 的 0 是有效条件（只看失败），不能被当成空值丢掉
    Object.assign(out, { [key]: value });
  }
  return out;
}

/**
 * 是否至少有一个条件
 *
 * 后端会拒绝无条件清除（那是"一条命令清空审计"）。前端提前判断，是为了
 * 在点按钮之前就把原因说清楚，而不是让人填完验证码才收到 400。
 *
 * @param filters 条件
 * @returns 是否非空
 */
export function hasLogFilter(filters: LogFilters): boolean {
  return Object.keys(pickLogFilters(filters as Record<string, unknown>)).length > 0;
}

/**
 * 条件 → 一句人话
 *
 * @param filters 条件
 * @returns 可读描述（无条件时为空串）
 */
export function describeLogFilters(filters: LogFilters): string {
  const parts: string[] = [];
  const fmt = (value?: string): string => (value ? value.replace('T', ' ').slice(0, 16) : '');
  if (filters.startTime || filters.endTime) {
    parts.push(`时间 ${fmt(filters.startTime) || '不限'} ~ ${fmt(filters.endTime) || '不限'}`);
  }
  if (filters.username) parts.push(`账号含「${filters.username}」`);
  if (filters.ip) parts.push(`IP 以 ${filters.ip} 开头`);
  if (filters.action) parts.push(`操作 ${filters.action}`);
  if (filters.event) parts.push(`事件 ${filters.event}`);
  if (filters.status === 1) parts.push('仅成功记录');
  if (filters.status === 0) parts.push('仅失败记录');
  if (filters.keyword) parts.push(`关键词「${filters.keyword}」`);
  return parts.join('、');
}
