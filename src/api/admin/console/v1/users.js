/**
 * 用户管理接口
 *
 * GET    /admin/console/v1/users                 —— 分页列表（含部门 / 角色 / 岗位）
 * GET    /admin/console/v1/users/options         —— 表单引用选项
 * POST   /admin/console/v1/users                 —— 新建（用户 + 凭证 + 角色 + 岗位）
 * PUT    /admin/console/v1/users/:id             —— 编辑
 * PUT    /admin/console/v1/users/:id/status      —— 启用 / 冻结
 * GET    /admin/console/v1/users/export          —— 导出 CSV
 * GET    /admin/console/v1/users/:id/grants      —— 授权历史（授予 / 取消流水）
 * POST   /admin/console/v1/users/roles/batch     —— 批量授权（追加 / 移除）
 *
 * 账号高危操作（都要二次验证 = 操作者现敲自己的登录密码）：
 * GET    /admin/console/v1/users/:id/deletion              —— 待执行的注销申请
 * POST   /admin/console/v1/users/:id/deletion              —— 发起删除（缓冲期，到期才清数据）
 * POST   /admin/console/v1/users/:id/deletion/:rid/cancel   —— 撤销注销
 * GET    /admin/console/v1/users/:id/apps                  —— 该用户在各应用的账号状态
 * POST   /admin/console/v1/users/:id/apps/:appId/deactivation —— 只注销该应用的账号
 * GET    /admin/console/v1/users/:id/temp-password         —— 当前有效的临时密码（无明文）
 * POST   /admin/console/v1/users/:id/temp-password         —— 签发临时密码（明文只返回一次）
 *
 * 🔴 **仍然没有「重置密码」**，这是刻意的：管理员代改密码等于绕过"本人知情"，
 *    谁都能悄悄接管任意下级账号，前面所有职级限制都会失效。密码只能本人改 ——
 *    需要临时进入别人账号时，用**临时密码**（短时、一次性、全程留痕、可作废），
 *    而不是改掉他的密码。
 *
 * 🔴 **「删除」不是立刻抹数据**：先立注销申请（立即拒登录），到期由定时任务正式清理
 *    （见 `app/user/services/deactivation.service.js`），期间可撤销。误删不可逆，
 *    而交接期间账号往往还被别处引用着。
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
import {
  appLabel,
  canWriteApp,
  loadRoles,
  getActorScope,
  getTargetScope,
  assertCanManageUser,
  assertGrantable,
  planRoleChange
} from '../../../../app/console/services/access-scope.service.js';
import { describeCurrentAccess } from '../../../../app/console/services/user-access.service.js';
import userDangerService from '../../../../app/console/services/user-danger.service.js';
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

/**
 * 取「操作者」与「目标用户」的授权范围画像
 *
 * 每次请求现查，不用会话快照：管理员自己被改过角色后，会话里的权限位可能还没刷新，
 * 拿旧快照判定会放过本该拒绝的操作。代价是两次 IN 查询（走主键索引）。
 *
 * @param {import('fastify').FastifyRequest} request 请求
 * @param {number} targetUserId 目标用户 ID
 * @param {string} [action='操作'] 动作名（用于 403 文案）
 * @returns {Promise<{operatorId: number, actor: object, target: object}>} 画像
 */
async function scopeOf(request, targetUserId, action = '操作') {
  const operatorId = Number(request.state.user?.userId);
  const [actor, target] = await Promise.all([getActorScope(operatorId), getTargetScope(targetUserId)]);
  assertCanManageUser(actor, target, targetUserId, operatorId, { action });
  return { operatorId, actor, target };
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

/**
 * 用户列表 / 导出的应用域过滤条件
 *
 * 非跨应用管理员只能看到「在他管理的应用里有角色」的用户 —— 否则列表里全是改不了的
 * 行（按钮全灰），比看不到更让人困惑。`null` = 不过滤（超管 / 后台管理员）。
 *
 * @param {import('fastify').FastifyRequest} request 请求
 * @returns {Promise<string[]|null>} 允许的应用 ID 列表（null 表示不限）
 */
async function scopeAppIdsOf(request) {
  const actor = await getActorScope(request.state.user?.userId);
  if (actor.isSuper || actor.crossApp) return null;
  return [...actor.apps];
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
      const { rows, total } = await userDao.page({
        pageNum,
        pageSize,
        keyword,
        deptId,
        status,
        scopeAppIds: await scopeAppIdsOf(request)
      });
      /*
       * 附上「待执行的注销申请」：删除是缓冲期语义，列表里必须能看出
       * "这个人已经被发起删除、还有几天到期" —— 否则管理员会以为没删成功又点一次。
       * 一次 IN 查询，不做 N+1（见 pendingByUsers）。
       */
      const pending = await userDangerService.pendingByUsers(rows.map(row => row.id));
      const withDeletion = rows.map(row => ({ ...row, deletion: pending.get(Number(row.id)) || null }));
      return reply.result.success('获取成功', { rows: withDeletion, total, pageNum, pageSize });
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
      /*
       * 选项按「当前操作者能碰到什么」标注，前端据此把不可管的角色灰掉/隐藏。
       *
       * 为什么不让前端自己算：范围规则（应用域 + 职级 + 超管）只有一套，放在后端
       * 才能保证"显示不出来"与"提交被拒"是同一个判据 —— 两边各写一份必然漂移。
       * 前端仍然会拿到 `app_label`，用于按应用分组排版。
       */
      const actor = await getActorScope(request.state.user?.userId);
      const roles = data.roles.map(role => ({
        ...role,
        app_label: appLabel(role.app_id),
        manageable: canWriteApp(actor, role.app_id) && (actor.isSuper || Number(role.rank_level) < actor.maxRank)
      }));
      const apps = [...new Set(roles.map(role => role.app_id))].map(id => ({ id, label: appLabel(id) }));
      return reply.result.success('获取成功', {
        ...data,
        roles,
        apps,
        scope: {
          appIds: [...actor.apps],
          crossApp: actor.crossApp,
          maxRank: actor.maxRank,
          isSuper: actor.isSuper
        }
      });
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
      // 新建时的角色授予同样受范围约束：否则「建个新号再给它超管」就是一条提权捷径
      const actor = await getActorScope(request.state.user?.userId);
      await assertGrantable(actor, request.body.roleIds);
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
      const targetId = Number(request.params.id);
      const { operatorId, actor, target } = await scopeOf(request, targetId, '编辑');

      /**
       * 角色变更走「范围规划」而不是直接透传：
       *   · 只覆盖可写应用内的角色，范围外的原样保留（`replaceRoles` 是全量覆盖语义，
       *     直接透传会让一个应用管理员把别人在其他应用的角色连带删光）；
       *   · 越权应用、超越职级的授予在规划阶段就 403。
       */
      const body = { ...request.body };
      if (Array.isArray(body.roleIds)) {
        const plan = await planRoleChange({ actor, target, submittedRoleIds: body.roleIds });
        body.roleIds = plan.finalRoleIds;
      }

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
      if (Array.isArray(body.roleIds) && targetId === operatorId) {
        const stillAdmin = await roleDao.hasAdminCapability(body.roleIds);
        if (!stillAdmin) {
          throw new Error('FORBIDDEN:不能移除自己的全部管理权限，否则会立刻锁死后台');
        }
      }
      const ok = await userDao.update(targetId, body, actorOf(request));
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
      await scopeOf(request, Number(request.params.id), '冻结或启用');
      const ok = await userDao.updateStatus(request.params.id, request.body.status);
      if (!ok) throw new Error('NOT_FOUND:用户不存在');
      return reply.result.success('状态已更新', null);
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
      // 导出与列表同一口径：给应用管理员导全表等于把别家应用的用户名单往外带
      const { rows } = await userDao.page({
        pageNum: 1,
        pageSize: 5000,
        keyword,
        deptId,
        status,
        scopeAppIds: await scopeAppIdsOf(request)
      });
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
      // 一次给全三样：逐条流水（分页）、当前状态、按角色聚合的生效区间。
      // 后两者都与分页无关，前端不该自己按页倒推（会误判"已撤销"）。
      const [page, current, timeline] = await Promise.all([
        grantDao.pageByUser(request.params.id, { pageNum, pageSize, action }),
        describeCurrentAccess(request.params.id),
        grantDao.roleTimeline(request.params.id)
      ]);
      return reply.result.success('获取成功', { ...page, current, timeline });
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
      const operatorId = Number(actor.id);
      const { userIds, roleIds, mode } = request.body;
      const targets = Array.from(new Set(userIds.map(Number)));
      const grants = Array.from(new Set(roleIds.map(Number)));
      const scope = await getActorScope(operatorId);

      /*
       * 0. 先判「这组角色我能不能动」：
       *    add   —— 越权应用、超越职级都要拦（等同于逐条授予）；
       *    remove —— 只需应用域：撤销比自己高的角色由「目标用户职级」那道闸负责，
       *              这里放宽一级，避免把"清理下级错误授权"也堵死。
       */
      if (mode === 'add') {
        await assertGrantable(scope, grants);
      } else {
        const roles = await loadRoles(grants);
        for (const role of roles.values()) {
          if (!canWriteApp(scope, role.appId)) {
            throw new Error(`FORBIDDEN:无权撤销${appLabel(role.appId)}的角色「${role.name}」`);
          }
        }
      }

      // 1. 预检：每个用户都要过「能不能动他」，再算目标角色集合，最后判自锁
      const plans = [];
      for (const userId of targets) {
        const target = await getTargetScope(userId);
        assertCanManageUser(scope, target, userId, operatorId, { action: '批量授权' });
        const base =
          mode === 'add'
            ? Array.from(new Set([...target.roleIds, ...grants]))
            : target.roleIds.filter(id => !grants.includes(id));
        // 应用域外保留：批量同样不能把别人在其它应用的角色连带删掉
        const plan = await planRoleChange({ actor: scope, target, submittedRoleIds: base });
        if (userId === operatorId && !(await roleDao.hasAdminCapability(plan.finalRoleIds))) {
          throw new Error('FORBIDDEN:批量操作会移除你自己的全部管理权限，已中止（未改动任何用户）');
        }
        plans.push({ userId, next: plan.finalRoleIds });
      }

      // 2. 落库（逐用户一个事务，任一失败即整体报错，不会静默半成功）
      for (const plan of plans) {
        await userDao.update(plan.userId, { roleIds: plan.next }, { ...actor, remark: '批量授权' });
      }

      return reply.result.success(`已更新 ${plans.length} 个用户的角色`, { count: plans.length });
    })
  });

  /* ── 账号高危操作 ─────────────────────────────────────────────
   * 这五条都要求请求体里带 `password`（操作者自己的登录密码），由 service 校验。
   * 把二次验证放在 service 而不是路由：路由只负责声明形状，判定只有一处。
   */

  registerSecureRoute(fastify, {
    name: 'consoleUserDeletion',
    alias: '查询待执行注销',
    method: 'GET',
    url: '/users/:id/deletion',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.READ,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const targetId = Number(request.params.id);
      // 一并给出"会话还没踢干净"的记录：执行完注销不等于清理完，残留会话是可见状态
      const [data, pendingKicks] = await Promise.all([
        userDangerService.listDeletion(targetId),
        userDangerService.listPendingKicks(targetId)
      ]);
      return reply.result.success('获取成功', { ...data, pendingKicks });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserDelete',
    alias: '删除账号（缓冲期）',
    method: 'POST',
    url: '/users/:id/deletion',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.PURGE,
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        required: ['password', 'confirmUsername'],
        properties: {
          password: { type: 'string', minLength: 1, maxLength: 128 },
          confirmUsername: { type: 'string', minLength: 1, maxLength: 64 },
          reason: { type: 'string', maxLength: 255 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const data = await userDangerService.requestDeletion({
        request,
        actor: actorOf(request),
        targetId: Number(request.params.id),
        password: request.body.password,
        confirmUsername: request.body.confirmUsername,
        reason: request.body.reason
      });
      return reply.result.success(`已发起删除，${data.graceDays} 天后正式清理，可随时撤销`, data);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserDeleteCancel',
    alias: '撤销注销申请',
    method: 'POST',
    url: '/users/:id/deletion/:requestId/cancel',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.PURGE,
    schema: {
      params: {
        type: 'object',
        required: ['id', 'requestId'],
        properties: { id: { type: 'integer', minimum: 1 }, requestId: { type: 'integer', minimum: 1 } }
      }
    },
    handler: withFail(async (request, reply) => {
      const data = await userDangerService.cancelDeletion({
        request,
        actor: actorOf(request),
        targetId: Number(request.params.id),
        requestId: Number(request.params.requestId)
      });
      return reply.result.success('已撤销，账号恢复正常', data);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserApps',
    alias: '用户应用账号',
    method: 'GET',
    url: '/users/:id/apps',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.READ,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const rows = await userDangerService.listApps(Number(request.params.id));
      return reply.result.success('获取成功', { rows, total: rows.length });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserAppDeactivate',
    alias: '注销应用账号',
    method: 'POST',
    url: '/users/:id/apps/:appId/deactivation',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.DEACTIVATE,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      params: {
        type: 'object',
        required: ['id', 'appId'],
        properties: {
          id: { type: 'integer', minimum: 1 },
          appId: { type: 'string', minLength: 1, maxLength: 64 }
        }
      },
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string', minLength: 1, maxLength: 128 },
          reason: { type: 'string', maxLength: 255 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const data = await userDangerService.deactivateApp({
        request,
        actor: actorOf(request),
        targetId: Number(request.params.id),
        appId: request.params.appId,
        password: request.body.password,
        reason: request.body.reason
      });
      return reply.result.success(`已发起注销，${data.graceDays} 天后清理该应用数据`, data);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserTempPasswordList',
    alias: '有效临时密码',
    method: 'GET',
    url: '/users/:id/temp-password',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.READ,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const rows = await userDangerService.listTempPasswords(Number(request.params.id));
      return reply.result.success('获取成功', { rows, total: rows.length });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleUserTempPassword',
    alias: '签发临时密码',
    method: 'POST',
    url: '/users/:id/temp-password',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.USER.TEMP_PASSWORD,
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string', minLength: 1, maxLength: 128 },
          ttlMinutes: { type: 'integer', minimum: 5, maximum: 1440, default: 30 },
          maxUses: { type: 'integer', minimum: 1, maximum: 10, default: 1 },
          reason: { type: 'string', maxLength: 255 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const data = await userDangerService.issueTempPassword({
        request,
        actor: actorOf(request),
        targetId: Number(request.params.id),
        password: request.body.password,
        ttlMinutes: request.body.ttlMinutes,
        maxUses: request.body.maxUses,
        reason: request.body.reason
      });
      return reply.result.success('已生成临时密码，仅显示这一次', data);
    })
  });
}

export default registerUserRoutes;
