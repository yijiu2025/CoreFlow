/**
 * 字典管理接口
 *
 * GET    /admin/console/v1/dict/types        —— 类型分页（含项数）
 * POST   /admin/console/v1/dict/types        —— 新建类型
 * PUT    /admin/console/v1/dict/types/:id    —— 编辑类型（标识不可改）
 * DELETE /admin/console/v1/dict/types/:id    —— 删除类型（连同字典项）
 * GET    /admin/console/v1/dict/data/:type   —— 类型下全部字典项
 * POST   /admin/console/v1/dict/data         —— 新建字典项
 * PUT    /admin/console/v1/dict/data/:id     —— 编辑字典项
 * DELETE /admin/console/v1/dict/data/:id     —— 删除字典项
 * GET    /admin/console/v1/dict/options/:type —— 业务下拉（仅启用项，登录即可）
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import dictDao from '../../../../app/console/dao/dict.dao.js';
import { withFail } from '../../../../app/console/utils/respond.js';

async function registerDictRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleDict',
    alias: '管理后台字典',
    description: '字典类型与字典项维护',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleDictTypes',
    alias: '字典类型列表',
    method: 'GET',
    url: '/dict/types',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DICT.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          pageNum: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
          keyword: { type: 'string', maxLength: 100 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 20, keyword = '' } = request.query;
      const { rows, total } = await dictDao.pageTypes({ pageNum, pageSize, keyword });
      return reply.result.success('获取成功', { rows, total, pageNum, pageSize });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDictTypeCreate',
    alias: '新建字典类型',
    method: 'POST',
    url: '/dict/types',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DICT.CREATE,
    schema: {
      body: {
        type: 'object',
        required: ['dictName', 'dictType'],
        properties: {
          dictName: { type: 'string', minLength: 1, maxLength: 100 },
          dictType: { type: 'string', minLength: 1, maxLength: 100 },
          status: { type: 'integer', enum: [0, 1], default: 1 },
          remark: { type: 'string', maxLength: 255 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { dictName, dictType, status = 1, remark = '' } = request.body;
      if (await dictDao.isTypeTaken(dictType)) throw new Error('DUPLICATE:字典标识已存在');
      const row = await dictDao.createType({ dict_name: dictName, dict_type: dictType, status, remark });
      return reply.result.success('创建成功', { id: row.id });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDictTypeUpdate',
    alias: '编辑字典类型',
    method: 'PUT',
    url: '/dict/types/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DICT.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        properties: {
          dictName: { type: 'string', minLength: 1, maxLength: 100 },
          status: { type: 'integer', enum: [0, 1] },
          remark: { type: 'string', maxLength: 255 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const patch = {};
      if (request.body.dictName !== undefined) patch.dict_name = request.body.dictName;
      if (request.body.status !== undefined) patch.status = request.body.status;
      if (request.body.remark !== undefined) patch.remark = request.body.remark;
      const ok = await dictDao.updateType(request.params.id, patch);
      if (!ok) throw new Error('NOT_FOUND:字典类型不存在');
      return reply.result.success('保存成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDictTypeRemove',
    alias: '删除字典类型',
    method: 'DELETE',
    url: '/dict/types/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DICT.DELETE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      await dictDao.removeType(request.params.id);
      return reply.result.success('删除成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDictData',
    alias: '字典项列表',
    method: 'GET',
    url: '/dict/data/:type',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DICT.READ,
    schema: {
      params: { type: 'object', required: ['type'], properties: { type: { type: 'string', maxLength: 100 } } }
    },
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await dictDao.listData(request.params.type));
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDictDataCreate',
    alias: '新建字典项',
    method: 'POST',
    url: '/dict/data',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DICT.CREATE,
    schema: {
      body: {
        type: 'object',
        required: ['dictType', 'label', 'value'],
        properties: {
          dictType: { type: 'string', minLength: 1, maxLength: 100 },
          label: { type: 'string', minLength: 1, maxLength: 100 },
          value: { type: 'string', minLength: 1, maxLength: 100 },
          sort: { type: 'integer', minimum: 0, maximum: 9999, default: 0 },
          status: { type: 'integer', enum: [0, 1], default: 1 },
          tone: { type: 'string', maxLength: 20 },
          isDefault: { type: 'integer', enum: [0, 1], default: 0 },
          remark: { type: 'string', maxLength: 255 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const body = request.body;
      if (!(await dictDao.typeExists(body.dictType))) throw new Error('NOT_FOUND:字典类型不存在');
      const row = await dictDao.createData({
        dict_type: body.dictType,
        label: body.label,
        value: body.value,
        sort: body.sort ?? 0,
        status: body.status ?? 1,
        tone: body.tone || null,
        is_default: body.isDefault ?? 0,
        remark: body.remark || ''
      });
      return reply.result.success('创建成功', { id: row.id });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDictDataUpdate',
    alias: '编辑字典项',
    method: 'PUT',
    url: '/dict/data/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DICT.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 100 },
          value: { type: 'string', minLength: 1, maxLength: 100 },
          sort: { type: 'integer', minimum: 0, maximum: 9999 },
          status: { type: 'integer', enum: [0, 1] },
          tone: { type: 'string', maxLength: 20 },
          isDefault: { type: 'integer', enum: [0, 1] },
          remark: { type: 'string', maxLength: 255 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const body = request.body;
      const patch = {};
      if (body.label !== undefined) patch.label = body.label;
      if (body.value !== undefined) patch.value = body.value;
      if (body.sort !== undefined) patch.sort = body.sort;
      if (body.status !== undefined) patch.status = body.status;
      if (body.tone !== undefined) patch.tone = body.tone;
      if (body.isDefault !== undefined) patch.is_default = body.isDefault;
      if (body.remark !== undefined) patch.remark = body.remark;
      const ok = await dictDao.updateData(request.params.id, patch);
      if (!ok) throw new Error('NOT_FOUND:字典项不存在');
      return reply.result.success('保存成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDictDataRemove',
    alias: '删除字典项',
    method: 'DELETE',
    url: '/dict/data/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DICT.DELETE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const ok = await dictDao.removeData(request.params.id);
      if (!ok) throw new Error('NOT_FOUND:字典项不存在');
      return reply.result.success('删除成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleDictOptions',
    alias: '业务字典下拉',
    method: 'GET',
    url: '/dict/options/:type',
    // 业务下拉只要求登录：任何页面都可能用到，不该额外索取管理权限
    requireLogin: true,
    schema: {
      params: { type: 'object', required: ['type'], properties: { type: { type: 'string', maxLength: 100 } } }
    },
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await dictDao.options(request.params.type));
    })
  });
}

export default registerDictRoutes;
