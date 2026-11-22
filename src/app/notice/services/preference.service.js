/**
 * 个人通知偏好服务
 *
 * 核心是一条语义：**没有记录 ≠ 关闭**。用户从没打开过偏好页时，所有行都不存在，
 * 此时必须按"全局订阅 → 事件默认渠道"给出有效值；把缺失当 false 会让新用户
 * 一条通知都收不到，而且页面上看不出原因（每一格都显示"关"）。
 *
 * 纯函数（isQuietNow / resolveEnabledChannels / buildUserMatrix）单独导出：
 * 投递链路与测试都消费同一份实现，避免"页面看到的"和"发送时判的"是两套规则。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import noticeCenterDao from '../dao/notice-center.dao.js';
import { NOTICE_CHANNELS, NOTICE_CHANNEL_IDS, NOTICE_EVENTS, getChannel, getEvent } from '../constants.js';

/**
 * 时间文本 → 当日分钟数
 *
 * 接受 `HH:MM` 与 `HH:MM:SS`（MySQL TIME 列读出来带秒）。
 *
 * @param {string|null|undefined} value 时间文本
 * @returns {number|null} 分钟数；非法或空值返回 null
 */
function minutesOf(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value)
    .trim()
    .match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(match[2]);
}

/**
 * 校验并规范化免打扰时间（入库用，带秒）
 *
 * @param {string|null|undefined} value 前端提交的时间
 * @returns {string|null} `HH:MM:SS`；空值返回 null
 * @throws {Error} 格式非法
 */
function normalizeQuietTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const minutes = minutesOf(value);
  if (minutes === null) throw new Error(`免打扰时间格式应为 HH:MM：${value}`);
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  return `${hours}:${mins}:00`;
}

/**
 * 入库的 `HH:MM:SS` → 接口的 `HH:MM`（`<input type="time">` 直接可用）
 *
 * @param {string|null} value 数据库时间
 * @returns {string|null}
 */
function toMinuteText(value) {
  const minutes = minutesOf(value);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * 当前时刻是否落在免打扰区间内（纯函数）
 *
 * 语义：`[from, to)`，支持跨天（from > to，例如 22:00–08:00）。
 * from === to 视为"不限制"而不是"全天静音"—— 用户把两端拨到同一格时，
 * 更可能的意图是关掉这个功能；静音一整天则会被当成"通知坏了"。
 *
 * @param {string|null} from 开始时间
 * @param {string|null} to 结束时间
 * @param {Date} [now] 当前时间（测试注入）
 * @returns {boolean}
 */
function isQuietNow(from, to, now = new Date()) {
  const start = minutesOf(from);
  const end = minutesOf(to);
  if (start === null || end === null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/**
 * 合并"个人偏好 → 全局订阅 → 事件默认渠道"，得到生效的渠道集合（纯函数）
 *
 * @param {object} event 事件定义
 * @param {Array<{channel:string, enabled:boolean}>} [preferenceRows] 该用户的偏好行
 * @param {Array<{channel:string, enabled:boolean}>} [subscriptionRows] 全局订阅行
 * @param {string[]} [channelIds] 待判定的渠道（默认全部渠道）
 * @returns {string[]} 生效渠道 id
 */
function resolveEnabledChannels(event, preferenceRows = [], subscriptionRows = [], channelIds = NOTICE_CHANNEL_IDS) {
  const preferenceMap = new Map(preferenceRows.map(row => [row.channel, row]));
  const subscriptionMap = new Map(subscriptionRows.map(row => [row.channel, row]));
  const defaults = Array.isArray(event?.defaultChannels) ? event.defaultChannels : [];

  return channelIds.filter(channel => {
    const preference = preferenceMap.get(channel);
    if (preference) return Boolean(preference.enabled);
    const subscription = subscriptionMap.get(channel);
    if (subscription) return Boolean(subscription.enabled);
    return defaults.includes(channel);
  });
}

/**
 * 组装"事件 × 渠道"完整矩阵（纯函数）
 *
 * 返回每一格的有效值与来源标记，页面不需要自己再算一遍回落逻辑。
 *
 * @param {object} options 输入
 * @param {Array} [options.preferences] 该用户的偏好行（plain object）
 * @param {Array} [options.subscriptions] 全局订阅行（plain object）
 * @returns {Array<{eventCode:string, channel:string, enabled:boolean, quietFrom:string|null, quietTo:string|null, configured:boolean}>}
 */
function buildUserMatrix({ preferences = [], subscriptions = [] } = {}) {
  const preferenceMap = new Map(preferences.map(row => [`${row.eventCode}|${row.channel}`, row]));
  const subscriptionMap = new Map(subscriptions.map(row => [`${row.eventCode}|${row.channel}`, row]));
  const rows = [];

  for (const event of NOTICE_EVENTS) {
    for (const channel of NOTICE_CHANNEL_IDS) {
      const key = `${event.code}|${channel}`;
      const preference = preferenceMap.get(key);
      const subscription = subscriptionMap.get(key);
      const fallback = Array.isArray(event.defaultChannels) && event.defaultChannels.includes(channel);

      rows.push({
        eventCode: event.code,
        channel,
        enabled: preference ? Boolean(preference.enabled) : subscription ? Boolean(subscription.enabled) : fallback,
        quietFrom: preference ? toMinuteText(preference.quietFrom) : null,
        quietTo: preference ? toMinuteText(preference.quietTo) : null,
        configured: Boolean(preference)
      });
    }
  }

  return rows;
}

/**
 * 读取某用户的偏好矩阵
 *
 * 一并返回渠道/事件目录：个人偏好页只需要登录，而 `/events`（管理侧）要求
 * `notice:config:read` —— 让普通用户为了渲染矩阵去打一个 403 的接口，
 * 页面就永远只能显示空表。目录本身不是敏感信息（渠道名与事件说明）。
 *
 * @param {number} userId 用户数字主键
 * @returns {Promise<{rows: Array, channels: Array, events: Array}>}
 */
async function listForUser(userId) {
  const [preferences, subscriptions] = await Promise.all([
    noticeCenterDao.listPreferences(userId),
    noticeCenterDao.listSubscriptions()
  ]);
  return {
    rows: buildUserMatrix({
      preferences: preferences.map(row => row.get({ plain: true })),
      subscriptions: subscriptions.map(row => row.get({ plain: true }))
    }),
    channels: NOTICE_CHANNELS.map(channel => ({
      id: channel.id,
      label: channel.label,
      implemented: channel.implemented
    })),
    events: NOTICE_EVENTS.map(event => ({
      code: event.code,
      label: event.label,
      description: event.description,
      defaultChannels: event.defaultChannels
    }))
  };
}

/**
 * 批量保存某用户的偏好
 *
 * 免打扰时段是**全局**的（页面上只有一组输入），因此由顶层字段统一下发，
 * 逐行落库 —— 表结构按 (user, event, channel) 存是为了发送时能一行读出，
 * 不代表允许每个格子有不同的免打扰时间。
 *
 * @param {number} userId 用户数字主键
 * @param {object} payload 请求体
 * @param {Array<{eventCode:string, channel:string, enabled:boolean}>} [payload.items] 偏好项
 * @param {string|null} [payload.quietFrom] 免打扰开始
 * @param {string|null} [payload.quietTo] 免打扰结束
 * @returns {Promise<{count: number}>}
 */
async function saveForUser(userId, { items, quietFrom, quietTo } = {}) {
  if (!Array.isArray(items)) throw new Error('items 必须是数组');
  if (items.length > 200) throw new Error('一次最多保存 200 条偏好');

  const start = normalizeQuietTime(quietFrom);
  const end = normalizeQuietTime(quietTo);
  if ((start === null) !== (end === null)) throw new Error('免打扰时段需要同时填写开始与结束时间');

  const rows = [];
  const seen = new Set();
  for (const item of items) {
    const eventCode = String(item?.eventCode || '');
    const channel = String(item?.channel || '');
    if (!getEvent(eventCode)) throw new Error(`未知事件: ${eventCode}`);
    if (!getChannel(channel)) throw new Error(`未知渠道: ${channel}`);
    if (typeof item.enabled !== 'boolean') throw new Error(`enabled 必须是布尔值: ${eventCode}/${channel}`);
    const key = `${eventCode}|${channel}`;
    if (seen.has(key)) throw new Error(`重复的偏好项: ${eventCode}/${channel}`);
    seen.add(key);
    rows.push({ userId, eventCode, channel, enabled: item.enabled, quietFrom: start, quietTo: end });
  }

  if (rows.length === 0) return { count: 0 };
  return { count: await noticeCenterDao.savePreferences(rows) };
}

export {
  normalizeQuietTime,
  toMinuteText,
  isQuietNow,
  resolveEnabledChannels,
  buildUserMatrix,
  listForUser,
  saveForUser
};
