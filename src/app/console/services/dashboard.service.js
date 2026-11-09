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
import logDao from '../dao/log.dao.js';

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
         (SELECT COUNT(*) FROM audit_logs WHERE DATE(created_at) = CURDATE()) AS today_ops,
         (SELECT COUNT(DISTINCT user_id) FROM session_logs
           WHERE created_at >= NOW() - INTERVAL 1 DAY AND user_id IS NOT NULL) AS active_users`,
      { type: QueryTypes.SELECT }
    );

    const todayOps = Number(counts.today_ops || 0);
    const todayFailed = await sequelize.query(
      `SELECT COUNT(*) AS c FROM audit_logs
        WHERE DATE(created_at) = CURDATE()
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
      trend: trend.series,
      recentLogins
    };
  }
}

const dashboardService = new DashboardService();

export default dashboardService;
