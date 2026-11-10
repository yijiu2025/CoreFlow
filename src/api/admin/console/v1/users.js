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
 * GET    /admin/console/v1/users/:id/grants      —— 授权历史（授予 / 取消流水）
 * POST   /admin/console/v1/users/roles/batch     —— 批量授权（追加 / 移除）
 *
 * 手机号为密文存储，列表与导出均不返回（脱敏口径与 `app/user` 一致）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import userDao from '../../../../app/console/dao/user.dao.js';
import roleDao from '../../../../app/console/dao/role.dao.js';
import grantDao from '../../../../app/console/dao/grant.dao.js';
import { withFail } from '../../../../app/console/utils/respond.js';

/**
 * 当前操作人（写授权流水用）
 *
 * 不查库：`request.state.user` 里已有会话快照的 userId / username，
 * 流水只记"谁点的"，快照足够，且避免每次写操作多一次查询。
 *
 * @param {import('fastify').FastifyRequest} request 请求
 * @returns {{ id: number|null, username: string }} 操作人
 */
function actorOf(request) {
  const user = request.state?.user;
  return {
    id: user?.userId ? Number(user.userId) : null,
    username: user?.username || '未知'
  };
}

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
      const user = await userDao.create(request.body, actorOf(request));
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
      /**
       * 防自锁：不允许把「自己」的管理权限摘干净。
       *
       * 权限是**每次请求实时判定**的，所以把当前账号的最后一个管理角色去掉后，
       * 下一次请求立刻 403 —— 而你已经没有权限再改回来，只能直连数据库改 policy
       * 或找另一个管理员。这不是理论风险：实测清空自己的角色后当场失去后台入口。
       *
       * 只拦「保存后自己不再有任何 admin 能力」这一种情形：
       * 换成另一个仍有 `admin:*` 的角色是允许的（那是正常调整）。
       */
      if (Array.isArray(request.body.roleIds) && Number(request.params.id) === Number(request.state.user?.userId)) {
        const stillAdmin = await roleDao.hasAdminCapability(request.body.roleIds);
        if (!stillAdmin) {
          throw new Error('FORBIDDEN:不能移除自己的全部管理权限，否则会立刻锁死后台');
        }
      }
      const ok = await userDao.update(request.params.id, request.body, actorOf(request));
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

  /**
   * 授权历史：谁在什么时候把这个用户的哪个角色授予/取消了
   *
   * 返回的是**流水**而不是当前快照 —— 用户改名、角色改名都不会影响历史可读性
   * （写库时已快照 username / role_name / operator_name）。
   */
  registerSecureRoute(fastify, {
    name: 'consoleUserGrants',
    alias: '用户授权历史',
    method: 'GET',
    url: '/users/:id/grants',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.READ,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      querystring: {
        type: 'object',
        properties: {
          pageNum: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
          action: { type: 'string', enum: ['', 'grant', 'revoke'] }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 20, action = '' } = request.query;
      const page = await grantDao.pageByUser(request.params.id, { pageNum, pageSize, action });
      return reply.result.success('获取成功', page);
    })
  });

  /**
   * 批量授权：对多个用户追加 / 移除同一组角色
   *
   * 语义只有「追加」「移除」，**没有覆盖** —— 覆盖式批量的破坏力太大：
   * 一次误操作就会把一批人原有角色全冲掉，而授权流水只能事后解释、无法恢复。
   * 需要覆盖时逐个走单条编辑。
   *
   * 🔴 防自锁必须先**整体预检**再落库：逐个"改到一半才发现不能改自己"会留下
   *    半批已生效、半批没动的状态，用户看到的成功数是假的。
   */
  registerSecureRoute(fastify, {
    name: 'consoleUserBatchGrant',
    alias: '批量授权',
    method: 'POST',
    url: '/users/roles/batch',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.UPDATE,
    schema: {
      body: {
        type: 'object',
        required: ['userIds', 'roleIds', 'mode'],
        properties: {
          userIds: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1, maxItems: 200 },
          roleIds: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1, maxItems: 100 },
          mode: { type: 'string', enum: ['add', 'remove'] }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const actor = actorOf(request);
      const { userIds, roleIds, mode } = request.body;
      const targets = Array.from(new Set(userIds.map(Number)));
      const grants = Array.from(new Set(roleIds.map(Number)));

      // 1. 预检：算出每个用户的目标角色集合，先判自锁
      const plans = [];
      for (const userId of targets) {
        const current = await userDao.activeRoleIds(userId);
        const next =
          mode === 'add' ? Array.from(new Set([...current, ...grants])) : current.filter(id => !grants.includes(id));
        if (userId === Number(actor.id) && !(await roleDao.hasAdminCapability(next))) {
          throw new Error('FORBIDDEN:批量操作会移除你自己的全部管理权限，已中止（未改动任何用户）');
        }
        plans.push({ userId, next });
      }

      // 2. 落库（逐用户一个事务，任一失败即整体报错，不会静默半成功）
      for (const plan of plans) {
        await userDao.update(plan.userId, { roleIds: plan.next }, { ...actor, remark: '批量授权' });
      }

      return reply.result.success(`已更新 ${plans.length} 个用户的角色`, { count: plans.length });
    })
  });
}

export default registerUserRoutes;
