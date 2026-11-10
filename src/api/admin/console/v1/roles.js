/**
 * 角色与权限接口
 *
 * GET    /admin/console/v1/roles                 —— 角色分页（含成员数 / 已授权菜单）
 * POST   /admin/console/v1/roles                 —— 新建角色（编码 + 职级 + 权限码）
 * PUT    /admin/console/v1/roles/:id             —— 编辑角色
 * DELETE /admin/console/v1/roles/:id             —— 删除角色（内置角色拒绝）
 * GET    /admin/console/v1/roles/:id/menus       —— 角色已授权菜单
 * PUT    /admin/console/v1/roles/:id/menus       —— 覆盖式保存菜单授权
 * GET    /admin/console/v1/permissions/graph     —— 用户 → 角色 → 菜单关系图
 * GET    /admin/console/v1/permissions/catalog   —— 权限码目录（角色表单勾选）
 *
 * 🔴 职级压制：不能创建 / 提升到高于自己的职级，否则可自我提权。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import roleDao from '../../../../app/console/dao/role.dao.js';
import menuDao from '../../../../app/console/dao/menu.dao.js';
import { getModel } from '../../../../framework/persistence/db/index.js';
import { roleRegistry } from '../../../../framework/security/pbac/index.js';
import { withFail } from '../../../../app/console/utils/respond.js';
import { hasPermissionLike } from '../../../../app/console/utils/permissions.js';

/**
 * 内置角色编码（不可删除、不可改菜单授权）
 *
 * `roleRegistry` 只覆盖各 app 用 `defineRoles` 声明的角色；`superadmin` 由初始化脚本
 * 直接落库（见 scripts/setup-superadmin.js），不在注册表里 —— 必须显式补上，
 * 否则「删掉超级管理员」这种不可逆操作会一路放行。
 */
const BUILTIN_CODES = new Set([...roleRegistry.map(r => r.code), 'superadmin']);

/**
 * 查询当前操作者的最高职级
 *
 * @param {number} userId 用户内部 ID
 * @returns {Promise<number>} 最高职级（无角色为 0）
 */
async function maxRankOf(userId) {
  if (!userId) return 0;
  // 两步模型查询（关联表 → 角色），不 JOIN：模型层已经处理好软删除与字段映射，
  // 而且 iam_user_role / iam_role 之间没有挂 association（跨域不做耦合）
  const links = await getModel('UserRole').findAll({
    where: { user_id: userId, delete_version: 0 },
    attributes: ['role_id'],
    raw: true
  });
  if (links.length === 0) return 0;
  const roleIds = Array.from(new Set(links.map(l => Number(l.role_id))));
  // Role 是 paranoid 模型，已删除的角色自动排除（等价于原 SQL 的 deleted_at IS NULL）
  const max = await getModel('Role').max('rank_level', { where: { id: roleIds } });
  return Number(max || 0);
}

async function registerRoleRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleRole',
    alias: '管理后台角色',
    description: '角色维护、菜单授权、权限关系图',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleRoleList',
    alias: '角色列表',
    method: 'GET',
    url: '/roles',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.ROLE.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          pageNum: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
          keyword: { type: 'string', maxLength: 100 },
          appId: { type: 'string', maxLength: 64 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 20, keyword = '', appId = '' } = request.query;
      const { rows, total } = await roleDao.page({ pageNum, pageSize, keyword, appId });
      return reply.result.success('获取成功', { rows, total, pageNum, pageSize });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleRoleCreate',
    alias: '新建角色',
    method: 'POST',
    url: '/roles',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.ROLE.CREATE,
    schema: {
      body: {
        type: 'object',
        required: ['code', 'name'],
        properties: {
          code: { type: 'string', minLength: 2, maxLength: 50 },
          name: { type: 'string', minLength: 1, maxLength: 50 },
          appId: { type: 'string', maxLength: 64, default: 'GLOBAL' },
          rankLevel: { type: 'integer', minimum: 0, maximum: 99, default: 1 },
          description: { type: 'string', maxLength: 255 },
          permissions: { type: 'array', items: { type: 'string' }, default: [] },
          menuIds: { type: 'array', items: { type: 'integer', minimum: 1 }, default: [] }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { menuIds = [], ...payload } = request.body;
      const myRank = await maxRankOf(request.state.user?.userId);
      if (Number(payload.rankLevel || 1) > myRank) throw new Error('FORBIDDEN:不能创建高于自己职级的角色');
      if (await roleDao.isCodeTaken(payload.code, payload.appId || 'GLOBAL')) {
        throw new Error('DUPLICATE:角色编码已存在');
      }
      const role = await roleDao.create(payload);
      if (menuIds.length > 0) await menuDao.setRoleMenus(role.id, menuIds);
      return reply.result.success('创建成功', { id: role.id });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleRoleUpdate',
    alias: '编辑角色',
    method: 'PUT',
    url: '/roles/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.ROLE.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          rankLevel: { type: 'integer', minimum: 0, maximum: 99 },
          description: { type: 'string', maxLength: 255 },
          permissions: { type: 'array', items: { type: 'string' } },
          menuIds: { type: 'array', items: { type: 'integer', minimum: 1 } }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const role = await roleDao.findById(request.params.id);
      if (!role) throw new Error('NOT_FOUND:角色不存在');

      /**
       * 内置角色的 **权限码不可改**（编码不可改由 schema 保证：body 里没有 code）。
       *
       * 为什么不只是「提示一下」：内置角色的 policy 是代码里 `defineRoles` 声明的，
       * 运行时改库会与代码漂移（下次启动也不会回滚）；更要紧的是把 superadmin 的
       * `admin:*` 删掉，保存瞬间自己就失去全部权限，**没有任何其他账号能救**，
       * 只能直连数据库改 policy。name / description / rankLevel 仍可改。
       */
      if (BUILTIN_CODES.has(role.code) && request.body.permissions !== undefined) {
        throw new Error('BUILTIN_PROTECTED:内置角色的权限码不可修改');
      }

      const myRank = await maxRankOf(request.state.user?.userId);
      if (Number(role.rank_level) > myRank) throw new Error('FORBIDDEN:不能编辑职级高于自己的角色');
      if (request.body.rankLevel !== undefined && Number(request.body.rankLevel) > myRank) {
        throw new Error('FORBIDDEN:不能把角色提升到高于自己的职级');
      }

      const { menuIds, ...payload } = request.body;
      await roleDao.update(role.id, payload);
      if (Array.isArray(menuIds)) await menuDao.setRoleMenus(role.id, menuIds);
      return reply.result.success('保存成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleRoleRemove',
    alias: '删除角色',
    method: 'DELETE',
    url: '/roles/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.ROLE.DELETE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const role = await roleDao.findById(request.params.id);
      if (!role) throw new Error('NOT_FOUND:角色不存在');
      if (BUILTIN_CODES.has(role.code)) throw new Error('BUILTIN_PROTECTED:内置角色不可删除');

      const myRank = await maxRankOf(request.state.user?.userId);
      if (Number(role.rank_level) > myRank) throw new Error('FORBIDDEN:不能删除职级高于自己的角色');

      await roleDao.remove(role.id);
      return reply.result.success('删除成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleRoleMenus',
    alias: '角色菜单授权',
    method: 'GET',
    url: '/roles/:id/menus',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.ROLE.READ,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const menuIds = await menuDao.getRoleMenuIds(request.params.id);
      return reply.result.success('获取成功', { menuIds });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleRoleSetMenus',
    alias: '保存角色菜单授权',
    method: 'PUT',
    url: '/roles/:id/menus',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.ROLE.UPDATE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        required: ['menuIds'],
        properties: { menuIds: { type: 'array', items: { type: 'integer', minimum: 1 } } }
      }
    },
    handler: withFail(async (request, reply) => {
      const role = await roleDao.findById(request.params.id);
      if (!role) throw new Error('NOT_FOUND:角色不存在');
      if (BUILTIN_CODES.has(role.code)) throw new Error('BUILTIN_PROTECTED:内置角色的菜单授权不可修改');
      const count = await menuDao.setRoleMenus(role.id, request.body.menuIds);
      return reply.result.success('授权已保存', { count });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consolePermissionGraph',
    alias: '权限关系图',
    method: 'GET',
    url: '/permissions/graph',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.ROLE.READ,
    handler: withFail(async (request, reply) => {
      const permissions = request.state.user?.permissions;
      const canSeeUsers = hasPermissionLike(permissions, 'admin:user:read');
      const data = await roleDao.graph(canSeeUsers);
      return reply.result.success('获取成功', data);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consolePermissionCatalog',
    alias: '权限码目录',
    method: 'GET',
    url: '/permissions/catalog',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.ROLE.READ,
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', roleDao.permissionCatalog());
    })
  });
}

export default registerRoleRoutes;
