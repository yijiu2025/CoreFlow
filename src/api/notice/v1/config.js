/**
 * OAuth2.1 应用配置
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import noticeDao from '../../../app/notice/dao/notice.js';
import emailService from '../../../framework/notice/services/email.js';

/** SMTP 授权码在读接口里的掩码形态（保存时命中此值 = 未修改，跳过更新） */
const SMTP_PASS_MASK = '******';

async function registerConfigRoutes(fastify, opts) {
  registerGroupMetadata({
    name: 'config',
    description: '通知配置管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['superadmin', 'notice_admin'] // 仅管理员可操作配置
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
   *
   * 🔴 SMTP 授权码**不回显**：读接口把 pass 替换为掩码（与 password 字段的
   * 常规处理一致）。真实值只在服务端发信时由 emailService 从 DAO 读取，
   * 前端永远不需要拿到明文 —— 否则管理面板的 XSS / 会话被盗会直接泄露邮箱凭据。
   */
  registerSecureRoute(fastify, {
    name: 'getConfig',
    alias: '获取通道配置',
    method: 'GET',
    url: '/config/:type',
    handler: async (request, reply) => {
      const { type } = request.params;
      const config = await noticeDao.getConfig(type);
      if (type === 'email' && config && typeof config.pass === 'string' && config.pass.length > 0) {
        return reply.result.success('获取成功', { ...config, pass: SMTP_PASS_MASK });
      }
      return reply.result.success('获取成功', config);
    }
  });

  /**
   * POST /config/:type — 保存特定通道的配置
   *
   * 掩码回写保护：前端把读到的表单原样提交时，pass 是掩码而不是新密码 ——
   * 此时不更新密码（保持库里真实值），只有用户显式输入了新值才落库。
   */
  registerSecureRoute(fastify, {
    name: 'saveConfig',
    alias: '更新通道配置',
    method: 'POST',
    url: '/config/:type',
    handler: async (request, reply) => {
      const { type } = request.params;
      const config = { ...(request.body || {}) };
      if (type === 'email' && config.pass === SMTP_PASS_MASK) {
        delete config.pass;
      }
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

      const success = await emailService.send(
        email,
        '通知中心测试邮件',
        '<p>这是一封来自系统的测试邮件，看到它说明您的 SMTP 配置已生效。</p>'
      );
      if (success) {
        return reply.result.success('测试邮件已发出，请注意查收');
      } else {
        return reply.result.fail('邮件发送失败，请检查配置');
      }
    }
  });
}

export default registerConfigRoutes;
