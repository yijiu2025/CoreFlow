/**
 * 岗位管理接口
 *
 * GET    /admin/console/v1/posts           —— 分页列表（含在岗人数）
 * POST   /admin/console/v1/posts           —— 新建岗位
 * PUT    /admin/console/v1/posts/:id       —— 编辑岗位
 * DELETE /admin/console/v1/posts/:id       —— 删除岗位（有在岗成员时拒绝）
 * GET    /admin/console/v1/posts/:id/users —— 在岗成员
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import postDao from '../../../../app/console/dao/post.dao.js';
import { withFail } from '../../../../app/console/utils/respond.js';

/** 岗位写入字段 schema */
const postBodySchema = {
  type: 'object',
  properties: {
    postCode: { type: 'string', minLength: 1, maxLength: 50 },
    postName: { type: 'string', minLength: 1, maxLength: 50 },
    sort: { type: 'integer', minimum: 0, maximum: 9999 },
    status: { type: 'integer', enum: [0, 1] },
    remark: { type: 'string', maxLength: 255 }
  }
};

/**
 * 驼峰请求体 → 模型字段
 *
 * @param {object} body 请求体
 * @returns {object} 模型字段
 */
function toModelFields(body) {
  const payload = {};
  if (body.postCode !== undefined) payload.post_code = body.postCode;
  if (body.postName !== undefined) payload.post_name = body.postName;
  if (body.sort !== undefined) payload.sort = body.sort;
  if (body.status !== undefined) payload.status = body.status;
  if (body.remark !== undefined) payload.remark = body.remark;
  return payload;
}

async function registerPostRoutes(fastify) {
  registerGroupMetadata({
    name: 'consolePost',
    alias: '管理后台岗位',
    description: '岗位维护与在岗成员',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consolePostList',
    alias: '岗位列表',
    method: 'GET',
    url: '/posts',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.POST.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          pageNum: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
          keyword: { type: 'string', maxLength: 100 },
          status: { type: 'integer', enum: [0, 1] }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 20, keyword = '', status = null } = request.query;
      const { rows, total } = await postDao.page({ pageNum, pageSize, keyword, status });
      return reply.result.success('获取成功', { rows, total, pageNum, pageSize });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consolePostCreate',
    alias: '新建岗位',
    method: 'POST',
    url: '/posts',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.POST.CREATE,
    schema: { body: { ...postBodySchema, required: ['postCode', 'postName'] } },
    handler: withFail(async (request, reply) => {
      const payload = toModelFields(request.body);
      if (await postDao.isCodeTaken(payload.post_code)) throw new Error('DUPLICATE:岗位编码已存在');
      const post = await postDao.create(payload);
      return reply.result.success('创建成功', { id: post.id });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consolePostUpdate',
    alias: '编辑岗位',
    method: 'PUT',
    url: '/posts/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.POST.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: postBodySchema
    },
    handler: withFail(async (request, reply) => {
      const id = request.params.id;
      const payload = toModelFields(request.body);
      if (payload.post_code && (await postDao.isCodeTaken(payload.post_code, id))) {
        throw new Error('DUPLICATE:岗位编码已存在');
      }
      const ok = await postDao.update(id, payload);
      if (!ok) throw new Error('NOT_FOUND:岗位不存在');
      return reply.result.success('保存成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consolePostRemove',
    alias: '删除岗位',
    method: 'DELETE',
    url: '/posts/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.POST.DELETE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const id = request.params.id;
      if ((await postDao.countUsers(id)) > 0) throw new Error('HAS_MEMBERS:该岗位下仍有成员，请先解除');
      await postDao.remove(id);
      return reply.result.success('删除成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consolePostUsers',
    alias: '在岗成员',
    method: 'GET',
    url: '/posts/:id/users',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.POST.READ,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await postDao.users(request.params.id));
    })
  });
}

export default registerPostRoutes;
