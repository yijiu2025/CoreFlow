/**
 * 通知模板管理接口
 *
 * GET    /notice/v1/templates      —— 模板列表（可按渠道过滤）
 * POST   /notice/v1/templates      —— 新建
 * PUT    /notice/v1/templates/:id  —— 编辑
 * DELETE /notice/v1/templates/:id  —— 删除
 *
 * 写操作要求 `notice:template:write`；读要求 `notice:template:read`。
 * 变量校验在 service 里做（正文 `{{name}}` 必须出现在 variables 声明里），
 * 返回 400 时消息会直接列出未声明的变量名。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { NOTICE_PERMISSIONS } from '../../../app/notice/permission/index.js';
import * as templateService from '../../../app/notice/services/template.service.js';

/** 写入字段 schema（变量校验在 service，schema 只管类型与上限） */
const templateBodySchema = {
  type: 'object',
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 64 },
    name: { type: 'string', minLength: 1, maxLength: 64 },
    channel: { type: 'string', minLength: 1, maxLength: 32 },
    subject: { type: ['string', 'null'], maxLength: 200 },
    body: { type: 'string', minLength: 1 },
    variables: {
      type: ['array', 'null'],
      maxItems: 50,
      items: { type: 'string', minLength: 1, maxLength: 64 }
    },
    enabled: { type: 'boolean' }
  }
};

async function registerTemplateRoutes(fastify) {
  registerGroupMetadata({
    name: 'noticeTemplates',
    alias: '通知模板',
    description: '通知内容模板（按事件 × 渠道）',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'noticeListTemplates',
    alias: '模板列表',
    method: 'GET',
    url: '/templates',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.TEMPLATE.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: { channel: { type: 'string', maxLength: 32 } }
      }
    },
    handler: async (request, reply) => {
      const rows = await templateService.list({ channel: request.query.channel });
      return reply.result.success('获取成功', { rows });
    }
  });

  registerSecureRoute(fastify, {
    name: 'noticeCreateTemplate',
    alias: '新建模板',
    method: 'POST',
    url: '/templates',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.TEMPLATE.WRITE,
    schema: { body: { ...templateBodySchema, required: ['code', 'name', 'channel', 'body'] } },
    handler: async (request, reply) => {
      try {
        const template = await templateService.create(request.body);
        return reply.result.success('创建成功', template);
      } catch (err) {
        return reply.result.fail(err.message || '创建失败');
      }
    }
  });

  registerSecureRoute(fastify, {
    name: 'noticeUpdateTemplate',
    alias: '编辑模板',
    method: 'PUT',
    url: '/templates/:id',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.TEMPLATE.WRITE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: templateBodySchema
    },
    handler: async (request, reply) => {
      try {
        const template = await templateService.update(request.params.id, request.body);
        return reply.result.success('保存成功', template);
      } catch (err) {
        return reply.result.fail(err.message || '保存失败');
      }
    }
  });

  registerSecureRoute(fastify, {
    name: 'noticeRemoveTemplate',
    alias: '删除模板',
    method: 'DELETE',
    url: '/templates/:id',
    requireLogin: true,
    requirePermission: NOTICE_PERMISSIONS.TEMPLATE.WRITE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: async (request, reply) => {
      try {
        await templateService.remove(request.params.id);
        return reply.result.success('删除成功', null);
      } catch (err) {
        return reply.result.fail(err.message || '删除失败');
      }
    }
  });
}

export default registerTemplateRoutes;
