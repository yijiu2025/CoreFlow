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
 * 🔴 **授予上限**：非超管只能写入自己持有（含通配覆盖）的权限码，见
 *    `access-scope.service.js` 的 `assertCanGrantCodes`。职级闸只挡"改多高的角色"，
 *    挡不住"往自己能改的角色里塞 admin:*，再授给自己"—— 那一步就是靠这条拦的。
 *
 * 🔴 **权限变更必须留痕**：policy 从 3 个码变成 `admin:*` 这种动作，事后必须能回答
 *    "谁在什么时候加的"。`PERMISSION_CHANGE` 记 added / removed 两个差集。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import roleDao, {
  MENU_LOCKED_CODE,
  isProtectedRoleCode,
  extractPermissions
} from '../../../../app/console/dao/role.dao.js';
import menuDao from '../../../../app/console/dao/menu.dao.js';
import { getModel } from '../../../../framework/persistence/db/index.js';
import { logAuditEvent } from '../../../../framework/security/auth/index.js';
import { withFail } from '../../../../app/console/utils/respond.js';
import { hasPermissionLike } from '../../../../app/console/utils/permissions.js';
import {
  appLabel,
  canWriteApp,
  getActorScope,
  assertCanGrantCodes
} from '../../../../app/console/services/access-scope.service.js';
import { invalidateButtonGrants } from '../../../../app/console/services/button-grant.service.js';

/*
 * 「受保护角色」的判据在 `role.dao.js` 的 `isProtectedRoleCode`（单一来源）。
 * 这里曾经自己拼过一份 `BUILTIN_CODES`，而列表返回的 `builtin` 用的是另一份 ——
 * 两套判据对不上，前端就把超管当成了可删/可改权限码的普通角色。
 */

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

/**
 * 写一条角色审计
 *
 * 失败不影响业务（`logAuditEvent` 内部已吞异常）：审计缺失是可接受的降级，
 * 而"因为写不了审计就不让改角色"会把后台卡死。
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
      /*
       * 逐行标 `manageable`：前端据此把编辑/删除按钮置灰，而不是让人填完表单再吃 403。
       * 判据与写接口完全一致（同一份 `canWriteApp` + 职级闸），不另写一套。
       */
      const actor = await getActorScope(request.state.user?.userId);
      const marked = rows.map(role => ({
        ...role,
        app_label: appLabel(role.app_id),
        manageable: canWriteApp(actor, role.app_id) && (actor.isSuper || Number(role.rank_level) < actor.maxRank)
      }));
      return reply.result.success('获取成功', { rows: marked, total, pageNum, pageSize });
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
          menuIds: { type: 'array', items: { type: 'integer', minimum: 1 }, default: [] },
          /** 数据范围：1 全部 / 2 自定义 / 3 本部门 / 4 本部门及以下 / 5 仅本人 */
          dataScope: { type: 'integer', enum: [1, 2, 3, 4, 5], default: 1 },
          /** 自定义数据范围时的部门集合（其它档位忽略） */
          deptIds: { type: 'array', items: { type: 'integer', minimum: 1 }, default: [] }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { menuIds = [], ...payload } = request.body;
      const myRank = await maxRankOf(request.state.user?.userId);
      if (Number(payload.rankLevel || 1) > myRank) throw new Error('FORBIDDEN:不能创建高于自己职级的角色');
      // 只能在自己管辖的应用下建角色：否则防火墙管理员可以造一个 admin 角色的同名副本
      const actor = await getActorScope(request.state.user?.userId);
      if (!canWriteApp(actor, payload.appId || 'GLOBAL')) {
        throw new Error(`FORBIDDEN:不能创建${appLabel(payload.appId)}应用的角色`);
      }
      if (await roleDao.isCodeTaken(payload.code, payload.appId || 'GLOBAL')) {
        throw new Error('DUPLICATE:角色编码已存在');
      }
      /*
       * 授予上限：新建时提交的码**全部**是新增的，整份判。
       * 这是"建一个 rank 低于我的角色、塞 admin:*、再授给自己"那条路的入口，
       * 只靠职级闸挡不住（职级闸只管 rank）。
       */
      assertCanGrantCodes(request.state.user, payload.permissions, { action: '创建' });
      const role = await roleDao.create(payload);
      if (menuIds.length > 0) {
        await menuDao.setRoleMenus(role.id, menuIds);
        invalidateButtonGrants();
      }
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
          menuIds: { type: 'array', items: { type: 'integer', minimum: 1 } },
          dataScope: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          deptIds: { type: 'array', items: { type: 'integer', minimum: 1 } }
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
      if (isProtectedRoleCode(role.code) && request.body.permissions !== undefined) {
        throw new Error('BUILTIN_PROTECTED:内置角色的权限码不可修改');
      }

      const myRank = await maxRankOf(request.state.user?.userId);
      if (Number(role.rank_level) > myRank) throw new Error('FORBIDDEN:不能编辑职级高于自己的角色');
      // 应用域：非跨应用管理员只能维护自己应用的角色（改别人的角色 = 改别人的授权效果）
      const actor = await getActorScope(request.state.user?.userId);
      if (!canWriteApp(actor, role.app_id)) {
        throw new Error(`FORBIDDEN:不能编辑${appLabel(role.app_id)}应用的角色`);
      }
      if (request.body.rankLevel !== undefined && Number(request.body.rankLevel) > myRank) {
        throw new Error('FORBIDDEN:不能把角色提升到高于自己的职级');
      }

      const { menuIds, ...payload } = request.body;

      /*
       * 权限码的「前 / 后 / 差」只算一次：授予上限要 added，审计要 added + removed。
       *
       * 🔴 上限只判 added。表单保存时会连**原有码一起提交**，如果对整份清单判，
       *    一个只持有部分码的操作员连"给角色改名"都会被拒（角色里本来就有他够不着的码），
       *    护栏就成了路障。删码不设上限：那不会提权，且受职级闸与本条审计约束。
       */
      const beforeCodes = extractPermissions(role.policy);
      const afterCodes = Array.isArray(payload.permissions) ? Array.from(new Set(payload.permissions)) : null;
      const addedCodes = afterCodes ? afterCodes.filter(code => !beforeCodes.includes(code)) : [];
      const removedCodes = afterCodes ? beforeCodes.filter(code => !afterCodes.includes(code)) : [];

      assertCanGrantCodes(request.state.user, addedCodes);

      await roleDao.update(role.id, payload);
      if (Array.isArray(menuIds)) {
        await menuDao.setRoleMenus(role.id, menuIds);
        // 菜单授权变了 → 按钮闸的缓存必须立刻失效，否则"刚取消勾选却还能调接口"最多持续 TTL
        invalidateButtonGrants();
      }

      /*
       * 审计：**只记真实变化**。每次保存都写一条会把日志淹掉（表单会全量回传），
       * 而"授权被扩到 admin:*"这种事故恰恰要在成百条"保存成功"里被一眼找到。
       */
      if (addedCodes.length > 0 || removedCodes.length > 0) {
        await audit(request, 'PERMISSION_CHANGE', {
          roleId: role.id,
          roleCode: role.code,
          roleName: role.name,
          appId: role.app_id,
          added: addedCodes,
          removed: removedCodes
        });
      }
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
      if (isProtectedRoleCode(role.code)) throw new Error('BUILTIN_PROTECTED:内置角色不可删除');

      const myRank = await maxRankOf(request.state.user?.userId);
      if (Number(role.rank_level) > myRank) throw new Error('FORBIDDEN:不能删除职级高于自己的角色');
      const actor = await getActorScope(request.state.user?.userId);
      if (!canWriteApp(actor, role.app_id)) {
        throw new Error(`FORBIDDEN:不能删除${appLabel(role.app_id)}应用的角色`);
      }

      await roleDao.remove(role.id);
      // 角色没了，它授出去的按钮也一并失效 —— 缓存里可能还留着"该角色曾授权"快照
      invalidateButtonGrants();
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
      /*
       * 只有超管锁菜单，**不能**用 `isProtectedRoleCode`：
       * 那个判据覆盖了全部"由代码声明"的角色（本仓几乎每个角色都是），拿它锁菜单
       * 等于矩阵里一列都点不动 —— 菜单可见性是运行期数据，声明过角色 ≠ 菜单不能调。
       * 超管必须锁：policy 是 `admin:*` 全量，勾掉菜单它自己就没后台入口了。
       */
      if (role.code === MENU_LOCKED_CODE) {
        throw new Error('BUILTIN_PROTECTED:超级管理员的菜单固定为全部，不可修改');
      }
      // 菜单授权同样是"改这个角色"：跨应用改别人的侧栏等于改别人看到的后台
      const actor = await getActorScope(request.state.user?.userId);
      if (!canWriteApp(actor, role.app_id)) {
        throw new Error(`FORBIDDEN:不能修改${appLabel(role.app_id)}应用角色的菜单授权`);
      }
      const count = await menuDao.setRoleMenus(role.id, request.body.menuIds);
      /*
       * 🔴 必须立刻失效按钮授权缓存：这条保存正是"关掉某个按钮"的动作，而守卫每次判定
       * 都会问一次缓存过的授权 —— 不清就要等 TTL 到期，期间"已经取消勾选却还能调接口"。
       */
      invalidateButtonGrants();
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
