/**
 * 账号封禁管理接口（管理端）
 *
 * 落 /admin/user/v1/bans/*，继承 admin 域 system 级 requireLogin:true + allowRoles:['superadmin'/'admin_admin'/'admin_operator'(读接口另含 admin_viewer)]。
 *
 * POST /admin/user/v1/bans/disable — 封禁（service 维度 + 时限/永久 + 可选阶梯等级）
 * POST /admin/user/v1/bans/untie   — 解封（可一次解多个 service）
 * GET  /admin/user/v1/bans/status  — 查询某用户某 service 的封禁状态
 *
 * 语义（见 framework/auth/index.js）：
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
} from '../../../../framework/auth/index.js';

/**
 * userId 入参必须是数字主键（正整数）。
 * 🔴 ban 键形是 `${userId}:${service}`：传 uid/UUID 会被 Number() 转成 NaN，
 * 静默写 "NaN:service" 垃圾键——封禁看似成功实际无效。此处在校验层拦下，
 * 给管理端明确报错（framework 层 ban.js 写路径也加了断言，双保险）。
 */
function parseUserId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function registerBanRoutes(fastify) {
  registerGroupMetadata({
    name: 'userBansAdmin',
    alias: '账号封禁管理',
    description: 'service 维度账号封禁/解封/状态查询（admin）',
    prefix: '/user/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['superadmin', 'admin_admin', 'admin_operator']
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
    allowRoles: ['superadmin', 'admin_admin', 'admin_operator'],
    handler: async (request, reply) => {
      const { userId, service, time, reason = '', level = 0, disableLevelFlag = false } = request.body || {};
      if (!userId || !service) {
        return reply.result.fail('userId / service 不能为空');
      }
      const numericUserId = parseUserId(userId);
      if (!numericUserId) {
        return reply.result.fail('userId 必须是数字主键（正整数），不接受 uid/UUID');
      }

      const operator = request.state?.user?.username || null;
      const info =
        disableLevelFlag && Number(level) >= 1
          ? await disableLevel(numericUserId, service, Number(level), Number(time), { reason, operator })
          : await disable(numericUserId, service, Number(time), { reason, level, operator });

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
    allowRoles: ['superadmin', 'admin_admin', 'admin_operator'],
    handler: async (request, reply) => {
      const { userId, services } = request.body || {};
      if (!userId || !Array.isArray(services) || services.length === 0) {
        return reply.result.fail('userId 与 services（非空数组）不能为空');
      }
      const numericUserId = parseUserId(userId);
      if (!numericUserId) {
        return reply.result.fail('userId 必须是数字主键（正整数），不接受 uid/UUID');
      }

      const count = await untieDisable(numericUserId, ...services);
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
    allowRoles: ['superadmin', 'admin_admin', 'admin_operator', 'admin_viewer'],
    handler: async (request, reply) => {
      const { userId, service } = request.query || {};
      if (!userId || !service) {
        return reply.result.fail('userId / service 不能为空');
      }
      const numericUserId = parseUserId(userId);
      if (!numericUserId) {
        return reply.result.fail('userId 必须是数字主键（正整数），不接受 uid/UUID');
      }

      const [banned, remaining, level] = await Promise.all([
        isDisable(numericUserId, service),
        getDisableTime(numericUserId, service),
        getDisableLevel(numericUserId, service)
      ]);
      return reply.result.success('获取成功', { banned, remaining, level });
    }
  });
}

export default registerBanRoutes;
