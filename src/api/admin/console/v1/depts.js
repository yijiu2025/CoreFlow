/**
 * 部门管理接口
 *
 * GET    /admin/console/v1/depts/tree    —— 部门树（含成员数）
 * GET    /admin/console/v1/depts/options —— 扁平选项（启用项）
 * POST   /admin/console/v1/depts         —— 新建部门
 * PUT    /admin/console/v1/depts/:id     —— 编辑部门（父级变化时重写下级 ancestors）
 * DELETE /admin/console/v1/depts/:id     —— 删除部门（有子部门或成员时拒绝）
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import deptDao from '../../../../app/console/dao/dept.dao.js';
import { withFail } from '../../../../app/console/utils/respond.js';

/** 部门写入字段 schema */
const deptBodySchema = {
  type: 'object',
  properties: {
    parentId: { type: 'integer', minimum: 0 },
    name: { type: 'string', minLength: 1, maxLength: 50 },
    leader: { type: 'string', maxLength: 50 },
    phone: { type: 'string', maxLength: 20 },
    email: { type: 'string', maxLength: 100 },
    sort: { type: 'integer', minimum: 0, maximum: 9999 },
    status: { type: 'integer', enum: [0, 1] }
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
  if (body.parentId !== undefined) payload.parent_id = body.parentId;
  if (body.name !== undefined) payload.name = body.name;
  if (body.leader !== undefined) payload.leader = body.leader;
  if (body.phone !== undefined) payload.phone = body.phone;
  if (body.email !== undefined) payload.email = body.email;
  if (body.sort !== undefined) payload.sort = body.sort;
  if (body.status !== undefined) payload.status = body.status;
  return payload;
}

async function registerDeptRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleDept',
    alias: '管理后台部门',
    description: '组织架构维护',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleDeptTree',
    alias: '部门树',
    method: 'GET',
    url: '/depts/tree',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DEPT.READ,
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await deptDao.tree());
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDeptOptions',
    alias: '部门选项',
    method: 'GET',
    url: '/depts/options',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DEPT.READ,
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await deptDao.options());
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDeptCreate',
    alias: '新建部门',
    method: 'POST',
    url: '/depts',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DEPT.CREATE,
    schema: { body: { ...deptBodySchema, required: ['name'] } },
    handler: withFail(async (request, reply) => {
      const dept = await deptDao.create(toModelFields(request.body));
      return reply.result.success('创建成功', { id: dept.id, ancestors: dept.ancestors });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDeptUpdate',
    alias: '编辑部门',
    method: 'PUT',
    url: '/depts/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DEPT.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: deptBodySchema
    },
    handler: withFail(async (request, reply) => {
      const ok = await deptDao.update(request.params.id, toModelFields(request.body));
      if (!ok) throw new Error('NOT_FOUND:部门不存在');
      return reply.result.success('保存成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDeptRemove',
    alias: '删除部门',
    method: 'DELETE',
    url: '/depts/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DEPT.DELETE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const id = request.params.id;
      if ((await deptDao.countChildren(id)) > 0) throw new Error('HAS_CHILDREN:请先删除下级部门');
      if ((await deptDao.countUsers(id)) > 0) throw new Error('HAS_MEMBERS:该部门下仍有成员，请先转移');
      await deptDao.remove(id);
      return reply.result.success('删除成功', null);
    })
  });
}

export default registerDeptRoutes;
