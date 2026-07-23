/**
 * User 用户中心
 *
 * GET /user/v1/userinfo     — 获取当前登录用户信息（OIDC scope 控制字段）
 * GET /user/v1/permissions  — 获取当前用户的角色与权限列表
 * GET /user/v1/profile      — 获取当前用户基础资料（预留）
 * PUT /user/v1/update       — 更新当前用户信息（预留）
 */

import sequelize from '../../../db/index.js';
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import UserDao from '../../../app/oauth21/dao/user.dao.js';

/**
 * 生成唯一的 personal_id（格式 pose_craft_ + 8位字母数字）
 *
 * 碰撞时递归重试，最多 10 次，极端情况用时间戳后缀兜底。
 *
 * @param {number} [attempt=0] - 当前重试次数
 * @returns {Promise<string>} 唯一的 personal_id
 */
async function generateUniquePersonalId(attempt = 0) {
  if (attempt >= 10) {
    // 极端情况：用时间戳后缀兜底
    return `pose_craft_${Date.now().toString(36)}`;
  }
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const candidate = `pose_craft_${suffix}`;
  // 查重
  const existing = await sequelize.models.User.findOne({
    where: { personal_id: candidate },
    attributes: ['id']
  });
  if (existing) {
    return generateUniquePersonalId(attempt + 1);
  }
  return candidate;
}

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

      const info = { uid: userData.uid };

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
        allows: allows.slice(0, 20), // 限制返回数量
        denies: denies.slice(0, 20)
      });
    }
  });

  /**
   * GET /user/v1/profile
   * 获取当前登录用户的基础个人资料
   */
  registerSecureRoute(fastify, {
    name: 'userProfileDetails',
    alias: '获取基础资料',
    method: 'GET',
    url: '/profile',
    requireLogin: true,
    handler: async (request, reply) => {
      const tokenUser = request.state?.user;
      if (!tokenUser?.userId) {
        return reply.code(401).send({
          error: 'unauthorized',
          error_description: '请先登录'
        });
      }

      const { User } = sequelize.models;
      const user = await User.findOne({
        where: { id: tokenUser.userId }
      });

      if (!user) {
        return reply.code(404).send({
          error: 'user_not_found',
          error_description: '用户不存在'
        });
      }

      // 如果是全新用户，在此初始化个人中心基础资料
      if (!user.bio && !user.personal_id) {
        await user.update({
          gender: 1,
          age: 27,
          city: '甘肃 · 庆阳',
          bio: '✈️已飞0个国家❗️\n梦想是环游世界🌍\n中国留子👧\n个人存款0.000000千万💵\n人生是干饭💤\n梦游国家40+ | 我命由我不由天🌚\n火锅品鉴师🍪 | 5G冲浪达人🏄\npdd资深买手🛍️ | 草莓🍓狂热粉丝\n雅思托福没考📚 清华北大没考📖\n国家级证件持有者(身份证)💳',
          personal_id: await generateUniquePersonalId()
        });
        // 刷新 user 对象以获取更新后数据
        await user.reload();
      }

      // 手机号脱敏：仅返回掩码格式（如 138****1234），明文不暴露
      const { maskPhone } = await import('../../../utils/crypto.js');

      return reply.result.success('获取成功', {
        uid: user.uid,
        username: user.username,
        avatar: user.avatar,
        email: user.email,
        phone: user.phone ? maskPhone(user.phone) : null,
        gender: user.gender,
        age: user.age,
        city: user.city,
        bio: user.bio,
        personal_id: user.personal_id
      });
    }
  });

  /**
   * PUT /user/v1/update
   * 更新当前用户的基础个人资料
   */
  registerSecureRoute(fastify, {
    name: 'updateUserProfile',
    alias: '更新基础资料',
    method: 'PUT',
    url: '/update',
    requireLogin: true,
    handler: async (request, reply) => {
      const tokenUser = request.state?.user;
      if (!tokenUser?.userId) {
        return reply.code(401).send({
          error: 'unauthorized',
          error_description: '请先登录'
        });
      }

      const { username, avatar, gender, age, city, bio, personal_id } = request.body || {};
      const { User } = sequelize.models;
      const user = await User.findOne({
        where: { id: tokenUser.userId }
      });

      if (!user) {
        return reply.code(404).send({
          error: 'user_not_found',
          error_description: '用户不存在'
        });
      }

      const updateData = {};
      if (username !== undefined) updateData.username = username;
      if (avatar !== undefined) updateData.avatar = avatar;
      if (gender !== undefined) updateData.gender = gender;
      if (age !== undefined) updateData.age = age;
      if (city !== undefined) updateData.city = city;
      if (bio !== undefined) updateData.bio = bio;
      if (personal_id !== undefined) updateData.personal_id = personal_id;

      await user.update(updateData);

      return reply.result.success('更新资料成功', {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        gender: user.gender,
        age: user.age,
        city: user.city,
        bio: user.bio,
        personal_id: user.personal_id
      });
    }
  });
}

/**
 * 权限通配符匹配
 *
 * 支持的匹配模式：
 * - '*' 匹配所有权限
 * - 精确匹配（如 'user:read' === 'user:read'）
 * - 后缀通配符（如 'user:*' 匹配 'user:read'、'user:write' 等）
 *
 * @param {string} pattern - 权限模式（可包含 '*' 通配符）
 * @param {string} target - 待匹配的权限标识
 * @returns {boolean} 是否匹配
 */
function matchPermission(pattern, target) {
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (pattern.endsWith(':*')) {
    return target.startsWith(pattern.slice(0, -1));
  }
  return false;
}
