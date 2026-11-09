/**
 * 参数管理接口
 *
 * GET    /admin/console/v1/configs       —— 分页（按 key 前缀分组由前端完成）
 * POST   /admin/console/v1/configs       —— 新建参数
 * PUT    /admin/console/v1/configs/:id   —— 编辑参数
 * DELETE /admin/console/v1/configs/:id   —— 删除参数（内置项拒绝）
 *
 * 🔴 只管业务参数；运行期配置（`data/*.json`）不在此维护，避免与配置优先级规则冲突。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import configDao from '../../../../app/console/dao/config.dao.js';
import { withFail } from '../../../../app/console/utils/respond.js';

async function registerConfigRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleConfig',
    alias: '管理后台参数',
    description: '业务参数维护',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleConfigList',
    alias: '参数列表',
    method: 'GET',
    url: '/configs',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.CONFIG.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          pageNum: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          keyword: { type: 'string', maxLength: 100 },
          type: { type: 'string', enum: ['Y', 'N'] }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 50, keyword = '', type = '' } = request.query;
      const { rows, total } = await configDao.page({ pageNum, pageSize, keyword, type });
      return reply.result.success('获取成功', { rows, total, pageNum, pageSize });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleConfigCreate',
    alias: '新建参数',
    method: 'POST',
    url: '/configs',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.CONFIG.CREATE,
    schema: {
      body: {
        type: 'object',
        required: ['configKey'],
        properties: {
          configKey: { type: 'string', minLength: 1, maxLength: 100 },
          configValue: { type: 'string', maxLength: 4000 },
          type: { type: 'string', enum: ['Y', 'N'], default: 'N' },
          remark: { type: 'string', maxLength: 255 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { configKey, configValue = '', type = 'N', remark = '' } = request.body;
      if (await configDao.isKeyTaken(configKey)) throw new Error('DUPLICATE:参数键已存在');
      const row = await configDao.create({
        config_key: configKey,
        config_value: configValue,
        type,
        builtin: type === 'Y' ? 1 : 0,
        remark
      });
      return reply.result.success('创建成功', { id: row.id });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleConfigUpdate',
    alias: '编辑参数',
    method: 'PUT',
    url: '/configs/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.CONFIG.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        properties: {
          configValue: { type: 'string', maxLength: 4000 },
          remark: { type: 'string', maxLength: 255 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const patch = {};
      if (request.body.configValue !== undefined) patch.config_value = request.body.configValue;
      if (request.body.remark !== undefined) patch.remark = request.body.remark;
      const ok = await configDao.update(request.params.id, patch);
      if (!ok) throw new Error('NOT_FOUND:参数不存在');
      return reply.result.success('保存成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleConfigRemove',
    alias: '删除参数',
    method: 'DELETE',
    url: '/configs/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.CONFIG.DELETE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const row = await configDao.findById(request.params.id);
      if (!row) throw new Error('NOT_FOUND:参数不存在');
      if (Number(row.builtin) === 1 || row.type === 'Y') {
        throw new Error('BUILTIN_PROTECTED:内置参数不可删除，只能修改值');
      }
      await configDao.remove(row.id);
      return reply.result.success('删除成功', null);
    })
  });
}

export default registerConfigRoutes;
