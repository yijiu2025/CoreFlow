/**
 * PoseCraft 作品 API
 * 负责作品的查询、创建、删除及互动。
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import workDao from '../../../app/posecraft/dao/work.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'work',
    description: '作品管理',
    prefix: '/v1'
  });

  /**
   * 细粒度数据级权限校验通用助手
   * 1. 资源创建者本人：允许对其自己创建的作品进行操作。
   * 2. 管理员（包含 posecraft_admin 角色、全局 admin 角色或拥有 posecraft:work:audit 权限）：允许越权管理任何用户的作品。
   */
  const checkDataPermission = (item, user) => {
    if (!item || !user) return false;
    
    // 如果是创建者本人，通过
    if (item.user_id === user.userId) return true;
    
    // 如果是管理员/运营角色或拥有审核/删单权限，通过
    const userRoles = user.roles || [];
    const userPermissions = user.permissions?.allows || [];
    return (
      userRoles.includes('posecraft_admin') ||
      userRoles.includes('posecraft_operator') ||
      userRoles.includes('admin') ||
      userPermissions.includes('posecraft:work:audit') ||
      userPermissions.includes('posecraft:work:delete_any')
    );
  };

  // 获取作品列表（公开）
  registerSecureRoute(fastify, {
    name: 'getWorks',
    alias: '获取作品列表',
    method: 'GET',
    url: '/works',
    handler: async (request, reply) => {
      const { keyword, page = 1, pageSize = 20 } = request.query;

      const works = await workDao.findAll({
        keyword,
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize)
      });

      return reply.result.success('获取成功', works);
    }
  });

  // 获取推荐作品（公开）
  registerSecureRoute(fastify, {
    name: 'getRecommendedWorks',
    alias: '获取推荐作品',
    method: 'GET',
    url: '/works/recommended',
    handler: async (request, reply) => {
      const { limit = 20 } = request.query;

      const works = await workDao.findRecommended(parseInt(limit));

      return reply.result.success('获取成功', works);
    }
  });

  // 获取用户作品（公开）
  registerSecureRoute(fastify, {
    name: 'getUserWorks',
    alias: '获取用户作品',
    method: 'GET',
    url: '/works/user/:userId',
    handler: async (request, reply) => {
      const { userId } = request.params;
      const { page = 1, pageSize = 20 } = request.query;

      const works = await workDao.findByUser(userId, {
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize)
      });

      return reply.result.success('获取成功', works);
    }
  });

  // 获取作品详情（公开）
  registerSecureRoute(fastify, {
    name: 'getWork',
    alias: '获取作品详情',
    method: 'GET',
    url: '/works/:id',
    handler: async (request, reply) => {
      const { id } = request.params;

      const work = await workDao.findById(id);

      if (!work) {
        return reply.result.fail('作品不存在');
      }

      // 增加浏览量
      await workDao.incrementViews(id);

      return reply.result.success('获取成功', work);
    }
  });

  // 创建作品（需要登录）
  registerSecureRoute(fastify, {
    name: 'createWork',
    alias: '创建作品',
    method: 'POST',
    url: '/works',
    requireLogin: true,
    permission: 'posecraft:work:create',
    handler: async (request, reply) => {
      const { title, description, template_id, image_url, thumbnail_url, analysis_data, edit_data } = request.body;
      const user = request.state.user;

      const work = await workDao.create({
        title,
        description,
        template_id,
        image_url,
        thumbnail_url,
        analysis_data,
        edit_data,
        user_id: user.userId,
        status: 1,
        delete_version: 0
      });

      return reply.result.success('创建成功', work);
    }
  });

  // 删除作品（需要登录）
  // 数据级权限校验：只允许作品创建者本人，或管理员删除任何人的作品。
  registerSecureRoute(fastify, {
    name: 'deleteWork',
    alias: '删除作品',
    method: 'DELETE',
    url: '/works/:id',
    requireLogin: true,
    permission: 'posecraft:work:delete',
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;

      const work = await workDao.findById(id);

      // 数据级权限校验：创建者本人或管理员放行
      if (!work || !checkDataPermission(work, user)) {
        return reply.result.forbidden('删除失败，作品不存在或无权限');
      }

      await workDao.delete(id, work.user_id);
      return reply.result.success('删除成功');
    }
  });

  // 点赞作品（需要登录）
  registerSecureRoute(fastify, {
    name: 'likeWork',
    alias: '点赞作品',
    method: 'POST',
    url: '/works/:id/like',
    requireLogin: true,
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;

      const work = await workDao.findById(id);

      if (!work) {
        return reply.result.fail('点赞失败，作品不存在');
      }

      await workDao.incrementLikes(id);
      
      return reply.result.success('点赞成功');
    }
  });
  // 获取关注者的作品
  registerSecureRoute(fastify, {
    name: 'getFollowingWorks',
    alias: '获取关注者的作品',
    method: 'GET',
    url: '/works/following',
    requireLogin: true,
    handler: async (request, reply) => {
      const { page = 1, pageSize = 20 } = request.query;
      const user = request.state.user;

      const works = await workDao.findFollowingWorks(user.userId, {
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize)
      });

      return reply.result.success('获取成功', works);
    }
  });
}
