/**
 * PoseCraft 管理后台 API
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import templateDao from '../../../app/posecraft/dao/template.dao.js';
import workDao from '../../../app/posecraft/dao/work.dao.js';
import bannerConfigDao from '../../../app/posecraft/dao/bannerConfig.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'admin',
    description: 'PoseCraft 管理端接口',
    prefix: '/v1/admin'
  });

  // 1. 分页查询所有待审核作品
  registerSecureRoute(fastify, {
    name: 'adminGetWorks',
    alias: '获取审核作品列表',
    method: 'GET',
    url: '/works',
    requireLogin: true,
    permission: 'posecraft:work:audit',
    handler: async (request, reply) => {
      const page = parseInt(request.query.page) || 1;
      const pageSize = parseInt(request.query.pageSize) || 20;
      const status = request.query.status !== undefined ? parseInt(request.query.status) : undefined;
      const keyword = request.query.keyword || '';

      const limit = pageSize;
      const offset = (page - 1) * pageSize;

      const result = await workDao.findAuditList({ limit, offset, page, status, keyword });
      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });

  // 2. 审核作品
  registerSecureRoute(fastify, {
    name: 'adminAuditWork',
    alias: '审核作品',
    method: 'PUT',
    url: '/works/:id/audit',
    requireLogin: true,
    permission: 'posecraft:work:audit',
    handler: async (request, reply) => {
      const id = request.params.id;
      const { status } = request.body;
      
      if (![1, -2].includes(status)) {
        return reply.result.fail('非法的审核状态');
      }

      const success = await workDao.updateStatus(id, status);
      if (success) {
        return reply.result.success('审核完成');
      } else {
        return reply.result.fail('作品不存在或已删除');
      }
    }
  });

  // 3. 分页查询所有待审核模板
  registerSecureRoute(fastify, {
    name: 'adminGetTemplates',
    alias: '获取审核模板列表',
    method: 'GET',
    url: '/templates',
    requireLogin: true,
    permission: 'posecraft:work:audit',
    handler: async (request, reply) => {
      const page = parseInt(request.query.page) || 1;
      const pageSize = parseInt(request.query.pageSize) || 20;
      const status = request.query.status !== undefined ? parseInt(request.query.status) : undefined;
      const keyword = request.query.keyword || '';

      const limit = pageSize;
      const offset = (page - 1) * pageSize;

      const result = await templateDao.findAuditList({ limit, offset, page, status, keyword });
      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });

  // 4. 审核模板
  registerSecureRoute(fastify, {
    name: 'adminAuditTemplate',
    alias: '审核模板',
    method: 'PUT',
    url: '/templates/:id/audit',
    requireLogin: true,
    permission: 'posecraft:work:audit',
    handler: async (request, reply) => {
      const id = request.params.id;
      const { status } = request.body;
      
      if (![1, -2].includes(status)) {
        return reply.result.fail('非法的审核状态');
      }

      const success = await templateDao.updateStatus(id, status);
      if (success) {
        return reply.result.success('审核完成');
      } else {
        return reply.result.fail('模板不存在或已删除');
      }
    }
  });

  // 5. Banner 管理 —— 分页列表
  registerSecureRoute(fastify, {
    name: 'adminListBannerConfigs',
    alias: '获取 Banner 列表',
    method: 'GET',
    url: '/banner-configs',
    requireLogin: true,
    permission: 'posecraft:banner:manage',
    handler: async (request, reply) => {
      const page = parseInt(request.query.page) || 1;
      const pageSize = parseInt(request.query.pageSize) || 20;
      const offset = (page - 1) * pageSize;
      const result = await bannerConfigDao.findAll({ limit: pageSize, offset });
      return reply.result.paginated(result.list, result.total, page, pageSize);
    }
  });

  // 6. Banner 管理 —— 新建
  registerSecureRoute(fastify, {
    name: 'adminCreateBannerConfig',
    alias: '新建 Banner',
    method: 'POST',
    url: '/banner-configs',
    requireLogin: true,
    permission: 'posecraft:banner:manage',
    handler: async (request, reply) => {
      const {
        title, description, badge_text, button_text,
        image_url, link_url, sort_order, enabled, start_at, end_at
      } = request.body;

      if (!title) {
        return reply.result.fail('标题不能为空', null, 400);
      }

      const item = await bannerConfigDao.create({
        title,
        description: description || null,
        badge_text: badge_text || null,
        button_text: button_text || null,
        image_url: image_url || null,
        link_url: link_url || null,
        sort_order: sort_order !== undefined ? Number(sort_order) : 0,
        enabled: enabled !== undefined ? !!enabled : true,
        start_at: start_at || null,
        end_at: end_at || null
      });
      return reply.result.success('创建成功', item);
    }
  });

  // 7. Banner 管理 —— 更新
  registerSecureRoute(fastify, {
    name: 'adminUpdateBannerConfig',
    alias: '更新 Banner',
    method: 'PUT',
    url: '/banner-configs/:id',
    requireLogin: true,
    permission: 'posecraft:banner:manage',
    handler: async (request, reply) => {
      const id = Number(request.params.id);
      const updated = await bannerConfigDao.update(id, request.body);
      if (!updated) {
        return reply.result.fail('Banner 不存在或已删除', null, 404);
      }
      return reply.result.success('更新成功', updated);
    }
  });

  // 8. Banner 管理 —— 删除（软删除）
  registerSecureRoute(fastify, {
    name: 'adminDeleteBannerConfig',
    alias: '删除 Banner',
    method: 'DELETE',
    url: '/banner-configs/:id',
    requireLogin: true,
    permission: 'posecraft:banner:manage',
    handler: async (request, reply) => {
      const id = Number(request.params.id);
      const success = await bannerConfigDao.delete(id);
      if (!success) {
        return reply.result.fail('Banner 不存在或已删除', null, 404);
      }
      return reply.result.success('删除成功');
    }
  });
}
