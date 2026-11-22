/**
 * OAuth2.1 应用配置
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import noticeDao from '../../../app/notice/dao/notice.js';
import emailService from '../../../framework/support/notice/services/email.js';
import { getChannel, getChannelSecretKeys } from '../../../app/notice/constants.js';
import { NOTICE_PERMISSIONS } from '../../../app/notice/permission/index.js';

/** 凭据字段在读接口里的掩码形态（保存时命中此值 = 未修改，跳过更新） */
const SMTP_PASS_MASK = '******';

/**
 * 掩码渠道配置里的凭据字段
 *
 * 字段清单来自 `constants.js`：新增一个 secret 字段时只改常量，读接口自动跟上。
 * 逐个渠道手写 `if (type === 'email')` 会在第二个渠道接入时漏掉一个字段。
 *
 * @param {string} type 渠道 id
 * @param {object} config 配置对象
 * @returns {object} 掩码后的副本
 */
function maskSecrets(type, config) {
  if (!config || typeof config !== 'object') return config;
  const masked = { ...config };
  for (const key of getChannelSecretKeys(type)) {
    if (typeof masked[key] === 'string' && masked[key].length > 0) masked[key] = SMTP_PASS_MASK;
  }
  return masked;
}

async function registerConfigRoutes(fastify, opts) {
  registerGroupMetadata({
    name: 'config',
    description: '通知配置管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: true,
    /*
     * 不再写死 `allowRoles: ['superadmin', 'notice_admin']`：权限模型是"谁持码谁可管"，
     * 写死角色会让"只授了 notice:config:read 的运维"在路由守卫放行之后仍被组拦下 ——
     * 页面能看见、接口全 403，看不出是哪一层拒的。角色层面的准入由 PBAC 策略决定，
     * 这里只做能力码校验（`*` 仍覆盖超管）。
     */
    allowRoles: []
  });

  /**
   * GET /channels — 获取所有通知通道状态
   */
  registerSecureRoute(fastify, {
    name: 'getChannels',
    alias: '获取通知通道列表',
    method: 'GET',
    url: '/channels',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.CONFIG.READ,
    handler: async (request, reply) => {
      const channels = await noticeDao.getAvailableChannels();
      return reply.result.success('获取成功', channels);
    }
  });

  /**
   * GET /config/:type — 获取特定通道的配置
   *
   * 🔴 凭据字段**不回显**：读接口把它们替换为掩码（清单见 constants.js 的 secret 字段）。
   * 真实值只在服务端发信时由 DAO 读取，前端永远不需要拿到明文 —— 否则管理面板的
   * XSS / 会话被盗会直接泄露邮箱凭据。
   */
  registerSecureRoute(fastify, {
    name: 'getConfig',
    alias: '获取通道配置',
    method: 'GET',
    url: '/config/:type',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.CONFIG.READ,
    handler: async (request, reply) => {
      const { type } = request.params;
      if (!getChannel(type)) return reply.result.fail(`未知通知通道: ${type}`);

      const config = await noticeDao.getConfig(type);
      return reply.result.success('获取成功', maskSecrets(type, config));
    }
  });

  /**
   * POST /config/:type — 保存特定通道的配置
   *
   * 掩码回写保护：前端把读到的表单原样提交时，凭据是掩码而不是新密码 ——
   * 此时不更新（保持库里真实值），只有用户显式输入了新值才落库。
   */
  registerSecureRoute(fastify, {
    name: 'saveConfig',
    alias: '更新通道配置',
    method: 'POST',
    url: '/config/:type',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.CONFIG.UPDATE,
    handler: async (request, reply) => {
      const { type } = request.params;
      if (!getChannel(type)) return reply.result.fail(`未知通知通道: ${type}`);

      try {
        await noticeDao.saveConfig(type, { ...(request.body || {}) });
        return reply.result.success('配置已保存');
      } catch (err) {
        return reply.result.fail(err.message || '配置保存失败');
      }
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
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.CONFIG.UPDATE,
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
