/**
 * 工作台聚合服务
 *
 * 只做「读数聚合」，不承载任何写操作。所有数字都来自真实表：
 * 用户 / 角色 / 菜单 / 部门 / 审计日志 / 会话日志 —— 没有一处是估算或写死的。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { QueryTypes } from 'sequelize';
import logDao, { OPER_ONLY_SQL } from '../dao/log.dao.js';
import { getStore } from '../../../framework/persistence/redis/index.js';
import { isRedisReady } from '../../../framework/persistence/redis/index.js';

/**
 * 当前在线账号数（有有效会话的账号）
 *
 * 「近 24 小时登录过」与「现在在线」是两件事：一直挂着不重登的账号，
 * 前者是 0、后者是 1。看板问的是"现在有几个人在用"，所以按 Redis 里的
 * 有效会话数算 —— 这也是唯一能反映"会话还活着"的地方（`session_tokens`
 * 的 `revoked` 只有被踢/登出才置位，过期行会残留）。
 *
 * 实现要点：
 * - `user_sessions` 是 `uid → sessionId` 的 zset（每账号一个键），scan 出 uid 即可；
 * - 索引里可能残留已过期的 sid，所以还要至少一个 `session:<sid>` 键仍在，才算在线；
 * - Redis 不可用时返回 null，调用方回落到日志口径，绝不让看板变成 0 或报错。
 *
 * @returns {Promise<number|null>} 在线账号数；Redis 不可用为 null
 */
async function countOnlineUsers() {
  if (!isRedisReady()) return null;
  try {
    const index = getStore('user_sessions');
    const sessions = getStore('session');
    const uids = new Set();
    let cursor = '0';
    do {
      // node-redis 返回 { cursor, keys }（不是元组）；cursor 是字符串 '0' 表示扫完
      const page = await index.scan(cursor, { MATCH: '*', COUNT: 200 });
      cursor = String(page.cursor ?? '0');
      for (const key of page.keys ?? []) {
        const uid = String(key).split(':').pop();
        if (!uid) continue;
        const sids = await index.zRangeByScore(uid, '-inf', '+inf');
        for (const sid of sids) {
          if (await sessions.get(sid)) {
            uids.add(uid);
            break;
          }
        }
      }
    } while (cursor !== '0');
    return uids.size;
  } catch {
    // 看板是只读聚合，Redis 抖动不该让整页 500
    return null;
  }
}

class DashboardService {
  /**
   * 工作台概览
   *
   * @returns {Promise<object>} 概览数据
   */
  async summary() {
    const { sequelize } = getModel('User');

    const [counts] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM user_user WHERE deleted_at IS NULL) AS users,
         (SELECT COUNT(*) FROM iam_role WHERE deleted_at IS NULL) AS roles,
         (SELECT COUNT(*) FROM sys_menu) AS menus,
         (SELECT COUNT(*) FROM sys_dept) AS depts,
         (SELECT COUNT(*) FROM session_logs WHERE DATE(created_at) = CURDATE()) AS today_logins,
         (SELECT COUNT(*) FROM session_logs WHERE DATE(created_at) = CURDATE()
            AND (event LIKE '%FAIL%' OR event LIKE '%FORBIDDEN%')) AS failed_logins,
         (SELECT COUNT(*) FROM audit_logs a WHERE DATE(a.created_at) = CURDATE()
            AND ${OPER_ONLY_SQL}) AS today_ops,
         /*
          * 活跃用户 = 近 24 小时**成功登录**过的不同账号。
          *
          * 🔴 必须限定 event = 'LOGIN'。session_logs 里还有 KICK（被顶/被踢）、
          *    SESSION_REFRESH、LOGIN_FAIL —— 之前不筛事件，等于把"被踢下线"也算成
          *    "活跃"：一次踢出就多一个"在线用户"，数字只会虚高（实测 4 个全是 KICK 行）。
          */
         (SELECT COUNT(DISTINCT user_id) FROM session_logs
           WHERE created_at >= NOW() - INTERVAL 1 DAY
             AND user_id IS NOT NULL
             AND event = 'LOGIN') AS active_users`,
      { type: QueryTypes.SELECT }
    );

    const todayOps = Number(counts.today_ops || 0);
    const todayFailed = await sequelize.query(
      `SELECT COUNT(*) AS c FROM audit_logs a
        WHERE DATE(a.created_at) = CURDATE() AND ${OPER_ONLY_SQL}
          AND (event LIKE '%FAIL%' OR event LIKE '%DENIED%' OR event LIKE '%FORBIDDEN%')`,
      { type: QueryTypes.SELECT }
    );
    const failedOps = Number(todayFailed[0]?.c || 0);

    const trend = await logDao.operStats('7d');
    const recentLogins = await logDao.recentLogins(5);

    return {
      users: Number(counts.users || 0),
      roles: Number(counts.roles || 0),
      menus: Number(counts.menus || 0),
      depts: Number(counts.depts || 0),
      todayLogins: Number(counts.today_logins || 0),
      failedLogins: Number(counts.failed_logins || 0),
      todayOps,
      successRate: todayOps > 0 ? Number((((todayOps - failedOps) / todayOps) * 100).toFixed(2)) : 100,
      activeUsers: Number(counts.active_users || 0),
      /** 当前在线（有有效会话）；Redis 不可用时为 null，前端回落到 activeUsers */
      onlineUsers: await countOnlineUsers(),
      trend: trend.series,
      recentLogins
    };
  }
}

const dashboardService = new DashboardService();

export default dashboardService;
