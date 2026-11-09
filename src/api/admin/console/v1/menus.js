/**
 * 菜单管理接口
 *
 * GET    /admin/console/v1/menus/tree   —— 菜单树
 * POST   /admin/console/v1/menus        —— 新建菜单
 * PUT    /admin/console/v1/menus/:id    —— 编辑菜单
 * DELETE /admin/console/v1/menus/:id    —— 删除菜单（有子菜单或角色引用时拒绝）
 * GET    /admin/console/v1/menus/export —— 导出 CSV
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import menuDao from '../../../../app/console/dao/menu.dao.js';
import { withFail } from '../../../../app/console/utils/respond.js';

/** 菜单写入字段 schema（创建 / 编辑共用） */
const menuBodySchema = {
  type: 'object',
  properties: {
    parentId: { type: 'integer', minimum: 0 },
    name: { type: 'string', minLength: 1, maxLength: 50 },
    type: { type: 'string', enum: ['dir', 'menu', 'btn'] },
    icon: { type: 'string', maxLength: 64 },
    path: { type: 'string', maxLength: 200 },
    component: { type: 'string', maxLength: 200 },
    permission: { type: 'string', maxLength: 100 },
    sort: { type: 'integer', minimum: 0, maximum: 9999 },
    visible: { type: 'integer', enum: [0, 1] },
    status: { type: 'integer', enum: [0, 1] }
  }
};

/**
 * 前端驼峰字段 → 模型下划线字段
 *
 * @param {object} body 请求体
 * @returns {object} 模型字段
 */
function toModelFields(body) {
  // 用「二元组数组」而不是对象字面量：`permission: 'permission'` 这种写法会被
  // 守卫接线契约测试（src/__tests__/conventions/guard-wiring.test.js）误读成
  // 「声明了一个叫 permission 的权限码」，从而让整仓测试变红。
  const FIELDS = [
    ['parentId', 'parent_id'],
    ['name', 'name'],
    ['type', 'type'],
    ['icon', 'icon'],
    ['path', 'path'],
    ['component', 'component'],
    ['permission', 'permission'],
    ['sort', 'sort'],
    ['visible', 'visible'],
    ['status', 'status']
  ];
  const payload = {};
  for (const [from, to] of FIELDS) {
    if (body[from] !== undefined) payload[to] = body[from];
  }
  if (payload.type === 'btn' && !payload.permission) {
    throw new Error('INVALID_PARAM:按钮类型必须填写权限码');
  }
  return payload;
}

/**
 * CSV 单元格转义（防公式注入）
 *
 * @param {unknown} value 原值
 * @returns {string} 可安全写入的文本
 */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

async function registerMenuRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleMenu',
    alias: '管理后台菜单',
    description: '菜单树维护与导出',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleMenuTree',
    alias: '菜单树',
    method: 'GET',
    url: '/menus/tree',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.READ,
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await menuDao.tree());
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleMenuCreate',
    alias: '新建菜单',
    method: 'POST',
    url: '/menus',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.CREATE,
    schema: {
      body: { ...menuBodySchema, required: ['name', 'type'] }
    },
    handler: withFail(async (request, reply) => {
      const menu = await menuDao.create(toModelFields(request.body));
      return reply.result.success('创建成功', { id: menu.id });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleMenuUpdate',
    alias: '编辑菜单',
    method: 'PUT',
    url: '/menus/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: menuBodySchema
    },
    handler: withFail(async (request, reply) => {
      const menu = await menuDao.findById(request.params.id);
      if (!menu) throw new Error('NOT_FOUND:菜单不存在');
      const payload = toModelFields(request.body);
      if (payload.parent_id !== undefined && Number(payload.parent_id) === Number(menu.id)) {
        throw new Error('INVALID_PARENT:不能把菜单挂到自己下面');
      }
      await menuDao.update(menu.id, payload);
      return reply.result.success('保存成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleMenuRemove',
    alias: '删除菜单',
    method: 'DELETE',
    url: '/menus/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.DELETE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const id = request.params.id;
      const menu = await menuDao.findById(id);
      if (!menu) throw new Error('NOT_FOUND:菜单不存在');
      if ((await menuDao.countChildren(id)) > 0) throw new Error('HAS_CHILDREN:请先删除子菜单');
      if ((await menuDao.countRoleRefs(id)) > 0) throw new Error('ROLE_REFERENCED:仍有角色引用该菜单，请先解除授权');
      await menuDao.remove(id);
      return reply.result.success('删除成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleMenuExport',
    alias: '导出菜单',
    method: 'GET',
    url: '/menus/export',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.READ,
    handler: withFail(async (request, reply) => {
      const rows = await menuDao.listAll();
      const header = ['ID', '上级', '名称', '类型', '路由', '权限码', '排序', '可见', '状态'];
      const lines = rows.map(r =>
        [r.id, r.parent_id, r.name, r.type, r.path, r.permission, r.sort, r.visible, r.status].map(csvCell).join(',')
      );
      const csv = `\uFEFF${header.join(',')}\n${lines.join('\n')}`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="menus.csv"')
        .send(csv);
    })
  });
}

export default registerMenuRoutes;
