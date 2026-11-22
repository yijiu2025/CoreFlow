/**
 * 通知中心接口封装
 *
 * 路径前缀 `/notice/v1`（`src/api/notice/system.json` 的 prefix + 各组 prefix）。
 * 渠道 / 事件清单**不在前端硬编码**：后端 `app/notice/constants.js` 是唯一来源，
 * 前端通过 `/channels`、`/events` 取回同一份数据，新增渠道时页面自动跟上。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { del, get, post, put } from './http';

const BASE = '/notice/v1';

/** 渠道配置字段（驱动管理页动态表单） */
export interface NoticeChannelField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'select';
  /** 凭据字段：读取时是掩码，原样回传表示不修改 */
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: Array<{ label: string; value: string }>;
}

/** 渠道能力声明 */
export interface NoticeChannel {
  id: string;
  label: string;
  /** 只有 true 会真正发送；false 表示配置可存、投递记「通道未接入」 */
  implemented: boolean;
  description: string;
  fields: NoticeChannelField[];
}

/** 渠道配置值（数字/布尔由后端按字段声明还原） */
export type NoticeChannelConfig = Record<string, string | number | boolean | null>;

/** 事件默认订阅：channelId → 是否开启 */
export type NoticeEventSubscriptions = Record<string, boolean>;

/** 事件（含全局默认渠道） */
export interface NoticeEvent {
  code: string;
  label: string;
  description: string;
  defaultChannels: string[];
  subscriptions: NoticeEventSubscriptions;
}

/** 事件目录（页面渲染矩阵用） */
export interface NoticeEventCatalog {
  channels: Array<{ id: string; label: string; implemented: boolean }>;
  events: NoticeEvent[];
}

/** 通知模板 */
export interface NoticeTemplate {
  id: number;
  code: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: string[];
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** 模板写入字段 */
export interface NoticeTemplateInput {
  code?: string;
  name?: string;
  channel?: string;
  subject?: string | null;
  body?: string;
  variables?: string[];
  enabled?: boolean;
}

/** 个人偏好的一格 */
export interface NoticePreferenceRow {
  eventCode: string;
  channel: string;
  enabled: boolean;
  quietFrom: string | null;
  quietTo: string | null;
  /** false = 尚未保存过，enabled 是「全局/默认」算出来的有效值 */
  configured: boolean;
}

/** 投递日志 */
export interface NoticeLogRow {
  id: number;
  eventCode: string;
  eventLabel: string;
  channel: string;
  channelLabel: string;
  userId: number | null;
  target: string | null;
  status: 'sent' | 'failed';
  error: string | null;
  createdAt: string;
}

/** 日志查询参数 */
export interface NoticeLogQuery {
  status?: 'sent' | 'failed';
  pageNum?: number;
  pageSize?: number;
}

/** 渠道能力清单 */
export function getNoticeChannels(): Promise<NoticeChannel[]> {
  return get(`${BASE}/channels`);
}

/** 某渠道的配置（凭据字段为掩码） */
export function getNoticeChannelConfig(type: string): Promise<NoticeChannelConfig> {
  return get(`${BASE}/config/${type}`);
}

/** 保存渠道配置（掩码原样回传 = 不修改凭据） */
export function saveNoticeChannelConfig(type: string, body: NoticeChannelConfig): Promise<null> {
  return post(`${BASE}/config/${type}`, body);
}

/** 发送测试邮件 */
export function testNoticeEmail(email: string): Promise<null> {
  return post(`${BASE}/test-email`, { email });
}

/** 模板列表 */
export function listNoticeTemplates(channel?: string): Promise<{ rows: NoticeTemplate[] }> {
  return get(`${BASE}/templates`, channel ? { channel } : undefined);
}

/** 新建模板 */
export function createNoticeTemplate(body: NoticeTemplateInput): Promise<NoticeTemplate> {
  return post(`${BASE}/templates`, body);
}

/** 编辑模板 */
export function updateNoticeTemplate(id: number, body: NoticeTemplateInput): Promise<NoticeTemplate> {
  return put(`${BASE}/templates/${id}`, body);
}

/** 删除模板 */
export function removeNoticeTemplate(id: number): Promise<null> {
  return del(`${BASE}/templates/${id}`);
}

/** 事件清单 + 全局默认渠道 */
export function getNoticeEvents(): Promise<NoticeEventCatalog> {
  return get(`${BASE}/events`);
}

/** 保存某事件的全局默认渠道 */
export function saveNoticeEventSubscriptions(
  code: string,
  subscriptions: NoticeEventSubscriptions
): Promise<NoticeEvent> {
  return put(`${BASE}/events/${encodeURIComponent(code)}`, { subscriptions });
}

/** 个人偏好页所需的事件目录（随偏好一起返回，避免普通用户去打管理接口） */
export interface NoticePreferenceEvent {
  code: string;
  label: string;
  description: string;
  defaultChannels: string[];
}

/** 个人偏好矩阵 + 渲染所需的渠道/事件目录 */
export interface NoticePreferenceCatalog {
  rows: NoticePreferenceRow[];
  channels: Array<{ id: string; label: string; implemented: boolean }>;
  events: NoticePreferenceEvent[];
}

/** 本人偏好矩阵（未设置的格已按全局/默认补齐） */
export function getNoticePreferences(): Promise<NoticePreferenceCatalog> {
  return get(`${BASE}/preferences`);
}

/** 保存本人偏好（免打扰时段对全部行生效） */
export function saveNoticePreferences(body: {
  items: Array<{ eventCode: string; channel: string; enabled: boolean }>;
  quietFrom: string | null;
  quietTo: string | null;
}): Promise<{ count: number }> {
  return put(`${BASE}/preferences`, body);
}

/** 投递日志分页（时间倒序） */
export function listNoticeLogs(
  query: NoticeLogQuery = {}
): Promise<{ rows: NoticeLogRow[]; total: number; pageNum: number; pageSize: number }> {
  return get(`${BASE}/logs`, query as Record<string, unknown>);
}
