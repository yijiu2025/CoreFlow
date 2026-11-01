/**
 * 账号封禁管理接口（管理端）
 *
 * 落 /admin/user/v1/bans/*，继承 admin 域 system 级 requireLogin:true + allowRoles:['admin']。
 *
 * POST /admin/user/v1/bans/disable — 封禁（service 维度 + 时限/永久 + 可选阶梯等级）
 * POST /admin/user/v1/bans/untie   — 解封（可一次解多个 service）
 * GET  /admin/user/v1/bans/status  — 查询某用户某 service 的封禁状态
 *
 * 语义（见 framework/auth/ban.js）：
 * - 封 'login' 只阻止新登录，既有会话不自动失效；需立即全端下线时配合
 *   POST /admin/user/v1/sessions/kick-by-device 或 kick-all 系列操作。
 * - 封 'access' 在请求认证阶段拦截并吊销会话（≤30s 负缓存延迟）。
 * - time=-1 永久；到期 Redis TTL 自动解封。level 为阶梯处罚等级（业务自定义语义）。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import {
  disable,
  disableLevel,
  untieDisable,
  isDisable,
  getDisableTime,
  getDisableLevel
} from '../../../../framework/auth/ban.js';

async function registerBanRoutes(fastify) {
  registerGroupMetadata({
    name: 'userBansAdmin',
    alias: '账号封禁管理',
    description: 'service 维度账号封禁/解封/状态查询（admin）',
    prefix: '/user/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin']
  });

  /**
   * POST /admin/user/v1/bans/disable
   * body: { userId, service, time, reason?, level?, disableLevelFlag? }
   * time: 秒数或 -1（永久）；level>=1 且 disableLevelFlag=true 时走阶梯封禁
   */
  registerSecureRoute(fastify, {
    name: 'banUser',
    alias: '封禁账号',
    method: 'POST',
    url: '/bans/disable',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { userId, service, time, reason = '', level = 0, disableLevelFlag = false } = request.body || {};
      if (!userId || !service) {
        return reply.result.fail('userId / service 不能为空');
      }

      const operator = request.state?.user?.username || null;
      const info =
        disableLevelFlag && Number(level) >= 1
          ? await disableLevel(Number(userId), service, Number(level), Number(time), { reason, operator })
          : await disable(Number(userId), service, Number(time), { reason, level, operator });

      return reply.result.success('封禁成功', info);
    }
  });

  /**
   * POST /admin/user/v1/bans/untie
   * body: { userId, services: string[] }
   */
  registerSecureRoute(fastify, {
    name: 'untieUserBan',
    alias: '解封账号',
    method: 'POST',
    url: '/bans/untie',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { userId, services } = request.body || {};
      if (!userId || !Array.isArray(services) || services.length === 0) {
        return reply.result.fail('userId 与 services（非空数组）不能为空');
      }

      const count = await untieDisable(Number(userId), ...services);
      return reply.result.success(`已解封 ${count} 个服务维度`, { untied: count });
    }
  });

  /**
   * GET /admin/user/v1/bans/status?userId=&service=
   * 返回 { banned, level, remaining }（remaining: -2 未封禁 / -1 永久 / 秒数）
   */
  registerSecureRoute(fastify, {
    name: 'getUserBanStatus',
    alias: '查询封禁状态',
    method: 'GET',
    url: '/bans/status',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { userId, service } = request.query || {};
      if (!userId || !service) {
        return reply.result.fail('userId / service 不能为空');
      }

      const [banned, remaining, level] = await Promise.all([
        isDisable(Number(userId), service),
        getDisableTime(Number(userId), service),
        getDisableLevel(Number(userId), service)
      ]);
      return reply.result.success('获取成功', { banned, remaining, level });
    }
  });
}

export default registerBanRoutes;
