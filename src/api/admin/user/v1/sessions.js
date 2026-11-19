/**
 * 用户会话管理接口（管理端）
 *
 * 落 /admin/user/v1/sessions/*。鉴权走 **PBAC 权限码**（与用户管理的其它操作同一套）：
 *   · 查看设备会话 → `admin:user:read`（与列表 / 详情同权）
 *   · 踢设备下线   → `admin:user:update`（与编辑 / 冻结同权）
 *
 * 🔴 这两条原来用 `allowRoles` 角色白名单，等于与控制台的菜单/按钮授权完全脱钩：
 *    把「用户管理」页面和「高危操作」按钮取消之后，持有那几个角色的人照样能看设备指纹、
 *    照样能把人踢下线。而且白名单写死了角色名 —— 新建的管理员角色永远用不了，
 *    已有的角色也永远撤不掉。改成权限码后，它才和"取消勾选 = 按钮消失 + 接口 403"一致。
 *
 * GET  /admin/user/v1/sessions/list          — 某用户的所有设备会话（供"设备管理"页展示）
 * POST /admin/user/v1/sessions/kick-by-device — 按 device_id 精准踢单设备会话
 *
 * 设计：踢出走 session.kickDeviceEverywhere —— Redis 会话 + DB 令牌 + 孤儿 refresh token
 * 三步一起做。**不能只删 Redis**：设备的「活跃/已下线」徽标读的是 `session_tokens.revoked`，
 * 会话自然过期后 DB 行仍是 revoked=0，只删 Redis 会让那一行永远停在"活跃"，
 * 而点下线时又因为找不到会话返回 0 条（用户看到的就是"提示没有活跃会话，但没下线"）。
 *
 * @author yijiu2025
 * @since 2026-09-03
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import { getModel } from '../../../../framework/persistence/db/index.js';
import {
  kickDeviceEverywhere,
  logAuditEvent,
  LONG_SESSION_TTL,
  // 会话表的读侧在 framework 的 session-repo 里（与自助接口同一份实现）
  currentTokenHash,
  listDeviceRows
} from '../../../../framework/security/auth/index.js';

async function registerSessionsRoutes(fastify) {
  registerGroupMetadata({
    name: 'userSessionsAdmin',
    alias: '用户会话管理',
    description: '查看用户设备会话与远程踢单设备（admin）',
    prefix: '/user/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /admin/user/v1/sessions/list
   * 某用户的所有设备会话列表
   * query: { userId, appId?, revoked? }
   *
   * 返回每个设备的：device_id、device_fingerprint、app_id、ip、user_agent、last_active、revoked。
   * 同 user_id+device_id 设备幂等（session_tokens upsert），故列表是去重后的设备视图。
   */
  registerSecureRoute(fastify, {
    name: 'listUserSessions',
    alias: '用户设备会话列表',
    method: 'GET',
    url: '/sessions/list',
    requireLogin: true,
    // 看设备 = 看用户数据的一部分，与列表/详情同权
    requirePermission: ADMIN_PERMISSIONS.USER.READ,
    handler: async (request, reply) => {
      const { userId, appId, revoked } = request.query;
      if (!userId) {
        return reply.result.fail('userId 不能为空');
      }
      // user_id 是数字列：uid/UUID 会被 Number() 转成 NaN，静默查空
      const numericUserId = Number(userId);
      if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
        return reply.result.fail('userId 必须是数字主键（正整数），不接受 uid/UUID');
      }

      /*
       * 当前请求的会话：管理员查看**自己**的设备时，要能认出"这台就是我现在用的"，
       * 否则在列表里分不清哪一行是自己，一点就把自己踢下线。
       * token 只用于比对，不回传（下面 `{ token, ...rest }` 把它摘掉）。
       */
      const currentHash = currentTokenHash(request.state.user?.sessionId);

      const rows = await listDeviceRows({
        userId: numericUserId,
        appId: appId || undefined,
        revoked: revoked === undefined ? undefined : revoked === 'true' || revoked === true
      });

      return reply.result.success(
        '获取成功',
        rows.map(row => {
          const { token, ...plain } = row;
          // token 是会话凭证的哈希，不能出接口：只拿它算出 is_current 后丢掉
          /*
           * `stale` = 没被撤销、但最后活跃时间已经超过**最长**会话 TTL。
           *
           * Redis 里查不到"这台设备的会话还在不在"：表里只有 sha256(sid)，反查不了
           * `session:<rawSid>`。所以用 TTL 推断，且取 `LONG_SESSION_TTL`（记住我 30 天）——
           * 宁可漏判（把已过期的显示成活跃）也不误判（把记住我的活会话标成过期）。
           */
          const lastActive = plain.last_active ? new Date(plain.last_active).getTime() : 0;
          const stale = !plain.revoked && lastActive > 0 && Date.now() - lastActive > LONG_SESSION_TTL * 1000;
          return {
            ...plain,
            is_current: Boolean(currentHash) && token === currentHash,
            stale
          };
        })
      );
    }
  });

  /**
   * POST /admin/user/v1/sessions/kick-by-device
   * 按 device_id 精准踢单设备会话（远程踢下线）
   * body: { userId, appId, deviceId }
   *
   * 只踢 user_id+app_id+device_id 指定的那台设备的活跃 Redis session，
   * 不影响该用户其他设备。返回实际踢出的会话数（0=该设备当前无活跃 session）。
   */
  registerSecureRoute(fastify, {
    name: 'kickSessionByDevice',
    alias: '踢单设备',
    method: 'POST',
    url: '/sessions/kick-by-device',
    requireLogin: true,
    // 踢设备 = 动别人账号，与编辑/冻结同权（同一个 update 码）
    requirePermission: ADMIN_PERMISSIONS.USER.UPDATE,
    handler: async (request, reply) => {
      const { userId, appId, deviceId } = request.body || {};

      if (!userId || !appId || !deviceId) {
        return reply.result.fail('userId / appId / deviceId 不能为空');
      }
      const numericUserId = Number(userId);
      if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
        return reply.result.fail('userId 必须是数字主键（正整数），不接受 uid/UUID');
      }

      const result = await kickDeviceEverywhere(numericUserId, appId, deviceId);

      /*
       * 文案必须区分三种情况，否则用户会以为"操作没生效"：
       *   - 真踢掉了会话 → 已下线
       *   - 会话已过期、但清掉了历史令牌 → 也是"已下线"，只是说明原因
       *   - 本来就没有任何痕迹 → 如实说没有可下线的会话
       */
      const message =
        result.kicked > 0
          ? `已下线该设备（${result.kicked} 个会话）`
          : result.revoked > 0
            ? `该设备已无活跃会话，已撤销 ${result.revoked} 条历史令牌`
            : '该设备没有需要下线的会话';

      /*
       * 审计：踢设备是"动了别人账号"的动作，必须留痕。
       *
       * `userId` 记**操作者**（与部门/角色等事件一致：列表"账号"列显示的是谁干的），
       * 被踢的人与应用、设备码放 details —— 摘要据此写成
       * 「将「张三」的设备 WEB-… 下线（应用 console）」。原先这里一条都不记，
       * 事后只能看到"某人某时登录过"，查不出是谁把他踢下去的。
       */
      const target = await getModel('User').findByPk(numericUserId, { attributes: ['id', 'username'] });
      await logAuditEvent({
        type: 'SESSION_KICK_DEVICE',
        userId: request.state.user?.userId ? Number(request.state.user.userId) : null,
        ip: request.ip,
        userAgent: request.headers['user-agent'] || '',
        appId: 'console',
        details: {
          targetUserId: numericUserId,
          targetUsername: target?.username || '',
          targetAppId: appId,
          deviceId,
          kicked: result.kicked,
          revoked: result.revoked,
          self: Number(request.state.user?.userId) === numericUserId
        }
      });

      return reply.result.success(message, result);
    }
  });
}

export default registerSessionsRoutes;
