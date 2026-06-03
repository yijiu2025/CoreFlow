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

      const scopes = (tokenUser.scope || '').split(' ');
      const info = { sub: userData.id };

      if (scopes.includes('profile')) {
        info.name = userData.name;
        info.preferred_username = userData.username;
        info.avatar = userData.avatar || null;
      }
      if (scopes.includes('email')) {
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
}
