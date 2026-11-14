/**
 * 部门管理接口
 *
 * GET    /admin/console/v1/depts/tree    —— 部门树（含成员数）
 * GET    /admin/console/v1/depts/options —— 扁平选项（启用项）
 * POST   /admin/console/v1/depts         —— 新建部门
 * PUT    /admin/console/v1/depts/:id     —— 编辑部门（父级变化时重写下级 ancestors）
 * DELETE /admin/console/v1/depts/:id     —— 删除部门（有子部门或成员时拒绝）
 * GET    /admin/console/v1/depts/:id/history —— 变更历史（读审计：谁改了什么）
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import deptDao, { DEPT_AUDIT_TYPES } from '../../../../app/console/dao/dept.dao.js';
import { logAuditEvent } from '../../../../framework/security/auth/index.js';
import { withFail } from '../../../../app/console/utils/respond.js';
import { resolveDataScope, filterDeptTree } from '../../../../app/console/services/data-scope.service.js';

/** 参与 diff 的字段与中文名（历史里"改了什么"必须能读懂，不能是一串列名） */
const TRACKED_FIELDS = [
  ['name', '部门名称'],
  ['parent_id', '上级部门'],
  ['leader', '负责人'],
  ['phone', '联系电话'],
  ['email', '邮箱'],
  ['sort', '排序'],
  ['status', '状态']
];

/**
 * 值 → 可读文本
 *
 * @param {string} field 字段名
 * @param {*} value 原值
 * @param {Map<number, string>} deptNames 部门 id → 名称（换父级时显示名字而不是 id）
 * @returns {string} 展示文本
 */
function readableValue(field, value, deptNames) {
  if (value === null || value === undefined || value === '') return '（空）';
  if (field === 'status') return Number(value) === 1 ? '启用' : '停用';
  if (field === 'parent_id') return Number(value) === 0 ? '顶级部门' : deptNames.get(Number(value)) || `#${value}`;
  return String(value);
}

/**
 * 算出一次编辑改了哪些字段
 *
 * @param {object} before 修改前（模型字段）
 * @param {object} after 修改后（模型字段）
 * @param {Map<number, string>} deptNames 部门 id → 名称
 * @returns {Array<{field: string, label: string, from: string, to: string}>} 变更项
 */
function diffDept(before, after, deptNames) {
  const changes = [];
  for (const [field, label] of TRACKED_FIELDS) {
    const from = before?.[field] ?? null;
    const to = after?.[field] ?? null;
    if (String(from ?? '') === String(to ?? '')) continue;
    changes.push({
      field,
      label,
      from: readableValue(field, from, deptNames),
      to: readableValue(field, to, deptNames)
    });
  }
  return changes;
}

/**
 * 取部门名映射（写审计时把 parent_id 翻译成名字）
 *
 * @param {number[]} ids 部门 ID
 * @returns {Promise<Map<number, string>>} id → name
 */
async function deptNameMap(ids) {
  const list = await deptDao.listAll();
  const wanted = new Set((ids || []).map(Number));
  const map = new Map();
  for (const row of list) if (wanted.has(Number(row.id))) map.set(Number(row.id), row.name);
  return map;
}

/**
 * 写一条部门审计
 *
 * 失败不影响业务（`logAuditEvent` 内部已吞异常）：审计缺失是可接受的降级，
 * 而"因为写不了审计就不让改部门"会把后台卡死。
 *
 * @param {import('fastify').FastifyRequest} request 请求
 * @param {string} type 事件类型
 * @param {object} details 详情
 * @returns {Promise<void>}
 */
async function audit(request, type, details) {
  await logAuditEvent({
    type,
    userId: request.state.user?.userId ? Number(request.state.user.userId) : null,
    ip: request.ip,
    userAgent: request.headers['user-agent'] || '',
    appId: 'console',
    details
  });
}

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
      const tree = await deptDao.tree();
      /*
       * 部门树同样受行级数据范围约束：能看到哪些部门，只能在自己的数据范围内挑。
       * 否则"用户只能看本部门"，但部门树仍然把全公司列出来 —— 树本身就是一次越权读。
       */
      const scope = await resolveDataScope(request.state.user?.userId);
      return reply.result.success('获取成功', filterDeptTree(tree, scope, scope.actorDeptId));
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
      await audit(request, DEPT_AUDIT_TYPES.CREATE, {
        deptId: Number(dept.id),
        name: dept.name,
        parentId: Number(dept.parent_id),
        changes: []
      });
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
      // 先取旧值：审计要的是"从什么改成什么"，改完再读就只能记一条"改过"
      const before = await deptDao.findById(request.params.id);
      if (!before) throw new Error('NOT_FOUND:部门不存在');
      const ok = await deptDao.update(request.params.id, toModelFields(request.body));
      if (!ok) throw new Error('NOT_FOUND:部门不存在');

      const after = await deptDao.findById(request.params.id);
      const parentIds = [before.parent_id, after?.parent_id].filter(v => v !== null && v !== undefined);
      const names = await deptNameMap(parentIds);
      const changes = diffDept(
        { ...before.get({ plain: true }), parent_id: before.parent_id },
        { ...(after?.get({ plain: true }) ?? {}), parent_id: after?.parent_id },
        names
      );
      await audit(request, DEPT_AUDIT_TYPES.UPDATE, {
        deptId: Number(request.params.id),
        name: after?.name ?? before.name,
        parentId: Number(after?.parent_id ?? before.parent_id),
        changes
      });
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
      // 删除是硬删：审计里的快照是这个名字最后的痕迹，不能省
      const snapshot = await deptDao.findById(id);
      await deptDao.remove(id);
      await audit(request, DEPT_AUDIT_TYPES.DELETE, {
        deptId: Number(id),
        name: snapshot?.name ?? null,
        parentId: snapshot ? Number(snapshot.parent_id) : null,
        changes: []
      });
      return reply.result.success('删除成功', null);
    })
  });

  /**
   * 部门变更历史
   *
   * 组织架构是权限的根（"本部门及以下"的数据范围由它决定），一旦被悄悄改了父级或
   * 停用，权限范围会跟着变 —— 所以每个部门都要能回答"这棵树是谁、什么时候、改成
   * 什么样"。数据来自审计表（写操作处落库），不是另建一张变更表。
   */
  registerSecureRoute(fastify, {
    name: 'consoleDeptHistory',
    alias: '部门变更历史',
    method: 'GET',
    url: '/depts/:id/history',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DEPT.READ,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      querystring: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }
      }
    },
    handler: withFail(async (request, reply) => {
      const rows = await deptDao.history(request.params.id, { limit: request.query.limit ?? 50 });
      return reply.result.success('获取成功', { rows, total: rows.length });
    })
  });
}

export { diffDept, readableValue };
export default registerDeptRoutes;
