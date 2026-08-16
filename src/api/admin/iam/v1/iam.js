import IamDao from '../../../../app/admin/dao/iam.dao.js';
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { actionMetaRegistry } from '../../../../utils/PbacRegistry.js';
import { logAuditEvent } from '../../../../framework/auth/audit-logger.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'iam',
    alias: '权限管理',
    description: '用户角色、权限管理',
    prefix: '/iam/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin']
  });
  /**
   * GET /admin/iam/v1/roles
   * 获取管理员有权分配的角色列表 (级别 <= 当前管理员级别)
   */
  registerSecureRoute(fastify, {
    name: 'listAssignableRoles',
    alias: '获取可分配角色',
    method: 'GET',
    url: '/roles',
    handler: async (request, reply) => {
      const adminUid = request.user.uid;
      const { appId } = request.query || {};

      try {
        const roles = await IamDao.getAssignableRoles(adminUid, appId);
        return reply.result.success('获取成功', roles);
      } catch (err) {
        return reply.result.fail(err.message, null, 500);
      }
    }
  });

  /**
   * GET /admin/iam/v1/actions/dictionary
   * 获取全量权限动作元数据 (供前端渲染复选框、权限树使用)
   */
  registerSecureRoute(fastify, {
    name: 'listPermissionDictionary',
    alias: '获取权限字典树',
    method: 'GET',
    url: '/actions/dictionary',
    handler: async (request, reply) => {
      // actionMetaRegistry 是在各个业务模块加载时，通过 definePermissionMeta 压入内存的
      return reply.result.success('获取全量权限字典', actionMetaRegistry);
    }
  });

  /**
   * GET /admin/iam/v1/users
   * 获取管理员有权管理的用户列表 (同级或低级)
   */
  registerSecureRoute(fastify, {
    name: 'listManageableUsers',
    alias: '获取可管理用户列表',
    method: 'GET',
    url: '/users',
    handler: async (request, reply) => {
      const adminUid = request.user.uid;
      const { keyword } = request.query || {};

      try {
        const users = await IamDao.getManageableUsers(adminUid, keyword);
        return reply.result.success('获取成功', users);
      } catch (err) {
        return reply.result.fail(err.message, null, 500);
      }
    }
  });

  /**
   * POST /admin/iam/v1/roles/assign
   * 为用户分配角色 (需校验操作者权限)
   */
  registerSecureRoute(fastify, {
    name: 'assignIamRole',
    alias: '分配角色',
    method: 'POST',
    url: '/roles/assign',
    handler: async (request, reply) => {
      // 从解析后的 JWT 中获取当前管理员 UID
      const adminUid = request.user.uid;
      const { targetUid, roleId, appId } = request.body;

      if (!targetUid || !roleId || !appId) {
        return reply.result.fail('缺少必要参数', null, 400);
      }

      try {
        const result = await IamDao.assignRole(adminUid, targetUid, roleId, appId);

        // 审计日志：角色分配
        await logAuditEvent(request.server.redis, {
          type: 'ROLE_ASSIGNED',
          userId: adminUid,
          ip: request.ip,
          userAgent: request.headers['user-agent'] || '',
          appId,
          details: { targetUid, roleId }
        });

        return reply.result.success('分配成功', result);
      } catch (err) {
        return reply.result.fail(err.message, null, 403);
      }
    }
  });

  /**
   * POST /admin/iam/v1/policies
   * 下发/更新 JSON 内联策略
   */
  registerSecureRoute(fastify, {
    name: 'updateInlinePolicy',
    alias: '下发内联策略',
    method: 'POST',
    url: '/policies',
    handler: async (request, reply) => {
      const adminUid = request.user.uid;
      const { targetUid, appId, policy } = request.body;

      if (!targetUid || !appId || !policy) {
        return reply.result.fail('缺少必要参数', null, 400);
      }

      try {
        const result = await IamDao.updateInlinePolicy(adminUid, targetUid, appId, policy);

        // 审计日志：权限变更
        await logAuditEvent(request.server.redis, {
          type: 'PERMISSION_CHANGE',
          userId: adminUid,
          ip: request.ip,
          userAgent: request.headers['user-agent'] || '',
          appId,
          details: { targetUid, action: 'update_inline_policy' }
        });

        return reply.result.success('下发成功', result);
      } catch (err) {
        return reply.result.fail(err.message, null, 403);
      }
    }
  });
}
