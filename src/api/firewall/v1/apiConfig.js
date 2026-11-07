/**
 * Guard 安全配置中心路由
 *
 * GET   /            — 查询全域安全矩阵
 * PATCH /:system/:group — 热更新策略详情（任何运行时字段变更都需 step-up 票据）
 * POST  /toggle/:system/:group — 模块/接口一键开关（需 step-up 票据）
 * POST  /toggle-system/:system — 系统全局防御开关（同上）
 * POST  /stepup/challenge — 申请二次认证（发邮箱验证码 / 标记密码方式）
 * POST  /stepup/verify — 核验凭据并换取票据
 *
 * 业务逻辑见 app/guard/services/config.service.js 与 stepup.service.js。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-11-07 放宽方向改为二次认证 + 签名信封
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getAllGuardConfigs } from '../../guard-config.js';
import { updateConfig, toggleConfig, toggleSystemConfig } from '../../../app/guard/services/config.service.js';
import { createChallenge, verifyChallenge } from '../../../app/guard/services/stepup.service.js';
import { FIREWALL_PERMISSIONS } from '../../../app/firewall/permission/index.js';

/**
 * 从请求体里拆出 patch 与原因
 *
 * 兼容两种形态：
 * - 新前端：`{ patch: {...}, reason: '...' }`
 * - 老前端：整个 body 就是 patch（`{ allowRoles: [...] }`）
 *
 * 老形态仍然可用，但任何真正改动运行时字段的请求都会因为没有票据返回
 * `stepup_required`，前端据此引导用户走认证流程。
 *
 * @param {object} body
 * @returns {{patch:object, reason:string|undefined}}
 */
function splitBody(body) {
  const source = body && typeof body === 'object' ? body : {};
  const { patch, reason, ...flat } = source;
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    return { patch, reason };
  }
  return { patch: flat, reason };
}

async function registerApiConfigRoutes(fastify) {
  registerGroupMetadata({
    name: 'apiConfigs',
    alias: '安全配置中心',
    description: '负责全域安全策略的实时分发与热更新，仅限受信任的管理内网访问。',
    prefix: '/v1/apiconfigs',
    enabled: true,
    requireLogin: true,
    allowIps: [],
    // 这里**不能**靠 allowRoles 兜底：`allowRoles: []` 的语义是「不限制角色」，
    // 于是任何登录用户（哪怕零角色）都能改全域 Guard 策略。
    // 授权统一由 requirePermission 表达（见各路由），角色不限。
    allowRoles: [],
    // 端点级限频（组级默认）：安全配置读写，60 次/分钟
    rateLimit: { max: 60, timeWindow: '1 minute' }
  });

  registerSecureRoute(fastify, {
    name: 'getConfigs',
    alias: '查询全域安全矩阵',
    method: 'GET',
    url: '/',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.READ,
    handler: async (request, reply) => {
      return reply.result.success('操作成功', getAllGuardConfigs());
    }
  });

  registerSecureRoute(fastify, {
    name: 'updateConfig',
    alias: '热更新策略详情',
    method: 'PATCH',
    url: '/:system/:group',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.WRITE,
    schema: {
      params: {
        type: 'object',
        properties: { system: { type: 'string' }, group: { type: 'string' } }
      },
      querystring: { type: 'object', properties: { apiKey: { type: 'string' } } }
    },
    handler: async (request, reply) => {
      const { system, group } = request.params;
      const { apiKey } = request.query;
      // 注意：这里刻意不读 body 里的 reason。
      // 变更原因属于"被授权的内容"，只能来自 step-up 票据（认证时已校验，放宽时还写进了签名），
      // 从请求体再取一次等于给了调用方篡改审计理由的机会。
      const { patch } = splitBody(request.body);

      const result = await updateConfig({
        system,
        group,
        apiKey,
        patch,
        request,
        stepupToken: request.headers['x-stepup-token']
      });
      if (!result.ok) {
        return reply.result.fail(result.message, { code: result.code, changes: result.changes }, result.statusCode);
      }
      return reply.result.success('安全策略已更新', result.updated);
    }
  });

  registerSecureRoute(fastify, {
    name: 'toggleConfig',
    alias: '策略一键开关 (模块/接口)',
    method: 'POST',
    url: '/toggle/:system/:group',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.TOGGLE,
    handler: async (request, reply) => {
      const { system, group } = request.params;
      const { apiKey } = request.query;

      const result = await toggleConfig({
        system,
        group,
        apiKey,
        request,
        stepupToken: request.headers['x-stepup-token']
      });
      if (!result.ok) {
        return reply.result.fail(result.message, { code: result.code, changes: result.changes }, result.statusCode);
      }
      return reply.result.success('操作成功', { enabled: result.updated?.enabled });
    }
  });

  registerSecureRoute(fastify, {
    name: 'toggleSystemConfig',
    alias: '系统全局防御开关',
    method: 'POST',
    url: '/toggle-system/:system',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.TOGGLE,
    handler: async (request, reply) => {
      const { system } = request.params;

      const result = await toggleSystemConfig({
        system,
        request,
        stepupToken: request.headers['x-stepup-token']
      });
      if (!result.ok) {
        return reply.result.fail(result.message, { code: result.code, changes: result.changes }, result.statusCode);
      }
      return reply.result.success('操作成功', { enabled: result.updated?.enabled });
    }
  });

  registerSecureRoute(fastify, {
    name: 'createStepupChallenge',
    alias: '申请二次认证',
    method: 'POST',
    url: '/stepup/challenge',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.WRITE,
    // 发码是有外部副作用的动作，单独限频（不占用组级 60 次/分钟的额度）
    config: { rateLimit: { max: 10, timeWindow: '1 minute', groupId: 'apiConfigs-stepup-challenge' } },
    handler: async (request, reply) => {
      const body = request.body && typeof request.body === 'object' ? request.body : {};
      const { system, group, apiKey, patch, reason, method } = body;

      if (!system || !group || !patch || typeof patch !== 'object') {
        return reply.result.fail('缺少 system / group / patch', null, 400);
      }

      const result = await createChallenge({ system, group, apiKey, patch, reason, method, request });
      if (!result.ok) {
        return reply.result.fail(result.message, null, result.statusCode);
      }
      return reply.result.success('认证已发起', {
        challengeId: result.challengeId,
        method: result.method,
        path: result.path,
        maskedTarget: result.maskedTarget,
        expiresIn: result.expiresIn
      });
    }
  });

  registerSecureRoute(fastify, {
    name: 'verifyStepupChallenge',
    alias: '核验二次认证',
    method: 'POST',
    url: '/stepup/verify',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.WRITE,
    config: { rateLimit: { max: 20, timeWindow: '1 minute', groupId: 'apiConfigs-stepup-verify' } },
    handler: async (request, reply) => {
      const body = request.body && typeof request.body === 'object' ? request.body : {};
      const { challengeId, code, password } = body;

      const result = await verifyChallenge({ challengeId, code, password, request });
      if (!result.ok) {
        return reply.result.fail(result.message, null, result.statusCode);
      }
      return reply.result.success('认证通过', {
        ticket: result.ticket,
        expiresIn: result.expiresIn,
        method: result.method
      });
    }
  });
}

export default registerApiConfigRoutes;
