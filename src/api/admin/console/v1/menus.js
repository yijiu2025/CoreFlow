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
import { actionMetaRegistry } from '../../../../framework/security/pbac/index.js';
import menuDao from '../../../../app/admin/console/dao/menu.dao.js';
import { getActorScope } from '../../../../app/admin/console/services/access-scope.service.js';
import { appNameOf, canConfigureApp } from '../../../../app/admin/console/services/menu-scope.service.js';
import { invalidateButtonGrants } from '../../../../app/admin/console/services/button-grant.service.js';
import { withFail } from '../../../../app/admin/console/utils/respond.js';
import { logAuditEvent } from '../../../../framework/security/auth/index.js';

/** 菜单写入字段 schema（创建 / 编辑共用） */
const menuBodySchema = {
  type: 'object',
  properties: {
    parentId: { type: 'integer', minimum: 0 },
    /** 归属应用：默认 admin（管理后台）。换应用时权限码也要换成该应用的命名空间 */
    appId: { type: 'string', minLength: 1, maxLength: 32 },
    name: { type: 'string', minLength: 1, maxLength: 50 },
    type: { type: 'string', enum: ['dir', 'menu', 'btn'] },
    icon: { type: 'string', maxLength: 64 },
    path: { type: 'string', maxLength: 200 },
    component: { type: 'string', maxLength: 200 },
    permission: { type: 'string', maxLength: 100 },
    sort: { type: 'integer', minimum: 0, maximum: 9999 },
    /*
     * `visible` = 是否在导航里出现。
     *
     * 它**优先于授权**：置 0 之后所有人的侧栏都不再出现这一项（超管、已授权角色一样），
     * 但 `sys_role_menu` 里的授权原样保留 —— 这是"下架"，不是"取消授权"，
     * 重新置 1 即恢复原样。
     */
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
    ['appId', 'app_id'],
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
 * 某应用可选的权限码
 *
 * 从权限注册表按命名空间取（`admin` → `admin:*`，`firewall` → `fw:*`…）。
 * 这是"这个码能不能挂在这条菜单上"的唯一判据 —— 写错命名空间的码永远匹配不到
 * 任何 `requirePermission`，界面上配了也点不动。
 *
 * @param {string} appId 应用标识
 * @returns {Set<string>} 可选权限码
 */
function permissionCodesOf(appId) {
  const meta = actionMetaRegistry.find(item => item.domain === appId);
  return new Set((meta?.actions || []).map(action => action.code));
}

/**
 * 校验操作者能配置该应用的菜单
 *
 * @param {object} request Fastify 请求
 * @param {string} appId 目标应用
 * @returns {Promise<void>}
 * @throws {Error} `FORBIDDEN:...`
 */
async function assertAppWritable(request, appId) {
  const actor = await getActorScope(request.state.user?.userId);
  if (canConfigureApp(request.state.user, actor, appId)) return;
  throw new Error(`FORBIDDEN:你没有「${appNameOf(appId)}」的权限，不能配置该应用的菜单`);
}

/**
 * 校验权限码属于该菜单所属的应用
 *
 * 🔴 写进别的应用的码不会有任何效果 —— 这条菜单/按钮匹配不到该应用的任何一个
 *    `requirePermission`，看起来"配了权限"实际谁也点不开；角色授权页还会把它算成
 *    "该角色拥有别的应用的能力"。所以不是"警告"而是**拒写**。
 *
 * 例外：**值没变**时放行。历史数据里可能已经躺着跨命名空间的码（跨版本升级留下的），
 * 若不允许原值保存，管理员改一个菜单的排序都会被这条规则卡死，只能连库改。
 *
 * @param {string} code 待写入的权限码（空值表示不设权限，合法）
 * @param {string} [previous] 该菜单当前库里的值（新建时传 undefined）
 * @param {string} [appId='admin'] 目标应用（决定可用哪个命名空间的码）
 * @throws {Error} 权限码不属于该应用时抛 INVALID_PARAM
 * @returns {void}
 */
function assertOwnPermission(code, previous, appId = 'admin') {
  if (code === undefined || code === null || String(code).trim() === '') return;
  const value = String(code).trim();
  if (previous !== undefined && previous !== null && String(previous) === value) return;
  if (!permissionCodesOf(appId).has(value)) {
    const meta = actionMetaRegistry.find(item => item.domain === appId);
    const hint = meta?.actions?.[0]?.code || 'admin:user:read';
    throw new Error(`INVALID_PARAM:权限码「${value}」不属于应用「${appId}」，只能用该应用的码（如 ${hint}）`);
  }
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

/**
 * 写一条菜单审计
 *
 * 菜单即权限点：改一条菜单的 permission 就等于放开/收回一个按钮码，
 * 而这条路径原本一条日志都没有。
 *
 * 失败不影响业务（`logAuditEvent` 内部已吞异常），与 roles / depts 的 audit() 同口径。
 *
 * @param {import('fastify').FastifyRequest} request 请求
 * @param {string} type 事件类型
 * @param {object} details 详情
 * @returns {Promise<void>}
 */
async function audit(request, type, details) {
  await logAuditEvent({
    type,
    userId: request.state?.user?.userId ? Number(request.state.user.userId) : null,
    ip: request.ip,
    userAgent: request.headers['user-agent'] || '',
    appId: 'console',
    details
  });
}

async function registerMenuRoutes(fastify) {
  registerGroupMetadata({
    name: 'adminMenu',
    alias: '管理后台菜单',
    description: '菜单树维护与导出',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'adminMenuTree',
    alias: '菜单树',
    method: 'GET',
    url: '/menus/tree',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: { appId: { type: 'string', maxLength: 32 } }
      }
    },
    handler: withFail(async (request, reply) => {
      // 不带 appId 时返回全部应用（导出/矩阵视角需要）；带则只回该应用
      const appId = request.query?.appId ? String(request.query.appId) : null;
      return reply.result.success('获取成功', await menuDao.tree({ appId }));
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminMenuApps',
    alias: '可配置的应用',
    method: 'GET',
    url: '/menus/apps',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.READ,
    handler: withFail(async (request, reply) => {
      // 只回「注册过权限码」的应用：没有码就没有可授权的界面元素，列出来只会是空分档
      const actor = await getActorScope(request.state.user?.userId);
      const apps = actionMetaRegistry
        .filter(meta => (meta.actions || []).length > 0)
        .map(meta => ({
          id: meta.domain,
          name: meta.name || meta.domain,
          /** 当前账号能否配置该应用的菜单（写接口会再校验一次，这里只用于前端置灰/过滤） */
          writable: canConfigureApp(request.state.user, actor, meta.domain)
        }));
      return reply.result.success('获取成功', apps);
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminMenuPermissionOptions',
    alias: '菜单可选权限码',
    method: 'GET',
    url: '/menus/permission-options',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: { appId: { type: 'string', maxLength: 32 } }
      }
    },
    handler: withFail(async (request, reply) => {
      const appId = String(request.query?.appId || 'admin');
      const meta = actionMetaRegistry.find(item => item.domain === appId);
      if (!meta) throw new Error(`NOT_FOUND:未知应用「${appId}」`);
      // 候选只回该应用的码：跨命名空间的码挂上去不会生效，不该出现在候选里
      return reply.result.success('获取成功', {
        appId,
        appName: meta.name || appId,
        options: (meta.actions || []).map(action => ({ code: action.code, label: action.label, type: action.type }))
      });
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminMenuCreate',
    alias: '新建菜单',
    method: 'POST',
    url: '/menus',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.CREATE,
    schema: {
      body: { ...menuBodySchema, required: ['name', 'type'] }
    },
    handler: withFail(async (request, reply) => {
      const payload = toModelFields(request.body);
      const appId = String(payload.app_id || 'admin');
      payload.app_id = appId;
      await assertAppWritable(request, appId);
      assertOwnPermission(payload.permission, undefined, appId);
      /*
       * 父级必须同应用：跨应用挂载会造出"防火墙页面在管理后台侧栏里"这种孤儿，
       * 而且菜单树的 app 过滤会把子项一起藏掉。
       */
      if (payload.parent_id) {
        const parent = await menuDao.findById(payload.parent_id);
        if (!parent) throw new Error('INVALID_PARENT:上级菜单不存在');
        if (String(parent.app_id || 'admin') !== appId) {
          throw new Error('INVALID_PARENT:上级菜单属于其它应用，不能在它下面挂本应用的菜单');
        }
      }
      const menu = await menuDao.create(payload);
      /*
       * 新增按钮时继承上级页面的授权。
       *
       * 按钮一旦存在，前端就按"被授权才显示"判定；不继承的话，本来正常的角色
       * 会因为这次新增突然丢按钮（看着像把功能改坏了）。只对 btn 生效，且父级必须存在。
       */
      if (menu.type === 'btn' && Number(menu.parent_id) > 0) {
        await menuDao.grantToRolesHaving(menu.id, menu.parent_id);
      }
      // 新增按钮 = 按钮码集合变了 → 守卫那边的快照必须重建
      if (menu.type === 'btn') invalidateButtonGrants();
      await audit(request, 'MENU_CREATE', {
        targetId: menu.id,
        targetName: menu.name,
        menuType: menu.type,
        permission: menu.permission || null,
        appId: menu.app_id || appId,
        path: menu.path || null,
        parentId: menu.parent_id || null
      });
      return reply.result.success('创建成功', { id: menu.id });
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminMenuUpdate',
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
      const appId = String(payload.app_id || menu.app_id || 'admin');
      // 原应用与目标应用都要可写：否则"把别人应用的菜单改到自己名下"就是一条绕过口
      await assertAppWritable(request, menu.app_id || 'admin');
      if (appId !== (menu.app_id || 'admin')) await assertAppWritable(request, appId);
      // 只有真的要改权限码时才校验（原值保持不变时放行历史跨命名空间的脏数据）
      assertOwnPermission(payload.permission, menu.permission, appId);
      if (payload.app_id !== undefined && payload.app_id !== menu.app_id) {
        // 换应用时子项必须一起换，否则父子跨应用，树会断
        if ((await menuDao.countChildren(menu.id)) > 0) {
          throw new Error('INVALID_PARENT:该菜单下有子项，不能单独更换归属应用');
        }
        if (Number(menu.parent_id) > 0) {
          const parent = await menuDao.findById(menu.parent_id);
          if (parent && String(parent.app_id || 'admin') !== appId) {
            throw new Error('INVALID_PARENT:上级菜单属于其它应用，请先把上级改到同一应用');
          }
        }
      }
      if (payload.parent_id !== undefined && Number(payload.parent_id) === Number(menu.id)) {
        throw new Error('INVALID_PARENT:不能把菜单挂到自己下面');
      }
      await menuDao.update(menu.id, payload);
      /*
       * 停用 / 下架 / 改权限码都落在这一条上，三者都会改变"哪些码是按钮码、
       * 哪些按钮还算启用" —— 不失效的话，刚停用的按钮在 TTL 内仍可被调用。
       */
      invalidateButtonGrants();
      /*
       * 编辑留痕：只记真正变了的字段
       *
       * 菜单编辑最容易出事的是 `permission` —— 换一个码，这个按钮的授权范围就整体
       * 换了主人；其次是 `status`（停用）与 `app_id`（跨应用搬迁）。全量回传的表单
       * 每次保存都写一条会把日志淹掉，所以按 diff 写。
       */
      const menuChanges = [];
      for (const [field, next, prev] of [
        ['name', payload.name, menu.name],
        ['path', payload.path, menu.path],
        ['permission', payload.permission, menu.permission],
        ['type', payload.type, menu.type],
        ['status', payload.status, menu.status],
        ['appId', payload.app_id, menu.app_id]
      ]) {
        if (next === undefined) continue;
        if (String(next ?? '') === String(prev ?? '')) continue;
        menuChanges.push({ field, from: prev ?? null, to: next });
      }
      if (menuChanges.length > 0) {
        await audit(request, 'MENU_UPDATE', {
          targetId: menu.id,
          targetName: menu.name,
          appId: menu.app_id || appId,
          changes: menuChanges
        });
      }
      return reply.result.success('保存成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminMenuRemove',
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
      await assertAppWritable(request, menu.app_id || 'admin');
      if ((await menuDao.countChildren(id)) > 0) throw new Error('HAS_CHILDREN:请先删除子菜单');
      if ((await menuDao.countRoleRefs(id)) > 0) throw new Error('ROLE_REFERENCED:仍有角色引用该菜单，请先解除授权');
      await menuDao.remove(id);
      /*
       * 删除留痕：菜单一删，挂在它下面的按钮码与角色引用关系一起消失，
       * 事后只能靠这条记录还原"原来有这么个页面/按钮"。
       */
      await audit(request, 'MENU_DELETE', {
        targetId: menu.id,
        targetName: menu.name,
        menuType: menu.type,
        permission: menu.permission || null,
        appId: menu.app_id || 'admin',
        path: menu.path || null,
        parentId: menu.parent_id || null
      });
      invalidateButtonGrants();
      return reply.result.success('删除成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminMenuExport',
    alias: '导出菜单',
    method: 'GET',
    url: '/menus/export',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.MENU.READ,
    handler: withFail(async (request, reply) => {
      const rows = await menuDao.listAll();
      // 带上应用列：导出是全应用的，没有这一列分不清哪些行属于哪个界面
      const header = ['ID', '应用', '上级', '名称', '类型', '路由', '权限码', '排序', '可见', '状态'];
      const lines = rows.map(r =>
        [
          r.id,
          actionMetaRegistry.find(meta => meta.domain === (r.app_id || 'admin'))?.name || r.app_id || 'admin',
          r.parent_id,
          r.name,
          r.type,
          r.path,
          r.permission,
          r.sort,
          r.visible,
          r.status
        ]
          .map(csvCell)
          .join(',')
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
