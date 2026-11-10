/**
 * Console 会话与路由接口
 *
 * GET  /admin/console/v1/session/me        —— 当前用户 + 角色 + 权限码 + 部门
 * GET  /admin/console/v1/session/routes    —— 当前用户可见菜单树
 * PUT  /admin/console/v1/session/password  —— 修改本人密码
 * POST /admin/console/v1/session/logout    —— 清除认证 Cookie
 *
 * 登录本身不在这里：走 oauth21 `/mini-login` iframe → `/auth/v1/bind-session` 换 Cookie，
 * 本模块只消费已建立的会话（`request.state.user`）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { getModel } from '../../../../framework/persistence/db/index.js';
import {
  clearAuthCookies,
  hashPassword,
  verifyPassword,
  validatePasswordStrength
} from '../../../../framework/security/auth/index.js';
import menuDao from '../../../../app/console/dao/menu.dao.js';
import { withFail } from '../../../../app/console/utils/respond.js';
import { toPermissionList, hasPermissionLike, hasAnyPermissionIn } from '../../../../app/console/utils/permissions.js';

/**
 * 当前用户是否拥有管理后台全量通配
 *
 * 🔴 `permissions` 是 PBAC 对象 `{ allows, denies }`，不能直接 `includes`。
 *
 * @param {object} user request.state.user
 * @returns {boolean} 是否全量放行
 */
function isSuperViewer(user) {
  return (
    hasPermissionLike(user?.permissions, 'admin:*') ||
    hasPermissionLike(user?.permissions, '*') ||
    (user?.roles || []).includes('superadmin')
  );
}

async function registerSessionRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleSession',
    alias: '管理后台会话',
    description: '当前用户信息、可见菜单、修改密码、退出登录',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleMe',
    alias: '当前用户',
    method: 'GET',
    url: '/session/me',
    requireLogin: true,
    handler: withFail(async (request, reply) => {
      const user = request.state.user || {};

      // 🔴 兜底闸门：登录时已由 `bind-session` 判过准入（`app/console/config.js` 的
      //    `access`），但会话建立之后角色仍可能被撤销 —— 权限每请求实时解析，
      //    这里再判一次，撤销后下一次刷新就进不来，而不是看到一片 403 的空壳。
      if (!hasAnyPermissionIn(user.permissions, 'admin') && !isSuperViewer(user)) {
        return reply.result.forbidden('该账号没有管理后台的访问权限，请联系管理员分配角色后再试');
      }

      const row = await getModel('User').findOne({
        where: { uid: user.uid },
        attributes: ['id', 'uid', 'username', 'email', 'avatar', 'status', 'dept_id']
      });
      // 部门名单独查：不给 User 模型挂 console 域的关联，避免两个 app 的模型耦合
      const dept = row?.dept_id ? await getModel('console.SysDept').findByPk(row.dept_id) : null;

      return reply.result.success('获取成功', {
        id: row?.id || user.userId || null,
        uid: user.uid,
        username: row?.username || user.username || '',
        email: row?.email || user.email || '',
        avatar: row?.avatar || user.avatar || '',
        status: row?.status ?? user.status ?? 1,
        deptId: row?.dept_id || null,
        deptName: dept?.name || '',
        roles: user.roles || [],
        permissions: toPermissionList(user.permissions)
      });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleRoutes',
    alias: '可见菜单',
    method: 'GET',
    url: '/session/routes',
    requireLogin: true,
    handler: withFail(async (request, reply) => {
      const user = request.state.user || {};
      const tree = await menuDao.tree({ onlyEnabled: true });

      // 全量管理员直接拿整棵树；其余按「角色 → 菜单」过滤，未授权的分支整枝剪掉
      if (isSuperViewer(user)) {
        return reply.result.success('获取成功', tree);
      }

      const Role = getModel('Role');
      const roles = await Role.findAll({
        where: { code: (user.roles || []).length > 0 ? user.roles : ['__none__'] },
        attributes: ['id']
      });
      const allowed = new Set();
      for (const role of roles) {
        for (const id of await menuDao.getRoleMenuIds(role.id)) allowed.add(id);
      }

      /**
       * 递归裁剪：父节点未授权则整枝丢弃
       *
       * @param {Array<object>} nodes 菜单节点
       * @returns {Array<object>} 裁剪后的菜单
       */
      const prune = nodes =>
        nodes
          .filter(node => allowed.has(Number(node.id)))
          .map(node => ({ ...node, children: prune(node.children || []) }));

      return reply.result.success('获取成功', prune(tree));
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleChangePassword',
    alias: '修改本人密码',
    method: 'PUT',
    url: '/session/password',
    requireLogin: true,
    schema: {
      body: {
        type: 'object',
        required: ['oldPassword', 'newPassword'],
        properties: {
          oldPassword: { type: 'string', minLength: 1, maxLength: 128 },
          newPassword: { type: 'string', minLength: 8, maxLength: 128 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const user = request.state.user || {};
      const { oldPassword, newPassword } = request.body;

      const identity = await getModel('UserIdentity').findOne({
        where: { user_id: user.userId, identity_type: 'password' }
      });
      if (!identity) throw new Error('NOT_FOUND:当前账号没有密码凭证，无法修改密码');

      const ok = await verifyPassword(oldPassword, identity.credential);
      if (!ok) throw new Error('INVALID_PARAM:原密码不正确');

      const validation = validatePasswordStrength(newPassword);
      if (!validation.valid) throw new Error(`INVALID_PARAM:${validation.errors[0]}`);

      const hashed = await hashPassword(newPassword);
      await getModel('UserIdentity').update({ credential: hashed }, { where: { id: identity.id } });
      return reply.result.success('密码已更新', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLogout',
    alias: '退出登录',
    method: 'POST',
    url: '/session/logout',
    requireLogin: true,
    handler: withFail(async (request, reply) => {
      await clearAuthCookies(reply);
      return reply.result.success('已退出登录', null);
    })
  });
}

export default registerSessionRoutes;
