/**
 * 通知发送记录接口
 *
 * GET /notice/v1/logs?status=&pageNum=&pageSize= —— 按时间倒序分页
 *
 * 记录里只有"结果"，没有正文：正文可能含验证码/邮箱等内容，落库等于多一处泄漏面。
 * 事件与渠道显示名由常量在**读时**补上，日志表不冗余存 label —— 改名后历史记录
 * 也会跟着显示新名字，不会出现两套叫法。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { NOTICE_PERMISSIONS } from '../../../app/notice/permission/index.js';
import noticeCenterDao from '../../../app/notice/dao/notice-center.dao.js';
import { getChannel, getEvent } from '../../../app/notice/constants.js';

/** 允许筛选的投递状态（与模型注释一致） */
const LOG_STATUSES = ['sent', 'failed'];

async function registerLogRoutes(fastify) {
  registerGroupMetadata({
    name: 'noticeLogs',
    alias: '通知发送记录',
    description: '投递结果审计',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'noticeListLogs',
    alias: '发送记录列表',
    method: 'GET',
    url: '/logs',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.CONFIG.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: LOG_STATUSES },
          pageNum: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const { status, pageNum = 1, pageSize = 20 } = request.query;
      const { rows, total } = await noticeCenterDao.pageDeliveryLogs({ status, pageNum, pageSize });

      const data = rows.map(row => {
        const plain = row.get({ plain: true });
        return {
          id: plain.id,
          eventCode: plain.eventCode,
          eventLabel: getEvent(plain.eventCode)?.label || plain.eventCode,
          channel: plain.channel,
          channelLabel: getChannel(plain.channel)?.label || plain.channel,
          userId: plain.userId,
          target: plain.target,
          status: plain.status,
          error: plain.error,
          createdAt: plain.createdAt
        };
      });

      return reply.result.success('获取成功', { rows: data, total, pageNum, pageSize });
    }
  });
}

export default registerLogRoutes;
