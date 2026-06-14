/**
 * User 用户中心
 *
 * GET /user/v1/userinfo     — 获取当前登录用户信息（OIDC scope 控制字段）
 * GET /user/v1/permissions  — 获取当前用户的角色与权限列表
 * GET /user/v1/profile      — 获取当前用户基础资料（预留）
 * PUT /user/v1/update       — 更新当前用户信息（预留）
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import UserDao from '../../../app/oauth21/dao/user.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'userProfile',
    alias: '用户资料',
    description: '用户信息查询与资料管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /user/v1/userinfo
   *
   * 获取当前已认证用户的信息。
   * 需要有效的 Access Token（Bearer Header 或 HttpOnly Cookie）。
   * 返回字段由 token 中的 scope 决定：
   *  - openid  → sub（必含）
   *  - profile  → name, preferred_username, avatar
   *  - email   → email
   */
  registerSecureRoute(fastify, {
    name: 'userinfo',
    alias: '获取用户信息',
    method: 'GET',
    url: '/userinfo',
    requireLogin: true,
    handler: async (request, reply) => {
      const tokenUser = request.state?.user;
      if (!tokenUser?.sub) {
        return reply.code(401).send({
          error: 'invalid_token',
          error_description: '身份验证失败，请重新登录'
        });
      }

      const userData = await UserDao.findById(tokenUser.sub);
      if (!userData) {
        return reply.code(404).send({
          error: 'user_not_found',
          error_description: '用户不存在'
        });
      }

      // 第一方应用直接返回完整信息，第三方应用按 scope 过滤
      const scopes = (tokenUser.scope || '').split(' ');
      const isFirstParty = !tokenUser.scope || tokenUser.client_id === 'first-party-app';

      const info = { sub: userData.id };

      if (isFirstParty || scopes.includes('profile')) {
        info.name = userData.name;
        info.preferred_username = userData.username;
        info.avatar = userData.avatar || null;
      }
      if (isFirstParty || scopes.includes('email')) {
        info.email = userData.email;
      }

      return reply.result.success('获取成功', info);
    }
  });

  /**
   * GET /user/v1/permissions
   *
   * 获取当前已认证用户的角色与权限列表。
   * 数据直接从 session 中读取，无需额外查询数据库。
   * 返回结构：
   *  - roles: string[]              角色编码列表，如 ['admin', 'operator']
   *  - permissions: { allows, denies }  权限策略，allows 为允许列表，denies 为拒绝列表
   *
   * 前端可用于：
   *  - v-auth 指令控制按钮/元素显示
   *  - 路由守卫控制页面访问
   *  - 动态菜单生成
   */
  registerSecureRoute(fastify, {
    name: 'permissions',
    alias: '获取权限列表',
    method: 'GET',
    url: '/permissions',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({
          error: 'invalid_token',
          error_description: '身份验证失败，请重新登录'
        });
      }

      return reply.result.success('获取成功', {
        roles: user.roles || [],
        permissions: user.permissions || { allows: [], denies: [] }
      });
    }
  });

  /**
   * GET /user/v1/check-permission
   *
   * 权限调试工具：检查当前用户是否拥有指定权限
   * 用于前端调试和管理员排查权限问题
   *
   * Query: permission=fw:config:read
   * 返回: { has: boolean, matched: string, denied: boolean }
   */
  registerSecureRoute(fastify, {
    name: 'checkPermission',
    alias: '权限调试检查',
    method: 'GET',
    url: '/check-permission',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const { permission } = request.query;
      if (!permission) {
        return reply.code(400).send({ code: 400, message: '缺少 permission 参数', data: null });
      }

      const { allows = [], denies = [] } = user.permissions || {};

      // 检查 deny
      const denied = denies.some(p => matchPermission(p, permission));
      // 检查 allow
      const allowed = allows.some(p => matchPermission(p, permission));

      return reply.result.success('检查完成', {
        permission,
        has: allowed && !denied,
        denied,
        matched: denied ? 'denied' : allowed ? 'allowed' : 'none',
        roles: user.roles || [],
        allows: allows.slice(0, 20),  // 限制返回数量
        denies: denies.slice(0, 20)
      });
    }
  });
}

/**
 * 权限通配符匹配
 */
function matchPermission(pattern, target) {
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (pattern.endsWith(':*')) {
    return target.startsWith(pattern.slice(0, -1));
  }
  return false;
}
