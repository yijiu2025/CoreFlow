/**
 * PoseCraft 模板 API
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'template',
    description: '模板管理',
    prefix: '/v1'
  });

  // 获取模板列表（公开）
  registerSecureRoute(fastify, {
    name: 'getTemplates',
    alias: '获取模板列表',
    method: 'GET',
    url: '/templates',
    handler: async (request, reply) => {
      const { category, keyword, page = 1, pageSize = 20 } = request.query;
      const { Template } = fastify.db.models;
      const { Op } = await import('sequelize');

      const where = { status: 1, delete_version: 0 };
      if (category) where.category = category;
      if (keyword) {
        where[Op.or] = [
          { title: { [Op.like]: `%${keyword}%` } },
          { description: { [Op.like]: `%${keyword}%` } }
        ];
      }

      const templates = await Template.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize)
      });

      return reply.result.success('获取成功', templates);
    }
  });

  // 获取热门模板（公开）
  registerSecureRoute(fastify, {
    name: 'getPopularTemplates',
    alias: '获取热门模板',
    method: 'GET',
    url: '/templates/popular',
    handler: async (request, reply) => {
      const { limit = 10 } = request.query;
      const { Template } = fastify.db.models;

      const templates = await Template.findAll({
        where: { status: 1, delete_version: 0 },
        order: [['uses_count', 'DESC']],
        limit: parseInt(limit)
      });

      return reply.result.success('获取成功', templates);
    }
  });

  // 获取模板详情（公开）
  registerSecureRoute(fastify, {
    name: 'getTemplate',
    alias: '获取模板详情',
    method: 'GET',
    url: '/templates/:id',
    handler: async (request, reply) => {
      const { id } = request.params;
      const { Template } = fastify.db.models;

      const template = await Template.findOne({
        where: { id, delete_version: 0 }
      });

      if (!template) {
        return reply.result.fail('模板不存在');
      }

      return reply.result.success('获取成功', template);
    }
  });

  // 创建模板（需要登录）
  registerSecureRoute(fastify, {
    name: 'createTemplate',
    alias: '创建模板',
    method: 'POST',
    url: '/templates',
    requireLogin: true,
    permission: 'posecraft:template:create',
    handler: async (request, reply) => {
      const { title, description, category, image_url, thumbnail_url, pose_data, tags } = request.body;
      const user = request.state.user;
      const { Template } = fastify.db.models;

      const template = await Template.create({
        title,
        description,
        category: category || 'general',
        image_url,
        thumbnail_url,
        pose_data,
        tags,
        user_id: user.userId,
        status: 1,
        delete_version: 0
      });

      return reply.result.success('创建成功', template);
    }
  });

  // 更新模板（需要登录）
  registerSecureRoute(fastify, {
    name: 'updateTemplate',
    alias: '更新模板',
    method: 'PUT',
    url: '/templates/:id',
    requireLogin: true,
    permission: 'posecraft:template:update',
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;
      const data = request.body;
      const { Template } = fastify.db.models;

      const template = await Template.findOne({
        where: { id, delete_version: 0 }
      });

      if (!template) {
        return reply.result.fail('模板不存在');
      }

      if (template.user_id !== user.userId) {
        return reply.result.forbidden('只能修改自己的模板');
      }

      const updated = await template.update(data);
      return reply.result.success('更新成功', updated);
    }
  });

  // 删除模板（需要登录）
  registerSecureRoute(fastify, {
    name: 'deleteTemplate',
    alias: '删除模板',
    method: 'DELETE',
    url: '/templates/:id',
    requireLogin: true,
    permission: 'posecraft:template:delete',
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;
      const { Template } = fastify.db.models;

      const template = await Template.findOne({
        where: { id, delete_version: 0 }
      });

      if (!template || template.user_id !== user.userId) {
        return reply.result.fail('删除失败，模板不存在或无权限');
      }

      await template.update({ delete_version: template.id });
      return reply.result.success('删除成功');
    }
  });
}
