/**
 * 工作台聚合服务
 *
 * 只做「读数聚合」，不承载任何写操作。所有数字都来自真实表：
 * 用户 / 角色 / 菜单 / 部门 / 审计日志 / 会话日志 —— 没有一处是估算或写死的。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { sequelize } from '../../../../framework/persistence/db/index.js';
import { QueryTypes } from 'sequelize';
import logDao, { OPER_ONLY_SQL } from '../dao/log.dao.js';
import { getStore } from '../../../../framework/persistence/redis/index.js';
import { isRedisReady } from '../../../../framework/persistence/redis/index.js';

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
   * @param {object} [options] 选项
   * @param {boolean} [options.includeLogData=true] 是否下发**日志派生**的数据（默认给，供脚本/内部调用）
   * @returns {Promise<object>} 概览数据
   *
   * 🔴 `includeLogData = false` 时，所有"从日志算出来的"字段一律归零 / 空数组：
   *    今日登录、失败数、今日操作、成功率、活跃账号、7 日趋势、最近登录明细。
   *    理由不是"数字也敏感"，而是**工作台内部要自洽** —— 摘要显示"今日操作 12 次"、
   *    下面的趋势图却说"需要日志权限"，比两者都不显示更让人困惑。
   *    系统读数（用户/角色/菜单/部门）与在线数不走日志，因此不受影响。
   */
  async summary({ includeLogData = true } = {}) {
    /*
     * 直接取连接，不借某个模型的 `.sequelize`：那是"顺手拿到的句柄"，
     * 会让读者以为这段在读 User 表，实际只跑聚合 SQL。
     */
    const [counts] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM user_user WHERE deleted_at IS NULL) AS users,
         (SELECT COUNT(*) FROM iam_role WHERE deleted_at IS NULL) AS roles,
         (SELECT COUNT(*) FROM sys_menu) AS menus,
         (SELECT COUNT(*) FROM sys_dept) AS depts,
         /*
          * 明细 + 归档：清过日志的那几段由 log_stats_hourly 补上，
          * 否则「清日志」会把看板上的今日登录一起清零（2026-11-17 反馈）。
          */
         ((SELECT COUNT(*) FROM session_logs WHERE DATE(created_at) = CURDATE())
           + (SELECT COALESCE(SUM(total), 0) FROM log_stats_hourly
               WHERE scope = 'login' AND DATE(bucket_start) = CURDATE())) AS today_logins,
         ((SELECT COUNT(*) FROM session_logs WHERE DATE(created_at) = CURDATE()
             AND (event LIKE '%FAIL%' OR event LIKE '%FORBIDDEN%'))
           + (SELECT COALESCE(SUM(failed), 0) FROM log_stats_hourly
               WHERE scope = 'login' AND DATE(bucket_start) = CURDATE())) AS failed_logins,
         ((SELECT COUNT(*) FROM audit_logs a WHERE DATE(a.created_at) = CURDATE()
             AND ${OPER_ONLY_SQL})
           + (SELECT COALESCE(SUM(total), 0) FROM log_stats_hourly
               WHERE scope = 'oper' AND DATE(bucket_start) = CURDATE())) AS today_ops,
         /*
          * 活跃用户 = 近 24 小时**成功登录**过的不同账号。
          *
          * 🔴 必须限定 event = 'LOGIN'。session_logs 里还有 KICK（被顶/被踢）、
          *    SESSION_REFRESH、LOGIN_FAIL —— 之前不筛事件，等于把"被踢下线"也算成
          *    "活跃"：一次踢出就多一个"在线用户"，数字只会虚高（实测 4 个全是 KICK 行）。
          */
         (SELECT COUNT(*) FROM session_logs WHERE 1 = 0) AS active_users`,
      { type: QueryTypes.SELECT }
    );

    const todayOps = Number(counts.today_ops || 0);
    /*
     * 失败操作数同样要含归档：`log_stats_hourly.failed` 就是按同一套失败判定累加的
     * （见 `log.dao.js` 的 `archiveStats`），所以这里直接相加不会出现口径漂移。
     */
    const todayFailed = await sequelize.query(
      `SELECT (SELECT COUNT(*) FROM audit_logs a
                WHERE DATE(a.created_at) = CURDATE() AND ${OPER_ONLY_SQL}
                  AND (event LIKE '%FAIL%' OR event LIKE '%DENIED%' OR event LIKE '%FORBIDDEN%'))
            + (SELECT COALESCE(SUM(failed), 0) FROM log_stats_hourly
                WHERE scope = 'oper' AND DATE(bucket_start) = CURDATE()) AS c`,
      { type: QueryTypes.SELECT }
    );
    const failedOps = Number(todayFailed[0]?.c || 0);

    const trend = includeLogData ? await logDao.operStats('7d') : { series: [] };
    /*
     * 最近登录是**明细**（含 IP / UA / 时间），清过就是清过了 —— 归档只保留计数与
     * 账号存在性，补不出"谁在几点从哪登录"。这是清除日志的应有之义，不再伪造。
     */
    const recentLogins = includeLogData ? await logDao.recentLogins(5) : [];

    return {
      users: Number(counts.users || 0),
      roles: Number(counts.roles || 0),
      menus: Number(counts.menus || 0),
      depts: Number(counts.depts || 0),
      todayLogins: includeLogData ? Number(counts.today_logins || 0) : 0,
      failedLogins: includeLogData ? Number(counts.failed_logins || 0) : 0,
      todayOps: includeLogData ? todayOps : 0,
      successRate: includeLogData
        ? todayOps > 0
          ? Number((((todayOps - failedOps) / todayOps) * 100).toFixed(2))
          : 100
        : 0,
      /*
       * 活跃账号数必须走 dao：它是「明细 ∪ 归档」的精确去重，
       * 把两边人数相加会把同一账号算成两个人。
       */
      activeUsers: includeLogData ? await logDao.activeLoginUsers(24) : 0,
      /** 当前在线（有有效会话）；Redis 不可用时为 null，前端回落到 activeUsers */
      onlineUsers: await countOnlineUsers(),
      trend: trend.series,
      recentLogins,
      /** 日志派生数据被按权限隐去（前端据此显示"需要日志权限"而不是"0 / 暂无"） */
      logDataLocked: !includeLogData
    };
  }
}

const dashboardService = new DashboardService();

export default dashboardService;
