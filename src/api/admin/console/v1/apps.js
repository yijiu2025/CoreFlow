/**
 * 应用管理接口
 *
 * GET    /admin/console/v1/apps                      —— 应用清单 + 授权数据规模 + 接口开关统计
 * GET    /admin/console/v1/apps/:appId/apis          —— 该应用的接口树（系统 / 模块 / 接口）
 * POST   /admin/console/v1/apps/:appId/apis/toggle   —— 切换某个节点的启用状态
 * PATCH  /admin/console/v1/apps/:appId/apis          —— 改节点字段（描述 / 白名单 / 是否要求登录）
 * POST   /admin/console/v1/apps/:appId/apis/stepup/challenge —— 申请二次认证（发邮箱验证码）
 * POST   /admin/console/v1/apps/:appId/apis/stepup/verify    —— 核验并换取票据
 * GET    /admin/console/v1/apps/switch-policy        —— 二次验证策略（是否要求票据）
 * PUT    /admin/console/v1/apps/switch-policy        —— 调整策略（**仅超管**）
 *
 * === 应用本身为什么只读 ===
 * 应用是**代码声明**的：一个应用 = `src/app/<app>/config.js`（app_id / 准入策略 / 默认角色）
 * + `src/api/<system>/system.json`（路由前缀与所属应用）。增删改都意味着加目录、改代码、
 * 重启，不是表单能表达的操作；而 `default_role` / `access` 一旦被随手改，后果是
 * "后台对所有人敞开"或"谁都进不来"——那必须走代码评审。
 *
 * === 接口开关为什么可写 ===
 * 它写的是 `guard_configs`（运行期配置，本来就有热改与审计），不是代码声明。
 * 但写入**不直接调 `setGuardConfig`**：必须经 `app/guard/services/config.service.js`，
 * 那里才有二次验证票据消费与放宽签名 —— 否则"关掉能开回来"就断了。
 *
 * 🔴 按应用授权：页面入口 `admin:app:read`；每个应用一个管理码
 *    `admin:app:<appId>:manage`。清单、接口树、开关三处都按它收口。
 *
 * 🔴 接口树的"归属"有两级：`app_id`（会话归属，私有 API 才写）与 `owner_app_id`
 *    （管理归属，共享 API 也写）。只写后者时，系统能在本页开关，但不参与
 *    `SESSION_APP_MISMATCH` 校验 —— 登录/授权类接口必须这样处理。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { syncGuardConfigFromDb } from '../../../guard-config.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import { listAppsOverview, canManageApp } from '../../../../app/admin/console/services/app-overview.service.js';
import {
  listAppSystems,
  toggleAppNode,
  updateAppNode,
  countAppApis,
  togglePatchOf
} from '../../../../app/guard/services/app-api.service.js';
import { createChallenge, verifyChallenge } from '../../../../app/guard/services/stepup.service.js';
import { getApiSwitchPolicy, setApiSwitchPolicy } from '../../../../app/guard/services/app-switch-policy.service.js';
import { isSuperAdmin } from '../../../../app/guard/services/authority.js';
import { withFail } from '../../../../app/admin/console/utils/respond.js';

/**
 * 断言操作者能管理该应用
 *
 * 路由级的 `requirePermission` 是静态的，而这里要按 appId 动态判定，
 * 所以放在 handler 里（与 roles / users 的 `assertCanManageUser` 同一模式）。
 *
 * @param {object} user `request.state.user`
 * @param {string} appId 应用标识
 * @throws {Error} 无权时抛出 403
 */
function assertCanManageApp(user, appId) {
  if (!canManageApp(user, appId)) {
    throw new Error(`FORBIDDEN:没有应用 ${appId} 的管理权限`);
  }
}

/** 接口树节点的可写字段（其余字段由守卫配置自己维护） */
const nodePatchSchema = {
  type: 'object',
  properties: {
    description: { type: 'string', maxLength: 255 },
    requireLogin: { type: 'boolean' },
    allowIps: { type: 'array', items: { type: 'string', maxLength: 64 }, maxItems: 50 },
    allowRoles: { type: 'array', items: { type: 'string', maxLength: 64 }, maxItems: 50 }
  },
  additionalProperties: false
};

async function registerAppRoutes(fastify) {
  registerGroupMetadata({
    name: 'adminApp',
    alias: '应用管理',
    description: '应用清单、授权数据规模与接口开关',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'adminAppSwitchPolicy',
    alias: '接口开关二次验证策略',
    method: 'GET',
    url: '/apps/switch-policy',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.APP.READ,
    /* 保护性接口：关掉它，应用管理与接口开关本身就打不开了 */
    critical: true,
    handler: withFail(async (request, reply) => {
      const policy = getApiSwitchPolicy();
      /* `canEdit` 决定前端要不要渲染那个开关：只有超管能改，普通应用管理员只读 */
      return reply.result.success('获取成功', { ...policy, canEdit: isSuperAdmin(request.state.user) });
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminAppSwitchPolicyUpdate',
    alias: '调整接口开关二次验证策略',
    method: 'PUT',
    url: '/apps/switch-policy',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.APP.READ,
    /* 保护性接口：关掉它，应用管理与接口开关本身就打不开了 */
    critical: true,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['requireStepUp'],
        properties: { requireStepUp: { type: 'boolean' } },
        additionalProperties: false
      }
    },
    handler: withFail(async (request, reply) => {
      const res = await setApiSwitchPolicy({
        requireStepUp: request.body.requireStepUp,
        actor: request.state.user,
        request
      });
      if (!res.ok) {
        return reply
          .code(res.statusCode || 400)
          .send({ code: res.statusCode || 400, message: res.message, data: null });
      }
      return reply.result.success('策略已更新', res.policy);
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminAppList',
    alias: '应用列表',
    method: 'GET',
    url: '/apps',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.APP.READ,
    /* 保护性接口：关掉它，应用管理与接口开关本身就打不开了 */
    critical: true,
    handler: withFail(async (request, reply) => {
      /*
       * 把操作者传进服务层：只返回**他有管理码**的应用（`admin:app:<appId>:manage`）。
       * 过滤放在数据源这一侧，前端拿到的就是"你能管的那些"，不需要再判一次。
       */
      const apps = await listAppsOverview(request.state.user);
      /*
       * 列表页也要显示"接口 N 个 / N 个已关闭"，同样先与 DB 对账一次（理由见 `GET /apis`）。
       * 这里是整页数据的入口，对一次账让下面的统计与抽屉里的树同源。
       */
      await syncGuardConfigFromDb();
      /* 接口开关统计在这里合并：服务层在 admin 域，接口树在 guard 域，两者不在同层 */
      const withApis = apps.map(app => ({ ...app, apis: countAppApis(app.appId) }));
      return reply.result.success('获取成功', { apps: withApis, total: withApis.length });
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminAppApis',
    alias: '应用接口树',
    method: 'GET',
    url: '/apps/:appId/apis',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.APP.READ,
    /* 保护性接口：关掉它，应用管理与接口开关本身就打不开了 */
    critical: true,
    handler: withFail(async (request, reply) => {
      const appId = String(request.params.appId || '');
      assertCanManageApp(request.state.user, appId);

      /*
       * 🔴 读之前**先跟 DB 对一次账**。
       *
       * 守卫配置的运行期真相在内存（请求期判定要零 IO），DB 是持久层；多实例之间靠
       * `startGuardConfigSync` 每 30s 轮询对齐。于是"在 A 实例改、在 B 实例看"最多有
       * 30s 的窗口 —— 对一张运维开关表，看到旧状态再去点一下，等于用错误的当前值做决策
       * （后端按"取反"执行，结果正好相反）。
       *
       * `syncGuardConfigFromDb()` 只做版本号比对（一行一查、无变更不做深合并），
       * 开销远小于"每秒轮询"，所以放在**打开页面的那一刻**做一次是对的。
       */
      await syncGuardConfigFromDb();

      const systems = listAppSystems(appId);
      return reply.result.success('获取成功', { appId, systems, total: systems.length });
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminAppApiToggle',
    alias: '切换接口开关',
    method: 'POST',
    url: '/apps/:appId/apis/toggle',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.APP.READ,
    /* 保护性接口：关掉它，应用管理与接口开关本身就打不开了 */
    critical: true,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['systemKey'],
        properties: {
          systemKey: { type: 'string', minLength: 1, maxLength: 64 },
          groupKey: { type: 'string', maxLength: 64 },
          apiKey: { type: 'string', maxLength: 128 },
          /** 二次验证票据：关闭与重开都要求（防止误关/越权放宽） */
          stepupToken: { type: 'string', maxLength: 512 }
        },
        additionalProperties: false
      }
    },
    handler: withFail(async (request, reply) => {
      const appId = String(request.params.appId || '');
      assertCanManageApp(request.state.user, appId);

      const res = await toggleAppNode({
        appId,
        systemKey: request.body.systemKey,
        groupKey: request.body.groupKey || null,
        apiKey: request.body.apiKey || null,
        request,
        /* 票据优先取 header（与旧面板一致），body 兼容旧前端 */
        stepupToken: request.headers['x-stepup-token'] || request.body.stepupToken || null
      });

      if (!res.ok) {
        /* `stepup_required` 要原样告诉前端"去走二次验证"，不能糊成 403 */
        if (res.code === 'stepup_required' || res.statusCode === 428) {
          return reply.code(409).send({
            code: 409,
            message: res.message || '该操作需要二次验证',
            data: { reason: 'stepup_required', changes: res.changes || [] }
          });
        }
        return reply.code(res.statusCode || 400).send({
          code: res.statusCode || 400,
          message: res.message || '切换失败',
          data: null
        });
      }

      return reply.result.success('已切换', { enabled: res.enabled });
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminAppApiUpdate',
    alias: '编辑接口配置',
    method: 'PATCH',
    url: '/apps/:appId/apis',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.APP.READ,
    /* 保护性接口：关掉它，应用管理与接口开关本身就打不开了 */
    critical: true,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['systemKey', 'patch'],
        properties: {
          systemKey: { type: 'string', minLength: 1, maxLength: 64 },
          groupKey: { type: 'string', maxLength: 64 },
          apiKey: { type: 'string', maxLength: 128 },
          stepupToken: { type: 'string', maxLength: 512 },
          patch: nodePatchSchema
        },
        additionalProperties: false
      }
    },
    handler: withFail(async (request, reply) => {
      const appId = String(request.params.appId || '');
      assertCanManageApp(request.state.user, appId);

      const res = await updateAppNode({
        appId,
        systemKey: request.body.systemKey,
        groupKey: request.body.groupKey || null,
        apiKey: request.body.apiKey || null,
        patch: request.body.patch,
        request,
        stepupToken: request.headers['x-stepup-token'] || request.body.stepupToken || null
      });

      if (!res.ok) {
        if (res.code === 'stepup_required' || res.statusCode === 428) {
          return reply.code(409).send({
            code: 409,
            message: res.message || '该操作需要二次验证',
            data: { reason: 'stepup_required', changes: res.changes || [] }
          });
        }
        return reply.code(res.statusCode || 400).send({
          code: res.statusCode || 400,
          message: res.message || '保存失败',
          data: null
        });
      }

      return reply.result.success('已保存', { node: res.node });
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminAppApiStepUpChallenge',
    alias: '接口开关二次认证',
    method: 'POST',
    url: '/apps/:appId/apis/stepup/challenge',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.APP.READ,
    /* 保护性接口：关掉它，应用管理与接口开关本身就打不开了 */
    critical: true,
    // 发码有外部副作用，单独限频
    config: { rateLimit: { max: 10, timeWindow: '1 minute', groupId: 'adminAppStepupChallenge' } },
    schema: {
      body: {
        type: 'object',
        required: ['systemKey', 'action'],
        properties: {
          systemKey: { type: 'string', minLength: 1, maxLength: 64 },
          groupKey: { type: 'string', maxLength: 64 },
          apiKey: { type: 'string', maxLength: 128 },
          /** `toggle` = 由服务端按当前状态算 patch；`patch` = 用 body.patch 原样 */
          action: { type: 'string', enum: ['toggle', 'patch'] },
          patch: nodePatchSchema,
          reason: { type: 'string', maxLength: 200 },
          method: { type: 'string', enum: ['email', 'password'] }
        },
        additionalProperties: false
      }
    },
    handler: withFail(async (request, reply) => {
      const appId = String(request.params.appId || '');
      assertCanManageApp(request.state.user, appId);

      const body = request.body;
      let patch = body.patch;
      if (body.action === 'toggle') {
        /* 🔴 patch 必须由服务端按当前状态算：票据绑定 patchHash，前端算的会过期失配 */
        const computed = togglePatchOf({
          appId,
          systemKey: body.systemKey,
          groupKey: body.groupKey || null,
          apiKey: body.apiKey || null
        });
        if (!computed.ok) {
          return reply.code(computed.statusCode || 400).send({
            code: computed.statusCode || 400,
            message: computed.message,
            data: null
          });
        }
        patch = computed.patch;
      }
      if (!patch || typeof patch !== 'object') {
        return reply.code(400).send({ code: 400, message: '缺少变更内容', data: null });
      }

      const res = await createChallenge({
        system: body.systemKey,
        group: body.groupKey || null,
        apiKey: body.apiKey || null,
        patch,
        reason: body.reason,
        method: body.method,
        request
      });
      if (!res.ok) {
        return reply
          .code(res.statusCode || 400)
          .send({ code: res.statusCode || 400, message: res.message, data: null });
      }
      return reply.result.success('认证已发起', {
        challengeId: res.challengeId,
        method: res.method,
        maskedTarget: res.maskedTarget,
        expiresIn: res.expiresIn,
        /** 服务端算出的 patch，前端原样带回来即可（便于排查"为什么失配"） */
        patch
      });
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminAppApiStepUpVerify',
    alias: '核验接口开关二次认证',
    method: 'POST',
    url: '/apps/:appId/apis/stepup/verify',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.APP.READ,
    /* 保护性接口：关掉它，应用管理与接口开关本身就打不开了 */
    critical: true,
    config: { rateLimit: { max: 20, timeWindow: '1 minute', groupId: 'adminAppStepupVerify' } },
    schema: {
      body: {
        type: 'object',
        required: ['challengeId'],
        properties: {
          challengeId: { type: 'string', minLength: 1, maxLength: 128 },
          code: { type: 'string', maxLength: 32 },
          password: { type: 'string', maxLength: 128 }
        },
        additionalProperties: false
      }
    },
    handler: withFail(async (request, reply) => {
      const appId = String(request.params.appId || '');
      assertCanManageApp(request.state.user, appId);

      const res = await verifyChallenge({
        challengeId: request.body.challengeId,
        code: request.body.code,
        password: request.body.password,
        request
      });
      if (!res.ok) {
        return reply
          .code(res.statusCode || 400)
          .send({ code: res.statusCode || 400, message: res.message, data: null });
      }
      return reply.result.success('认证通过', { ticket: res.ticket, expiresIn: res.expiresIn, method: res.method });
    })
  });
}

export default registerAppRoutes;
