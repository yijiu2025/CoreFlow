/**
 * PoseCraft 管理后台 API
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import templateDao from '../../../app/posecraft/dao/template.dao.js';
import workDao from '../../../app/posecraft/dao/work.dao.js';

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
}
