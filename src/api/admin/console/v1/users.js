/**
 * 用户管理接口
 *
 * GET    /admin/console/v1/users                 —— 分页列表（含部门 / 角色 / 岗位）
 * GET    /admin/console/v1/users/options         —— 表单引用选项
 * POST   /admin/console/v1/users                 —— 新建（用户 + 凭证 + 角色 + 岗位）
 * PUT    /admin/console/v1/users/:id             —— 编辑
 * DELETE /admin/console/v1/users/:id             —— 删除（软删除 + 清关联）
 * PUT    /admin/console/v1/users/:id/status      —— 启用 / 冻结
 * PUT    /admin/console/v1/users/:id/password    —— 重置密码
 * GET    /admin/console/v1/users/export          —— 导出 CSV
 *
 * 手机号为密文存储，列表与导出均不返回（脱敏口径与 `app/user` 一致）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import userDao from '../../../../app/console/dao/user.dao.js';
import { withFail } from '../../../../app/console/utils/respond.js';

/** 列表查询参数 schema（没有 schema 时 limit=abc 会变成 NaN 触发 500） */
const listQuerySchema = {
  type: 'object',
  properties: {
    pageNum: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
    keyword: { type: 'string', maxLength: 100 },
    deptId: { type: 'integer', minimum: 0 },
    status: { type: 'integer', enum: [-1, 0, 1] }
  }
};

/**
 * 把用户行转成 CSV 单元格（防公式注入）
 *
 * @param {unknown} value 原值
 * @returns {string} 可安全写入 CSV 的文本
 */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

async function registerUserRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleUser',
    alias: '管理后台用户',
    description: '用户列表、创建、编辑、状态、重置密码、导出',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserList',
    alias: '用户列表',
    method: 'GET',
    url: '/users',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.READ,
    schema: { querystring: listQuerySchema },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 20, keyword = '', deptId = null, status = null } = request.query;
      const { rows, total } = await userDao.page({ pageNum, pageSize, keyword, deptId, status });
      return reply.result.success('获取成功', { rows, total, pageNum, pageSize });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserOptions',
    alias: '用户引用选项',
    method: 'GET',
    url: '/users/options',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.READ,
    handler: withFail(async (request, reply) => {
      const data = await userDao.options();
      return reply.result.success('获取成功', data);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserCreate',
    alias: '新建用户',
    method: 'POST',
    url: '/users',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.CREATE,
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 50 },
          email: { type: 'string', maxLength: 100 },
          password: { type: 'string', minLength: 8, maxLength: 128 },
          deptId: { type: ['integer', 'null'], minimum: 0 },
          status: { type: 'integer', enum: [-1, 0, 1], default: 1 },
          roleIds: { type: 'array', items: { type: 'integer', minimum: 1 }, default: [] },
          postIds: { type: 'array', items: { type: 'integer', minimum: 1 }, default: [] }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const user = await userDao.create(request.body);
      return reply.result.success('创建成功', { id: user.id, uid: user.uid });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserUpdate',
    alias: '编辑用户',
    method: 'PUT',
    url: '/users/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 50 },
          email: { type: 'string', maxLength: 100 },
          deptId: { type: ['integer', 'null'], minimum: 0 },
          status: { type: 'integer', enum: [-1, 0, 1] },
          roleIds: { type: 'array', items: { type: 'integer', minimum: 1 } },
          postIds: { type: 'array', items: { type: 'integer', minimum: 1 } }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const ok = await userDao.update(request.params.id, request.body);
      if (!ok) throw new Error('NOT_FOUND:用户不存在');
      return reply.result.success('保存成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserStatus',
    alias: '更新用户状态',
    method: 'PUT',
    url: '/users/:id/status',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'integer', enum: [-1, 0, 1] } }
      }
    },
    handler: withFail(async (request, reply) => {
      const ok = await userDao.updateStatus(request.params.id, request.body.status);
      if (!ok) throw new Error('NOT_FOUND:用户不存在');
      return reply.result.success('状态已更新', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserResetPassword',
    alias: '重置用户密码',
    method: 'PUT',
    url: '/users/:id/password',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        required: ['password'],
        properties: { password: { type: 'string', minLength: 8, maxLength: 128 } }
      }
    },
    handler: withFail(async (request, reply) => {
      await userDao.resetPassword(request.params.id, request.body.password);
      return reply.result.success('密码已重置', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserRemove',
    alias: '删除用户',
    method: 'DELETE',
    url: '/users/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.DELETE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const ok = await userDao.remove(request.params.id);
      if (!ok) throw new Error('NOT_FOUND:用户不存在');
      return reply.result.success('删除成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserExport',
    alias: '导出用户',
    method: 'GET',
    url: '/users/export',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.READ,
    schema: { querystring: listQuerySchema },
    handler: withFail(async (request, reply) => {
      const { keyword = '', deptId = null, status = null } = request.query;
      const { rows } = await userDao.page({ pageNum: 1, pageSize: 5000, keyword, deptId, status });
      const header = ['ID', '账号', '邮箱', '部门', '角色', '岗位', '状态', '创建时间'];
      const lines = rows.map(r =>
        [
          r.id,
          r.username,
          r.email,
          r.dept_name,
          r.role_names,
          r.post_names,
          r.status === 1 ? '正常' : r.status === 0 ? '冻结' : '注销',
          r.created_at
        ]
          .map(csvCell)
          .join(',')
      );
      const csv = `\uFEFF${header.join(',')}\n${lines.join('\n')}`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="users.csv"')
        .send(csv);
    })
  });
}

export default registerUserRoutes;
