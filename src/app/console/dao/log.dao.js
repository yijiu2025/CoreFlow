/**
 * 日志数据访问层（audit_logs 操作审计 / session_logs 登录会话）
 *
 * 🔴 不新建日志表：这两张表已是全仓安全事件的唯一来源（登录、登出、权限变更、
 * 踢出设备都写它们）。管理端只做**查询与聚合**，写入口保持在既有业务链路里，
 * 否则会出现「同一次登录写两处、两处不一致」的分叉。
 *
 * 字段映射（audit_logs 没有 method/path/cost 列，这些信息在 details JSON 里）：
 *   module  ← app_id
 *   action  ← event
 *   status  ← event 含 FAIL / DENIED / FORBIDDEN，或 details.status ≥ 400
 *   path    ← details.path
 *   method  ← details.method
 *   costMs  ← details.costMs
 *
 * 🔴 **本文件是「允许裸 SQL」的边界，其余 DAO 一律走模型查询**（2026-11-10 收口）。
 *    保留 `sequelize.query` 的三类理由，缺一就不该用：
 *    1. **JSON 列提取**：method / path / costMs / status 都在 `details` JSON 里，
 *       要 `JSON_UNQUOTE(JSON_EXTRACT(...))` + `CAST(... AS UNSIGNED)`；
 *       用 ORM 得写成 `fn('JSON_UNQUOTE', fn('JSON_EXTRACT', col('details'), '$.method'))`
 *       的嵌套串，比 SQL 更难读、更易改错。
 *    2. **派生列**：`OPER_FAILED_SQL` / `LOGIN_FAILED_SQL` 是多条件 OR 表达式，
 *       列表与统计共用同一份口径（改成 ORM 会分裂成两处判断，正是要避免的事）。
 *    3. **时间分桶 / 比率聚合**：`GROUP BY DATE_FORMAT(...)` / `HOUR(...)` 与
 *       「活跃用户数 / 失败率」这类派生指标，属纯 SQL 聚合。
 *
 *    ⇒ 新增查询若**不涉及**上面三类，必须用模型（示例：`recentLogins`）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { QueryTypes } from 'sequelize';

/** 失败判定的 SQL 片段（操作日志与统计共用，避免两处口径不一致） */
const OPER_FAILED_SQL = `(a.event LIKE '%FAIL%' OR a.event LIKE '%DENIED%' OR a.event LIKE '%FORBIDDEN%'
  OR CAST(JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.status')) AS UNSIGNED) >= 400)`;

/** 登录失败判定 */
const LOGIN_FAILED_SQL = `(l.event LIKE '%FAIL%' OR l.event LIKE '%FORBIDDEN%')`;

/**
 * 归一化 details（raw 查询的 JSON 列是字符串）
 *
 * @param {unknown} value 原始值
 * @returns {object} 解析后的对象（失败返回空对象，不让一条脏数据打断整页）
 */
function parseDetails(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 按时间档返回桶表达式与回溯区间
 *
 * @param {string} range 时间档（24h / 7d / 30d）
 * @returns {{bucketExpr: string, intervalSql: string}} 桶表达式与区间条件
 */
function resolveRange(range) {
  if (range === '7d') return { bucketExpr: "DATE_FORMAT(a.created_at, '%m-%d')", intervalSql: 'INTERVAL 7 DAY' };
  if (range === '30d') return { bucketExpr: "DATE_FORMAT(a.created_at, '%m-%d')", intervalSql: 'INTERVAL 30 DAY' };
  return { bucketExpr: "DATE_FORMAT(a.created_at, '%H:00')", intervalSql: 'INTERVAL 24 HOUR' };
}

class LogDao {
  /**
   * 操作日志分页
   *
   * @param {object} params 查询参数
   * @returns {Promise<{rows: Array<object>, total: number}>} 分页结果
   */
  async operPage({ pageNum = 1, pageSize = 20, keyword = '', status = null, startTime = '', endTime = '' }) {
    const { sequelize } = getModel('AuditLog');
    const conditions = ['1 = 1'];
    const replacements = {};
    if (keyword) {
      conditions.push(
        '(a.event LIKE :keyword OR a.ip LIKE :keyword OR u.username LIKE :keyword OR a.app_id LIKE :keyword)'
      );
      replacements.keyword = `%${keyword}%`;
    }
    if (status !== null && status !== undefined && status !== '') {
      conditions.push(Number(status) === 1 ? `NOT ${OPER_FAILED_SQL}` : OPER_FAILED_SQL);
    }
    if (startTime) {
      conditions.push('a.created_at >= :startTime');
      replacements.startTime = startTime;
    }
    if (endTime) {
      conditions.push('a.created_at <= :endTime');
      replacements.endTime = endTime;
    }
    const whereSql = `WHERE ${conditions.join(' AND ')}`;

    const total = await sequelize.query(
      `SELECT COUNT(*) AS c FROM audit_logs a LEFT JOIN user_user u ON u.id = a.user_id ${whereSql}`,
      { type: QueryTypes.SELECT, replacements }
    );

    replacements.limit = Number(pageSize);
    replacements.offset = (Number(pageNum) - 1) * Number(pageSize);

    const rows = await sequelize.query(
      `SELECT a.id, a.user_id, u.username, a.app_id AS module, a.event AS action,
              a.ip, a.user_agent, a.details, a.created_at,
              JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.method')) AS method,
              JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.path')) AS path,
              CAST(JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.costMs')) AS UNSIGNED) AS cost_ms,
              ${OPER_FAILED_SQL} AS failed
         FROM audit_logs a
         LEFT JOIN user_user u ON u.id = a.user_id
         ${whereSql}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements }
    );

    return { rows: rows.map(normalizeOperRow), total: Number(total[0]?.c || 0) };
  }

  /**
   * 操作日志概览（含趋势）
   *
   * @param {string} [range='24h'] 时间档
   * @returns {Promise<object>} 概览数据
   */
  async operStats(range = '24h') {
    const { sequelize } = getModel('AuditLog');
    const { bucketExpr, intervalSql } = resolveRange(range);

    const summary = await sequelize.query(
      `SELECT COUNT(*) AS total,
              SUM(${OPER_FAILED_SQL}) AS failed,
              COUNT(DISTINCT a.user_id) AS active_users,
              AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.costMs')) AS UNSIGNED)) AS avg_cost
         FROM audit_logs a
        WHERE a.created_at >= NOW() - ${intervalSql}`,
      { type: QueryTypes.SELECT }
    );

    const series = await sequelize.query(
      `SELECT ${bucketExpr} AS bucket, COUNT(*) AS total, SUM(${OPER_FAILED_SQL}) AS failed
         FROM audit_logs a
        WHERE a.created_at >= NOW() - ${intervalSql}
        GROUP BY bucket ORDER BY bucket ASC`,
      { type: QueryTypes.SELECT }
    );

    const row = summary[0] || {};
    const total = Number(row.total || 0);
    const failed = Number(row.failed || 0);
    return {
      range,
      total,
      failed,
      successRate: total > 0 ? Number((((total - failed) / total) * 100).toFixed(2)) : 100,
      avgCost: Number(row.avg_cost || 0),
      p95Cost: 0,
      activeUsers: Number(row.active_users || 0),
      series: series.map(s => ({ bucket: s.bucket, total: Number(s.total), failed: Number(s.failed || 0) }))
    };
  }

  /**
   * 当日操作泳道（按模块分道、按小时分块）
   *
   * @param {string} [date=''] 日期（YYYY-MM-DD），缺省为今天
   * @returns {Promise<object>} 泳道数据
   */
  async operTimeline(date = '') {
    const { sequelize } = getModel('AuditLog');
    const day = date || new Date().toISOString().slice(0, 10);
    const rows = await sequelize.query(
      `SELECT COALESCE(a.app_id, '系统') AS module,
              HOUR(a.created_at) AS h,
              COUNT(*) AS c,
              SUM(${OPER_FAILED_SQL}) AS failed
         FROM audit_logs a
        WHERE DATE(a.created_at) = :day
        GROUP BY module, h
        ORDER BY module ASC, h ASC`,
      { type: QueryTypes.SELECT, replacements: { day } }
    );

    const lanes = new Map();
    for (const row of rows) {
      const key = row.module;
      if (!lanes.has(key)) lanes.set(key, { module: key, count: 0, blocks: [] });
      const lane = lanes.get(key);
      const count = Number(row.c);
      lane.count += count;
      lane.blocks.push({
        startSec: Number(row.h) * 3600,
        endSec: (Number(row.h) + 1) * 3600,
        count,
        failed: Number(row.failed || 0),
        maxCost: 0,
        ids: []
      });
    }

    const isToday = day === new Date().toISOString().slice(0, 10);
    const now = new Date();
    return {
      date: day,
      nowSec: isToday ? now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() : null,
      lanes: Array.from(lanes.values())
    };
  }

  /**
   * 登录日志分页
   *
   * @param {object} params 查询参数
   * @returns {Promise<{rows: Array<object>, total: number}>} 分页结果
   */
  async loginPage({ pageNum = 1, pageSize = 20, keyword = '', event = '', startTime = '', endTime = '' }) {
    const { sequelize } = getModel('SessionLog');
    const conditions = ['1 = 1'];
    const replacements = {};
    if (keyword) {
      conditions.push('(l.ip LIKE :keyword OR u.username LIKE :keyword OR l.location LIKE :keyword)');
      replacements.keyword = `%${keyword}%`;
    }
    if (event) {
      conditions.push('l.event = :event');
      replacements.event = event;
    }
    if (startTime) {
      conditions.push('l.created_at >= :startTime');
      replacements.startTime = startTime;
    }
    if (endTime) {
      conditions.push('l.created_at <= :endTime');
      replacements.endTime = endTime;
    }
    const whereSql = `WHERE ${conditions.join(' AND ')}`;

    const total = await sequelize.query(
      `SELECT COUNT(*) AS c FROM session_logs l LEFT JOIN user_user u ON u.id = l.user_id ${whereSql}`,
      { type: QueryTypes.SELECT, replacements }
    );

    replacements.limit = Number(pageSize);
    replacements.offset = (Number(pageNum) - 1) * Number(pageSize);

    const rows = await sequelize.query(
      `SELECT l.id, l.user_id, u.username, l.event, l.app_id, l.ip, l.location, l.user_agent,
              l.details, l.created_at, ${LOGIN_FAILED_SQL} AS failed
         FROM session_logs l
         LEFT JOIN user_user u ON u.id = l.user_id
         ${whereSql}
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements }
    );

    return {
      rows: rows.map(r => ({
        ...r,
        // 🔴 raw 查询里 JSON 列回来是**字符串**（模型查询才自动 parse）。
        //    前端要读 details.reason 解释「为什么被踢」，这里必须归一化。
        details: parseDetails(r.details),
        failed: Number(r.failed || 0),
        status: Number(r.failed || 0) === 1 ? 0 : 1
      })),
      total: Number(total[0]?.c || 0)
    };
  }

  /**
   * 登录概览（含趋势）
   *
   * @param {string} [range='24h'] 时间档
   * @returns {Promise<object>} 概览数据
   */
  async loginStats(range = '24h') {
    const { sequelize } = getModel('SessionLog');
    const resolved = resolveRange(range);
    const bucketExpr = resolved.bucketExpr.replace(/a\.created_at/g, 'l.created_at');
    const intervalSql = resolved.intervalSql;

    const summary = await sequelize.query(
      `SELECT COUNT(*) AS total, SUM(${LOGIN_FAILED_SQL}) AS failed,
              COUNT(DISTINCT l.user_id) AS users, COUNT(DISTINCT l.ip) AS ips
         FROM session_logs l WHERE l.created_at >= NOW() - ${intervalSql}`,
      { type: QueryTypes.SELECT }
    );

    const series = await sequelize.query(
      `SELECT ${bucketExpr} AS bucket, COUNT(*) AS total, SUM(${LOGIN_FAILED_SQL}) AS failed
         FROM session_logs l WHERE l.created_at >= NOW() - ${intervalSql}
        GROUP BY bucket ORDER BY bucket ASC`,
      { type: QueryTypes.SELECT }
    );

    const row = summary[0] || {};
    const total = Number(row.total || 0);
    const failed = Number(row.failed || 0);
    return {
      range,
      total,
      failed,
      successRate: total > 0 ? Number((((total - failed) / total) * 100).toFixed(2)) : 100,
      users: Number(row.users || 0),
      ips: Number(row.ips || 0),
      series: series.map(s => ({ bucket: s.bucket, total: Number(s.total), failed: Number(s.failed || 0) }))
    };
  }

  /**
   * 登录热力（7×24）+ 异常来源聚合
   *
   * @param {number} [days=7] 回溯天数
   * @returns {Promise<object>} 热力数据
   */
  async loginHeatmap(days = 7) {
    const { sequelize } = getModel('SessionLog');
    const span = Number(days) === 30 ? 30 : 7;
    const threshold = 5;

    const cells = await sequelize.query(
      `SELECT WEEKDAY(l.created_at) AS dow, HOUR(l.created_at) AS hour,
              COUNT(*) AS total, SUM(${LOGIN_FAILED_SQL}) AS failed
         FROM session_logs l
        WHERE l.created_at >= NOW() - INTERVAL ${span} DAY
        GROUP BY dow, hour ORDER BY dow ASC, hour ASC`,
      { type: QueryTypes.SELECT }
    );

    const ipAnomalies = await sequelize.query(
      `SELECT l.ip AS \`key\`, SUM(${LOGIN_FAILED_SQL}) AS failed, COUNT(*) AS total,
              COUNT(DISTINCT l.user_id) AS spread,
              MIN(l.created_at) AS first_time, MAX(l.created_at) AS last_time
         FROM session_logs l
        WHERE l.created_at >= NOW() - INTERVAL ${span} DAY
        GROUP BY l.ip HAVING failed >= :threshold ORDER BY failed DESC LIMIT 20`,
      { type: QueryTypes.SELECT, replacements: { threshold } }
    );

    const userAnomalies = await sequelize.query(
      `SELECT u.username AS \`key\`, SUM(${LOGIN_FAILED_SQL}) AS failed, COUNT(*) AS total,
              COUNT(DISTINCT l.ip) AS spread,
              MIN(l.created_at) AS first_time, MAX(l.created_at) AS last_time
         FROM session_logs l JOIN user_user u ON u.id = l.user_id
        WHERE l.created_at >= NOW() - INTERVAL ${span} DAY
        GROUP BY u.username HAVING failed >= :threshold ORDER BY failed DESC LIMIT 20`,
      { type: QueryTypes.SELECT, replacements: { threshold } }
    );

    return {
      days: span,
      threshold,
      since: new Date(Date.now() - span * 86400000).toISOString(),
      cells: cells.map(c => ({
        dow: Number(c.dow),
        hour: Number(c.hour),
        total: Number(c.total),
        failed: Number(c.failed || 0)
      })),
      anomalies: [
        ...ipAnomalies.map(a => ({
          kind: 'ip',
          ...a,
          failed: Number(a.failed),
          total: Number(a.total),
          spread: Number(a.spread)
        })),
        ...userAnomalies.map(a => ({
          kind: 'user',
          ...a,
          failed: Number(a.failed),
          total: Number(a.total),
          spread: Number(a.spread)
        }))
      ]
    };
  }

  /**
   * 最近登录记录（工作台用）
   *
   * @param {number} [limit=5] 条数
   * @returns {Promise<Array<object>>} 登录记录
   */
  async recentLogins(limit = 5) {
    // 无 JSON 提取、无派生聚合 ⇒ 按文件头约定必须走模型（不写裸 SQL）
    const SessionLog = getModel('SessionLog');
    const { Op } = SessionLog.sequelize.Sequelize;
    const logs = await SessionLog.findAll({
      where: { event: { [Op.in]: ['LOGIN', 'LOGIN_SUCCESS'] } },
      attributes: ['id', 'event', 'ip', 'location', 'created_at', 'user_id'],
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      raw: true
    });
    if (logs.length === 0) return [];

    const userIds = Array.from(new Set(logs.map(l => Number(l.user_id)).filter(n => n > 0)));
    const users =
      userIds.length > 0
        ? await getModel('User').findAll({
            where: { id: userIds },
            attributes: ['id', 'username', 'avatar'],
            raw: true
          })
        : [];
    const userOf = new Map(users.map(u => [Number(u.id), u]));

    return logs.map(l => {
      const user = userOf.get(Number(l.user_id));
      return {
        id: l.id,
        event: l.event,
        ip: l.ip,
        location: l.location,
        created_at: l.created_at,
        username: user ? user.username : null,
        avatar: user ? user.avatar : null
      };
    });
  }

  /**
   * 删除单条操作日志
   *
   * @param {number} id 日志 ID
   * @returns {Promise<boolean>} 是否命中记录
   */
  async removeOper(id) {
    const affected = await getModel('AuditLog').destroy({ where: { id } });
    return affected > 0;
  }

  /**
   * 清空操作日志
   *
   * @returns {Promise<number>} 删除条数
   */
  async clearOper() {
    return getModel('AuditLog').destroy({ where: {}, truncate: false });
  }

  /**
   * 删除单条登录日志
   *
   * @param {number} id 日志 ID
   * @returns {Promise<boolean>} 是否命中记录
   */
  async removeLogin(id) {
    const affected = await getModel('SessionLog').destroy({ where: { id } });
    return affected > 0;
  }

  /**
   * 清空登录日志
   *
   * @returns {Promise<number>} 删除条数
   */
  async clearLogin() {
    return getModel('SessionLog').destroy({ where: {}, truncate: false });
  }
}

/**
 * 统一操作日志行形状（前端只认这一套字段）
 *
 * @param {object} row 数据库原始行
 * @returns {object} 归一化后的日志行
 */
function normalizeOperRow(row) {
  return {
    id: Number(row.id),
    user_id: row.user_id,
    username: row.username || '',
    module: row.module || '系统',
    action: row.action,
    method: row.method || '',
    path: row.path || '',
    cost_ms: Number(row.cost_ms || 0),
    ip: row.ip || '',
    user_agent: row.user_agent || '',
    detail: row.details ? JSON.stringify(row.details) : '',
    status: Number(row.failed || 0) === 1 ? 0 : 1,
    created_at: row.created_at
  };
}

const logDao = new LogDao();

export default logDao;
