/**
 * PoseCraft 作品 API
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'work',
    description: '作品管理',
    prefix: '/v1'
  });

  // 获取作品列表（公开）
  registerSecureRoute(fastify, {
    name: 'getWorks',
    alias: '获取作品列表',
    method: 'GET',
    url: '/works',
    handler: async (request, reply) => {
      const { keyword, page = 1, pageSize = 20 } = request.query;
      const { Work } = fastify.db.models;
      const { Op } = await import('sequelize');

      const where = { status: 1, delete_version: 0 };
      if (keyword) {
        where[Op.or] = [
          { title: { [Op.like]: `%${keyword}%` } },
          { description: { [Op.like]: `%${keyword}%` } }
        ];
      }

      const works = await Work.findAll({
        where,
        order: [['created_at', 'DESC']],
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
      const { Work } = fastify.db.models;

      const works = await Work.findAll({
        where: { status: 1, delete_version: 0 },
        order: [['likes_count', 'DESC'], ['views_count', 'DESC']],
        limit: parseInt(limit)
      });

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
      const { Work } = fastify.db.models;

      const works = await Work.findAll({
        where: { user_id: userId, status: 1, delete_version: 0 },
        order: [['created_at', 'DESC']],
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
      const { Work } = fastify.db.models;

      const work = await Work.findOne({
        where: { id, delete_version: 0 }
      });

      if (!work) {
        return reply.result.fail('作品不存在');
      }

      // 增加浏览量
      await work.increment('views_count');

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
      const { Work } = fastify.db.models;

      const work = await Work.create({
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
      const { Work } = fastify.db.models;

      const work = await Work.findOne({
        where: { id, delete_version: 0 }
      });

      if (!work || work.user_id !== user.userId) {
        return reply.result.fail('删除失败，作品不存在或无权限');
      }

      await work.update({ delete_version: work.id });
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
      const { Work } = fastify.db.models;

      const work = await Work.findOne({
        where: { id, delete_version: 0 }
      });

      if (!work) {
        return reply.result.fail('作品不存在');
      }

      await work.increment('likes_count');
      return reply.result.success('点赞成功');
    }
  });
}
