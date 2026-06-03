import IamDao from '../../../app/admin/dao/iam.dao.js';
import { registerSecureRoute } from '../../guard.js';
import { actionMetaRegistry } from '../../../utils/PbacRegistry.js';

export default async function (fastify) {
  /**
   * GET /admin/v1/iam/roles
   * 获取管理员有权分配的角色列表 (级别 <= 当前管理员级别)
   */
  registerSecureRoute(fastify, {
    name: 'listAssignableRoles',
    alias: '获取可分配角色',
    method: 'GET',
    url: '/admin/v1/iam/roles',
    handler: async (request, reply) => {
      const adminUid = request.user.uid;
      const { appId } = request.query || {};

      try {
        const roles = await IamDao.getAssignableRoles(adminUid, appId);
        return reply.send({ success: true, data: roles });
      } catch (err) {
        return reply.code(500).send({ error: err.message });
      }
    }
  });

  /**
   * GET /admin/v1/iam/actions/dictionary
   * 获取全量权限动作元数据 (供前端渲染复选框、权限树使用)
   */
  registerSecureRoute(fastify, {
    name: 'listPermissionDictionary',
    alias: '获取权限字典树',
    method: 'GET',
    url: '/admin/v1/iam/actions/dictionary',
    handler: async (request, reply) => {
      // actionMetaRegistry 是在各个业务模块加载时，通过 definePermissionMeta 压入内存的
      return reply.result?.success
        ? reply.result.success('获取全量权限字典', actionMetaRegistry)
        : reply.send({ success: true, data: actionMetaRegistry });
    }
  });

  /**
   * GET /admin/v1/iam/users
   * 获取管理员有权管理的用户列表 (同级或低级)
   */
  registerSecureRoute(fastify, {
    name: 'listManageableUsers',
    alias: '获取可管理用户列表',
    method: 'GET',
    url: '/admin/v1/iam/users',
    handler: async (request, reply) => {
      const adminUid = request.user.uid;
      const { keyword } = request.query || {};

      try {
        const users = await IamDao.getManageableUsers(adminUid, keyword);
        return reply.send({ success: true, data: users });
      } catch (err) {
        return reply.code(500).send({ error: err.message });
      }
    }
  });

  /**
   * POST /admin/v1/iam/roles/assign
   * 为用户分配角色 (需校验操作者权限)
   */
  registerSecureRoute(fastify, {
    name: 'assignIamRole',
    alias: '分配角色',
    method: 'POST',
    url: '/admin/v1/iam/roles/assign',
    handler: async (request, reply) => {
      // 从解析后的 JWT 中获取当前管理员 UID
      const adminUid = request.user.uid;
      const { targetUid, roleId, appId } = request.body;

      if (!targetUid || !roleId || !appId) {
        return reply.code(400).send({ error: '缺少必要参数' });
      }

      try {
        const result = await IamDao.assignRole(
          adminUid,
          targetUid,
          roleId,
          appId
        );
        return reply.send({ success: true, data: result });
      } catch (err) {
        return reply.code(403).send({ error: err.message });
      }
    }
  });

  /**
   * POST /admin/v1/iam/policies
   * 下发/更新 JSON 内联策略
   */
  registerSecureRoute(fastify, {
    name: 'updateInlinePolicy',
    alias: '下发内联策略',
    method: 'POST',
    url: '/admin/v1/iam/policies',
    handler: async (request, reply) => {
      const adminUid = request.user.uid;
      const { targetUid, appId, policy } = request.body;

      if (!targetUid || !appId || !policy) {
        return reply.code(400).send({ error: '缺少必要参数' });
      }

      try {
        const result = await IamDao.updateInlinePolicy(
          adminUid,
          targetUid,
          appId,
          policy
        );
        return reply.send({ success: true, data: result });
      } catch (err) {
        return reply.code(403).send({ error: err.message });
      }
    }
  });
}
