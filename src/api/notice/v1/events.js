/**
 * 通知事件与全局订阅接口
 *
 * GET /notice/v1/events         —— 事件清单 + 每个事件的渠道默认开关
 * PUT /notice/v1/events/:code   —— 保存某事件的全局默认渠道
 *
 * 全局订阅是「用户没设置过」时的默认值，不是强制值：用户在个人偏好里显式关闭
 * 仍然优先。接口同时返回渠道清单（id / 名称 / 是否接入），前端不需要再维护一份。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { NOTICE_PERMISSIONS } from '../../../app/notice/permission/index.js';
import noticeCenterDao from '../../../app/notice/dao/notice-center.dao.js';
import { NOTICE_CHANNELS, NOTICE_EVENTS, getChannel, getEvent } from '../../../app/notice/constants.js';

/**
 * 组装接口返回的事件行
 *
 * @param {object} event 事件定义
 * @param {Map<string, boolean>} subscriptionMap `eventCode|channel` → 是否开启
 * @returns {object} 事件 + subscriptions 映射
 */
function serializeEvent(event, subscriptionMap) {
  const subscriptions = {};
  for (const channel of NOTICE_CHANNELS) {
    const key = `${event.code}|${channel.id}`;
    subscriptions[channel.id] = subscriptionMap.has(key)
      ? subscriptionMap.get(key)
      : event.defaultChannels.includes(channel.id);
  }
  return {
    code: event.code,
    label: event.label,
    description: event.description,
    defaultChannels: event.defaultChannels,
    subscriptions
  };
}

/**
 * 读取全部全局订阅（`eventCode|channel` → enabled）
 *
 * @returns {Promise<Map<string, boolean>>}
 */
async function loadSubscriptionMap() {
  const rows = await noticeCenterDao.listSubscriptions();
  const map = new Map();
  for (const row of rows) {
    const plain = row.get({ plain: true });
    map.set(`${plain.eventCode}|${plain.channel}`, Boolean(plain.enabled));
  }
  return map;
}

async function registerEventRoutes(fastify) {
  registerGroupMetadata({
    name: 'noticeEvents',
    alias: '通知事件订阅',
    description: '事件清单与全局默认渠道',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'noticeListEvents',
    alias: '事件与默认订阅',
    method: 'GET',
    url: '/events',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.CONFIG.READ,
    handler: async (request, reply) => {
      const subscriptionMap = await loadSubscriptionMap();
      return reply.result.success('获取成功', {
        channels: NOTICE_CHANNELS.map(channel => ({
          id: channel.id,
          label: channel.label,
          implemented: channel.implemented
        })),
        events: NOTICE_EVENTS.map(event => serializeEvent(event, subscriptionMap))
      });
    }
  });

  registerSecureRoute(fastify, {
    name: 'noticeSaveEventSubscriptions',
    alias: '保存事件默认渠道',
    method: 'PUT',
    url: '/events/:code',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.CONFIG.UPDATE,
    schema: {
      params: { type: 'object', required: ['code'], properties: { code: { type: 'string', maxLength: 64 } } },
      body: {
        type: 'object',
        required: ['subscriptions'],
        properties: {
          subscriptions: {
            type: 'object',
            additionalProperties: { type: 'boolean' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      const event = getEvent(request.params.code);
      if (!event) return reply.result.fail(`未知事件: ${request.params.code}`);

      const entries = Object.entries(request.body.subscriptions || {});
      if (entries.length === 0) return reply.result.fail('没有需要保存的渠道');

      for (const [channel, enabled] of entries) {
        if (!getChannel(channel)) return reply.result.fail(`未知渠道: ${channel}`);
        await noticeCenterDao.saveSubscription(event.code, channel, enabled);
      }

      const subscriptionMap = await loadSubscriptionMap();
      return reply.result.success('已保存', serializeEvent(event, subscriptionMap));
    }
  });
}

export default registerEventRoutes;
