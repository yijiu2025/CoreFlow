/**
 * 通知投递服务
 *
 * 一条铁律：**本服务不向调用方抛异常**。通知是"业务成功之后的副作用"，
 * 发信失败不能把注册/停用等主流程拖垮；所有失败只落 `notice_delivery_logs`，
 * 由管理页的「发送记录」回答"为什么没收到"。
 *
 * 决策顺序（与个人偏好页的展示口径完全一致）：
 *   个人偏好 → 全局订阅 → 事件常量 defaultChannels
 * 行不存在表示"跟随上一层"，不是关闭 —— 这与 `preference.service` 共用
 * `resolveEnabledChannels`，避免两处各写一份回落逻辑。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import Logger from '../../../framework/support/log/index.js';
import emailService from '../../../framework/support/notice/services/email.js';
import noticeCenterDao from '../dao/notice-center.dao.js';
import { getEvent, isChannelImplemented } from '../constants.js';
import { isQuietNow, resolveEnabledChannels } from './preference.service.js';
import { escapeHtml, findForEvent, renderHtml, renderTemplate } from './template.service.js';

/** 单次请求最多处理的接收人数量：再大应拆批，避免长时间占住连接与 SMTP 队列 */
const MAX_RECIPIENTS = 200;

/**
 * 生成投递计划（纯函数）
 *
 * 只决定"给谁、走哪个渠道、要不要跳过"，不做渲染与发送 —— 这样偏好回落的
 * 判据可以被单测直接钉住，不需要数据库或 SMTP。
 *
 * @param {object} options 输入
 * @param {object} options.event 事件定义
 * @param {number[]} [options.userIds] 接收人数字主键
 * @param {Array<{userId:number,channel:string,enabled:boolean,quietFrom:string|null,quietTo:string|null}>} [options.preferences] 偏好行
 * @param {Array<{channel:string,enabled:boolean}>} [options.subscriptions] 全局订阅行
 * @param {Date} [options.now] 当前时间（测试注入）
 * @returns {Array<{userId:number, channel:string, implemented:boolean, quiet:boolean}>}
 */
function buildDeliveries({ event, userIds = [], preferences = [], subscriptions = [], now = new Date() }) {
  const preferencesByUser = new Map();
  for (const row of preferences) {
    const bucket = preferencesByUser.get(row.userId) || [];
    bucket.push(row);
    preferencesByUser.set(row.userId, bucket);
  }

  const deliveries = [];
  for (const userId of userIds) {
    const rows = preferencesByUser.get(userId) || [];
    for (const channel of resolveEnabledChannels(event, rows, subscriptions)) {
      const preference = rows.find(row => row.channel === channel);
      deliveries.push({
        userId,
        channel,
        implemented: isChannelImplemented(channel),
        quiet: Boolean(preference && isQuietNow(preference.quietFrom, preference.quietTo, now))
      });
    }
  }
  return deliveries;
}

/**
 * 通过指定渠道发送一条消息
 *
 * 未接入的渠道返回 `通道未接入` 而不是静默成功：调用方（send）据此写 failed 日志，
 * 管理页能看出"配置了但平台还没接"，而不是以为已经发出去了。
 *
 * @param {string} channel 渠道 id
 * @param {object} message 消息
 * @param {string} message.target 收件地址
 * @param {string} message.subject 标题
 * @param {string} message.body HTML 正文
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function sendViaChannel(channel, { target, subject, body }) {
  if (!isChannelImplemented(channel)) return { ok: false, error: '通道未接入' };

  try {
    if (channel === 'email') {
      const ok = await emailService.send(target, subject, body);
      return ok ? { ok: true } : { ok: false, error: '邮件发送失败，请检查 SMTP 配置与网络' };
    }
    return { ok: false, error: '通道未接入' };
  } catch (err) {
    return { ok: false, error: err?.message || '发送异常' };
  }
}

/**
 * 写投递日志（失败不外抛）
 *
 * 日志写入失败只记应用日志：它不能反过来让一次已经成功的发送变成失败。
 *
 * @param {object} entry 日志字段
 * @returns {Promise<void>}
 */
async function writeLog(entry) {
  try {
    await noticeCenterDao.createDeliveryLog({
      userId: entry.userId ?? null,
      target: entry.target ? String(entry.target).slice(0, 200) : null,
      status: entry.status,
      error: entry.error ? String(entry.error).slice(0, 500) : null,
      eventCode: entry.eventCode,
      channel: entry.channel
    });
  } catch (err) {
    Logger.error(`[Notice:Delivery] 投递日志写入失败: ${err.message}`);
  }
}

/**
 * 生成兜底正文
 *
 * 没有模板时仍然发送：管理员还没配模板是很正常的状态，静默失败会让"通知中心"
 * 看起来完全没上线。兜底正文只放事件说明与 payload 的 JSON（已转义）。
 *
 * @param {object} event 事件定义
 * @param {object} payload 变量
 * @returns {{subject: string, body: string}}
 */
function fallbackMessage(event, payload) {
  const data = payload && Object.keys(payload).length > 0 ? JSON.stringify(payload, null, 2) : '';
  return {
    subject: `[${event.label}]`,
    body: `<p>${escapeHtml(event.description || event.label)}</p>${
      data ? `<pre style="white-space:pre-wrap;">${escapeHtml(data)}</pre>` : ''
    }`
  };
}

/**
 * 批量投递
 *
 * @param {object} request 投递请求
 * @param {string} request.eventCode 事件 code
 * @param {number[]} [request.userIds] 接收人数字主键
 * @param {object} [request.payload] 模板变量
 * @returns {Promise<{eventCode: string, total: number, sent: number, failed: number, skipped: number, error?: string}>}
 */
async function send({ eventCode, userIds = [], payload = {} } = {}) {
  const summary = { eventCode, total: 0, sent: 0, failed: 0, skipped: 0 };

  const event = getEvent(eventCode);
  if (!event) {
    Logger.warn(`[Notice:Delivery] 忽略未知事件: ${eventCode}`);
    return { ...summary, error: `未知事件: ${eventCode}` };
  }

  const recipients = [
    ...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter(id => Number.isInteger(id) && id > 0))
  ].slice(0, MAX_RECIPIENTS);
  if (recipients.length === 0) return { ...summary, error: 'userIds 为空' };

  try {
    // 用户联系方式与全局订阅各查一次；个人偏好按人查（一次性把所有用户的偏好拉回来
    // 需要 "user_id IN (...)" 的专用查询，而这里的批次上限只有 200，逐人查更直观）
    const [users, subscriptionRows] = await Promise.all([
      noticeCenterDao.findUserContacts(recipients),
      noticeCenterDao.listSubscriptions(eventCode)
    ]);

    const userMap = new Map(users.map(user => [Number(user.id), user]));
    const subscriptionPlain = subscriptionRows.map(row => row.get({ plain: true }));
    const templateCache = new Map();

    for (const userId of recipients) {
      const preferences = (await noticeCenterDao.listPreferences(userId, eventCode)).map(row =>
        row.get({ plain: true })
      );
      const deliveries = buildDeliveries({
        event,
        userIds: [userId],
        preferences,
        subscriptions: subscriptionPlain
      });
      const user = userMap.get(userId);
      const target = user?.email || '';

      for (const delivery of deliveries) {
        summary.total += 1;

        if (delivery.quiet) {
          summary.skipped += 1;
          continue;
        }

        if (!delivery.implemented) {
          summary.failed += 1;
          await writeLog({
            eventCode,
            channel: delivery.channel,
            userId,
            target,
            status: 'failed',
            error: '通道未接入'
          });
          continue;
        }

        if (!user) {
          summary.failed += 1;
          await writeLog({
            eventCode,
            channel: delivery.channel,
            userId,
            target,
            status: 'failed',
            error: '接收人不存在或已注销'
          });
          continue;
        }

        if (!target) {
          summary.failed += 1;
          await writeLog({
            eventCode,
            channel: delivery.channel,
            userId,
            target,
            status: 'failed',
            error: '接收人没有可用的收件地址'
          });
          continue;
        }

        let message;
        try {
          if (!templateCache.has(delivery.channel)) {
            templateCache.set(delivery.channel, await findForEvent(eventCode, delivery.channel));
          }
          const template = templateCache.get(delivery.channel);
          message = template
            ? {
                subject: renderTemplate(template.subject || '', payload) || `[${event.label}]`,
                body: renderHtml(template.body, payload)
              }
            : fallbackMessage(event, payload);
        } catch (err) {
          summary.failed += 1;
          await writeLog({
            eventCode,
            channel: delivery.channel,
            userId,
            target,
            status: 'failed',
            error: err.message
          });
          continue;
        }

        const result = await sendViaChannel(delivery.channel, { target, ...message });
        if (result.ok) {
          summary.sent += 1;
          await writeLog({ eventCode, channel: delivery.channel, userId, target, status: 'sent' });
        } else {
          summary.failed += 1;
          await writeLog({
            eventCode,
            channel: delivery.channel,
            userId,
            target,
            status: 'failed',
            error: result.error
          });
        }
      }
    }
  } catch (err) {
    // 兜底：DAO / 模型未迁移等异常也不能打断调用方
    Logger.error(`[Notice:Delivery] 投递流程异常 (${eventCode}): ${err.message}`);
    summary.error = err.message;
  }

  return summary;
}

export { MAX_RECIPIENTS, buildDeliveries, sendViaChannel, fallbackMessage, send };
