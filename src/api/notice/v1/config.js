import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import noticeDao from '../../../notice/dao/notice.js';
import emailService from '../../../notice/services/email.js';

export default async function (fastify, opts) {
  registerGroupMetadata({
    name: 'config',
    description: '通知配置管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin'] // 仅管理员可操作配置
  });

  /**
   * GET /channels — 获取所有通知通道状态
   */
  registerSecureRoute(fastify, {
    name: 'getChannels',
    alias: '获取通知通道列表',
    method: 'GET',
    url: '/channels',
    handler: async (request, reply) => {
      const channels = await noticeDao.getAvailableChannels();
      return reply.result.success('获取成功', channels);
    }
  });

  /**
   * GET /config/:type — 获取特定通道的配置
   */
  registerSecureRoute(fastify, {
    name: 'getConfig',
    alias: '获取通道配置',
    method: 'GET',
    url: '/config/:type',
    handler: async (request, reply) => {
      const { type } = request.params;
      const config = await noticeDao.getConfig(type);
      return reply.result.success('获取成功', config);
    }
  });

  /**
   * POST /config/:type — 保存特定通道的配置
   */
  registerSecureRoute(fastify, {
    name: 'saveConfig',
    alias: '更新通道配置',
    method: 'POST',
    url: '/config/:type',
    handler: async (request, reply) => {
      const { type } = request.params;
      const config = request.body;
      await noticeDao.saveConfig(type, config);
      return reply.result.success('配置已保存');
    }
  });

  /**
   * POST /test-email — 测试邮件发送
   */
  registerSecureRoute(fastify, {
    name: 'testEmail',
    alias: '测试邮件发送',
    method: 'POST',
    url: '/test-email',
    handler: async (request, reply) => {
      const { email } = request.body;
      if (!email) return reply.result.fail('邮箱不能为空');
      
      const success = await emailService.send(email, '通知中心测试邮件', '<p>这是一封来自系统的测试邮件，看到它说明您的 SMTP 配置已生效。</p>');
      if (success) {
        return reply.result.success('测试邮件已发出，请注意查收');
      } else {
        return reply.result.fail('邮件发送失败，请检查配置');
      }
    }
  });
}
