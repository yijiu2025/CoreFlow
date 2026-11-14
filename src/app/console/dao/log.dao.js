/**
 * 日志数据访问层（audit_logs 操作审计 / session_logs 登录会话）
 *
 * 🔴 不新建日志表：这两张表已是全仓安全事件的唯一来源（登录、登出、权限变更、
 * 踢出设备都写它们）。管理端只做**查询与聚合**，写入口保持在既有业务链路里，
 * 否则会出现「同一次登录写两处、两处不一致」的分叉。
 *
 * 字段映射（audit_logs 没有 method/path/cost 列，这些信息**约定**放在 details JSON 里）：
 *   module  ← app_id
 *   action  ← event
 *   status  ← event 含 FAIL / DENIED / FORBIDDEN，或 details.status ≥ 400
 *   path    ← details.path
 *   method  ← details.method（仅当命中 HTTP 动词白名单）
 *   costMs  ← details.costMs
 *
 * 🔴 这四项**目前基本是空的**，不是查询写错：`audit-logger` 只落业务自己塞进来的
 *    `details`，写入侧（`framework/security/auth/audit/audit-logger.js`）不采 HTTP
 *    上下文 —— 实测 59 条审计里 `details.costMs` 0 条、`details.path` 2 条、
 *    `details.method` 1 条（还是二次验证方式撞名）。要让"路径/耗时"真的可用，
 *    必须在**写入口**补（审计中间件按请求落 method/path/costMs），不能指望读侧猜。
 *    在那之前，前端把空值如实显示为"—"，不做任何推断。
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
 * 标准 HTTP 动词白名单
 *
 * 用来把 `details.method` 里的**真 HTTP 方法**和同名撞车的业务字段（二次验证方式等）
 * 分开，详见 `normalizeOperRow`。
 */
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/**
 * 「只留操作事件」的排除条件
 *
 * 🔴 `audit_logs` 与 `session_logs` **有重叠**：登录成功这类事件两边都写（实测
 *    audit_logs 里 24 条 LOGIN_SUCCESS），所以前台「操作日志」会混进登录日志，
 *    同一次登录在两个页面各出现一次。登录/会话生命周期归 `session_logs` 一份，
 *    操作日志这边必须排除掉，否则两页的数字互相打脸。
 *
 * 排除的是**会话生命周期**：登录、登出、会话刷新、被踢。它们的共同点是"谁在什么
 * 时候进来了/出去了"，与"谁改了什么"是两类问题，分开看才有意义。
 *
 * 🔴 但**管理员踢别人的设备**（`SESSION_KICK_DEVICE`）不是会话生命周期，是"动了别人的账号"
 *    —— 它和改角色同一类。早先这里写的是 `a.event LIKE 'SESSION%'`，把这条例也扫掉了：
 *    事件写进了 audit_logs，两个页面却都看不到（操作日志排除了它，登录日志读的是
 *    session_logs）。实测「踢下线后查不到任何记录」就是这么来的。
 *    所以只排除**精确的**会话事件，不按前缀扫。
 */
const OPER_ONLY_SQL = `NOT (a.event LIKE 'LOGIN%' OR a.event LIKE 'LOGOUT%'
  OR a.event IN ('KICK', 'SESSION_KICK', 'SESSION_REFRESH'))`;

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
 * 按时间档返回桶表达式、窗口条件、上一等长周期条件与阶梯长度
 *
 * 🔴 **24h 的桶必须带日期**（`%m-%d %H:00`）。只按 `%H:00` 分桶时，滚动 24 小时
 *    的窗口必然跨零点，于是 `13:00` 会出现两次（昨天一个、今天一个）—— 两者是
 *    不同时段、不同数值，但桶名相同。此时**任何排序都无法把数值放回正确位置**
 *    （信息已经丢了），画出来就是"折线时间倒流"。带上日期后桶本身有序，也才能补零。
 *
 * 🔴 **7d / 30d 按自然日对齐**（`DATE(...) >= CURDATE() - INTERVAL n-1 DAY`）。
 *    用 `NOW() - INTERVAL 7 DAY` 会得到 8 个日期桶（首尾各被切掉一段），
 *    与"近 7 天 7 根柱"的直觉不符，柱子数也会随运行时刻抖动。
 *
 * @param {string} range 时间档（24h / 7d / 30d）
 * @returns {{bucketExpr: string, whereSql: string, prevWhereSql: string, hours?: number, days?: number}}
 *   桶表达式、当前窗口条件、上一等长周期条件、阶梯长度
 */
function resolveRange(range) {
  if (range === '7d' || range === '30d' || range === '1y') {
    const days = range === '1y' ? 365 : range === '30d' ? 30 : 7;
    return {
      bucketExpr: "DATE_FORMAT(a.created_at, '%m-%d')",
      whereSql: `DATE(a.created_at) >= CURDATE() - INTERVAL ${days - 1} DAY`,
      prevWhereSql:
        `DATE(a.created_at) >= CURDATE() - INTERVAL ${days * 2 - 1} DAY` +
        ` AND DATE(a.created_at) < CURDATE() - INTERVAL ${days - 1} DAY`,
      days
    };
  }
  return {
    bucketExpr: "DATE_FORMAT(a.created_at, '%m-%d %H:00')",
    whereSql: 'a.created_at >= NOW() - INTERVAL 24 HOUR',
    prevWhereSql: 'a.created_at >= NOW() - INTERVAL 48 HOUR AND a.created_at < NOW() - INTERVAL 24 HOUR',
    hours: 24
  };
}

/**
 * 等长窗口的 SQL 条件（支持向过去翻页）
 *
 * `offset = 0` 是"最近一个窗口" `[now - span, now)`；`offset = 1` 是紧挨着的
 * 上一个等长窗口，以此类推 —— 热力图上的「上一周 / 上一月 / 上一年」都靠它。
 *
 * 🔴 上界必须写 `< now - offset*span`。只写 `>=` 的话，翻到过去那一段时
 *    "更近的这一段"也会被算进去：相邻两页会重叠，数字对不上而且看不出错。
 *
 * @param {string} col 时间列（带表别名，如 `a.created_at`）
 * @param {number} days 窗口长度（天）
 * @param {number} [offset=0] 向过去翻几页（0 = 最新）
 * @returns {string} WHERE 片段
 */
function windowSql(col, days, offset) {
  const span = Number(days) || 7;
  const off = Math.max(0, Math.trunc(Number(offset) || 0)) * span;
  return `${col} >= NOW() - INTERVAL ${off + span} DAY AND ${col} < NOW() - INTERVAL ${off} DAY`;
}

/**
 * DATE 列 → `YYYY-MM-DD`
 *
 * 日历热力的格子以"日期"为主键，必须给全量日期；`DATE_FORMAT('%m-%d')` 的桶名
 * 跨年就重名，前端 `Date.parse('11-06')` 直接 NaN，整张图会塌掉。
 *
 * @param {Date|string|null} value DATE 值
 * @returns {string} 形如 2026-11-12
 */
function toDateStr(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 把「有数据的天」补成完整日历序列
 *
 * 日历热力要的是**每一天**：缺一天就是网格上的一个洞，读者会以为那天"没记录"，
 * 而实际是"没有操作"。所以按 DB 的今天往回铺满 `span` 天，没命中的补 0。
 *
 * 🔴 今天取 `CURDATE()` 而不是 `new Date()`：分桶口径在数据库那边，
 *    前端/服务端时钟差一天会让"最后一格"落到错误的日期上。
 *
 * @param {object} sequelize Sequelize 实例
 * @param {Array<object>} rows 聚合结果（含 `d` / `total` / `failed`）
 * @param {number} span 天数
 * @param {number} offset 向过去翻几页
 * @returns {Promise<Array<{date: string, total: number, failed: number}>>} 逐日序列
 */
async function fillDailySeries(sequelize, rows, span, offset) {
  const [[todayRow]] = await sequelize.query('SELECT CURDATE() AS today');
  const map = new Map(rows.map(r => [toDateStr(r.d), { total: Number(r.total), failed: Number(r.failed || 0) }]));

  const end = new Date(`${toDateStr(todayRow.today)}T00:00:00`);
  end.setDate(end.getDate() - Math.max(0, Number(offset) || 0) * span);

  const out = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const day = new Date(end);
    day.setDate(day.getDate() - i);
    const key = toDateStr(day);
    const hit = map.get(key);
    out.push({ date: key, total: hit?.total ?? 0, failed: hit?.failed ?? 0 });
  }
  return out;
}

/**
 * 取数据库的墙钟（年 / 月 / 日 / 小时）
 *
 * 🔴 **必须读格式化字符串，不能读 `NOW()` 的返回值。** mysql2 会把 DATETIME
 *    解析成 JS `Date`，而解析结果是"本地时区口径"的 —— 一旦 DB 服务器与本机
 *    时钟不一致（本机实测 DB 快 8 小时），同一份数据用 `getHours()` 取出来就是
 *    另一套数字。走 `DATE_FORMAT` 拿到的是**纯文本**，全程不经过时区转换，
 *    与 `GROUP BY DATE_FORMAT(created_at, …)` 生成的桶名天然同一口径。
 *
 * @param {import('sequelize').Sequelize} sequelize 连接
 * @returns {Promise<{year: number, month: number, day: number, hour: number}>} DB 墙钟
 */
async function readDbClock(sequelize) {
  const rows = await sequelize.query("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H') AS clock", {
    type: QueryTypes.SELECT
  });
  const [year, month, day, hour] = String(rows[0]?.clock || '')
    .split(/[- ]/)
    .map(Number);
  if (!year || !month || !day || Number.isNaN(hour)) {
    // 解析失败就退回 UTC 口径的当前整点：宁可阶梯偏一档，也不要抛错让整张卡空掉
    const fallback = new Date();
    return {
      year: fallback.getUTCFullYear(),
      month: fallback.getUTCMonth() + 1,
      day: fallback.getUTCDate(),
      hour: fallback.getUTCHours()
    };
  }
  return { year, month, day, hour };
}

/**
 * 生成桶阶梯（升序，末尾是当前时段）
 *
 * 全部用 `Date.UTC` 做**日历算术**：它只承担"某天减 n 天是哪天"的计算，
 * 取出来的也是 UTC 分量，因此不受宿主机时区与夏令时影响 —— 这里要的是日历，
 * 不是时刻。
 *
 * 🔴 每一项都带 **ISO 日期**（`YYYY-MM-DD`），不只是 `MM-DD` 标签。年视图要把
 *    每一天摆进"第几周 × 星期几"的格子，光有 `MM-DD` 无法定位（跨年还会重名），
 *    而前端自己拿 `new Date()` 推日期又会引入"浏览器钟 vs 数据库钟"的第二套真相。
 *
 * @param {{hours?: number, days?: number}} spec 时间档
 * @param {{year: number, month: number, day: number, hour: number}} clock DB 墙钟
 * @returns {Array<{label: string, date: string}>} 桶名与 ISO 日期
 */
function bucketLadder(spec, clock) {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const base = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour);
  const ladder = [];
  if (spec.hours) {
    for (let i = spec.hours - 1; i >= 0; i -= 1) {
      const d = new Date(base - i * 3600000);
      ladder.push({
        label: `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`,
        date: iso(d)
      });
    }
    return ladder;
  }
  for (let i = spec.days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(clock.year, clock.month - 1, clock.day - i));
    ladder.push({ label: `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, date: iso(d) });
  }
  return ladder;
}

/**
 * 把聚合行铺到阶梯上（缺的时段补 0）
 *
 * `GROUP BY` 只返回**有数据**的桶。直接拿去画图，3 个小时的数据会被等距铺满
 * 整个 24 小时的宽度，"峰值/均值"也就变成了"有数据的那几个小时的峰值/均值"，
 * 与卡头的"近 24 小时"自相矛盾。补零之后柱/点与时间轴才是一一对应的。
 *
 * @param {Array<object>} rows SQL 聚合结果
 * @param {Array<{label: string, date: string}>} ladder 桶阶梯
 * @returns {Array<{bucket: string, date: string, total: number, failed: number}>} 稠密序列
 */
function fillSeries(rows, ladder) {
  const byBucket = new Map();
  for (const row of rows) {
    const key = String(row.bucket);
    if (byBucket.has(key)) continue;
    byBucket.set(key, { total: Number(row.total || 0), failed: Number(row.failed || 0) });
  }
  return ladder.map(({ label, date }) => ({
    bucket: label,
    date,
    total: byBucket.get(label)?.total || 0,
    failed: byBucket.get(label)?.failed || 0
  }));
}

/* ── 筛选条件构造 ───────────────────────────────────────────────
 *
 * 列表、导出、清除**必须共用同一套 where**：清除前给用户看的是"命中 N 条"，
 * 若预览与真正删除各写一份条件，迟早出现"显示 3 条、实际删 30 条"。
 * 所以这里抽成纯函数，三个入口都调它。
 *
 * 条件是**独立维度**（时间/账号/操作/IP），不是一个大 keyword：
 * keyword 是 OR 模糊匹配，用它做"按 IP 清除"会顺手把别处的同类文本一起删掉。
 */

/**
 * 登录日志的统一 JOIN 片段
 *
 * 带上注销身份快照（`d`），这样"按账号"既能匹配当前用户名，也能匹配注销前的用户名 ——
 * 管理员想清某个已注销账号的登录记录时，输的是它注销前的名字。
 *
 * 🔴 三条查询（count / page / purge）都必须用这一段，否则条件里引用的 `u` / `d`
 *    在某个入口不存在，会直接 unknown column。
 */
const LOGIN_JOIN_SQL = `LEFT JOIN user_user u ON u.id = l.user_id
       LEFT JOIN (
            SELECT user_id, MAX(id) AS snapshot_id
              FROM user_deactivation
             WHERE status = 3 AND username_snapshot IS NOT NULL
             GROUP BY user_id
       ) ds ON ds.user_id = l.user_id
       LEFT JOIN user_deactivation d ON d.id = ds.snapshot_id`;

/**
 * 操作日志筛选条件
 *
 * @param {object} [filters] 条件
 * @param {string} [filters.keyword] 跨字段模糊（事件 / IP / 账号 / 模块）
 * @param {number|null} [filters.status] 1=成功 0=失败
 * @param {string} [filters.startTime] 起始时间
 * @param {string} [filters.endTime] 结束时间
 * @param {string} [filters.username] 账号（模糊）
 * @param {string} [filters.ip] 来源 IP（前缀匹配）
 * @param {string} [filters.action] 事件码（精确）
 * @returns {{whereSql: string, replacements: object}} where 片段与占位值
 */
function buildOperFilter(filters = {}) {
  const {
    keyword = '',
    status = null,
    startTime = '',
    endTime = '',
    username = '',
    ip = '',
    action = '',
    scopeSql = ''
  } = filters;
  // 操作日志只留"改了什么"，登录/会话事件归 session_logs（见 OPER_ONLY_SQL）
  // scopeSql 是行级数据范围（角色数据权限），由路由层按当前账号算好传进来
  const conditions = ['1 = 1', OPER_ONLY_SQL];
  if (scopeSql) conditions.push(scopeSql.replace(/^\s*AND\s+/i, ''));
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
  if (username) {
    conditions.push('u.username LIKE :username');
    replacements.username = `%${username}%`;
  }
  // IP 用**前缀**匹配：输入 192.168 能圈住一个网段，输入完整 IP 就是精确命中。
  // 两侧都加 % 会把 10.2.3.4 里的 "2.3" 也算进去，清数据时太危险。
  if (ip) {
    conditions.push('a.ip LIKE :ip');
    replacements.ip = `${ip}%`;
  }
  if (action) {
    conditions.push('a.event = :action');
    replacements.action = action;
  }
  return { whereSql: `WHERE ${conditions.join(' AND ')}`, replacements };
}

/**
 * 登录日志筛选条件
 *
 * @param {object} [filters] 条件
 * @param {string} [filters.keyword] 跨字段模糊（IP / 账号 / 归属地）
 * @param {string} [filters.event] 事件码（精确）
 * @param {string} [filters.startTime] 起始时间
 * @param {string} [filters.endTime] 结束时间
 * @param {string} [filters.username] 账号（模糊，兼匹配注销前用户名）
 * @param {string} [filters.ip] 来源 IP（前缀匹配）
 * @returns {{whereSql: string, replacements: object}} where 片段与占位值
 */
function buildLoginFilter(filters = {}) {
  const { keyword = '', event = '', startTime = '', endTime = '', username = '', ip = '', scopeSql = '' } = filters;
  const conditions = ['1 = 1'];
  const replacements = {};
  // 行级数据范围（角色数据权限），由路由层算好传进来
  if (scopeSql) conditions.push(scopeSql.replace(/^\s*AND\s+/i, ''));
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
  if (username) {
    // 兼匹配注销前的用户名：已注销账号现在的 username 是「已注销用户#N」，
    // 管理员要清它的记录时输的必然是注销前那个名字
    conditions.push('(u.username LIKE :username OR d.username_snapshot LIKE :username)');
    replacements.username = `%${username}%`;
  }
  if (ip) {
    conditions.push('l.ip LIKE :ip');
    replacements.ip = `${ip}%`;
  }
  return { whereSql: `WHERE ${conditions.join(' AND ')}`, replacements };
}

/**
 * 归一化条件（留痕用）
 *
 * 只保留**真正生效**的键，且把空值剔掉 —— 留痕里出现一串空字符串，
 * 事后没人判断得出当时到底按什么删的。
 *
 * @param {object} filters 原始条件
 * @returns {object} 非空条件
 */
function compactFilters(filters = {}) {
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
}

class LogDao {
  /**
   * 操作日志分页
   *
   * @param {object} params 查询参数
   * @returns {Promise<{rows: Array<object>, total: number}>} 分页结果
   */
  async operPage({ pageNum = 1, pageSize = 20, ...filters }) {
    const { sequelize } = getModel('AuditLog');
    const { whereSql, replacements } = buildOperFilter(filters);

    const total = await sequelize.query(
      `SELECT COUNT(*) AS c FROM audit_logs a LEFT JOIN user_user u ON u.id = a.user_id ${whereSql}`,
      { type: QueryTypes.SELECT, replacements }
    );

    replacements.limit = Number(pageSize);
    replacements.offset = (Number(pageNum) - 1) * Number(pageSize);

    const rows = await sequelize.query(
      `SELECT a.id, a.user_id, u.username, u.uid, u.email,
              a.app_id AS module, a.event AS action,
              a.ip, a.device_id, a.user_agent, a.details, a.created_at,
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
    const spec = resolveRange(range);
    const clock = await readDbClock(sequelize);
    const ladder = bucketLadder(spec, clock);

    const summary = await sequelize.query(
      `SELECT COUNT(*) AS total,
              SUM(${OPER_FAILED_SQL}) AS failed,
              COUNT(DISTINCT a.user_id) AS active_users,
              AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.costMs')) AS UNSIGNED)) AS avg_cost
         FROM audit_logs a
        WHERE ${spec.whereSql} AND ${OPER_ONLY_SQL}`,
      { type: QueryTypes.SELECT }
    );

    const series = await sequelize.query(
      `SELECT ${spec.bucketExpr} AS bucket, COUNT(*) AS total, SUM(${OPER_FAILED_SQL}) AS failed
         FROM audit_logs a
        WHERE ${spec.whereSql} AND ${OPER_ONLY_SQL}
        GROUP BY bucket ORDER BY bucket ASC`,
      { type: QueryTypes.SELECT }
    );

    const prev = await sequelize.query(
      `SELECT COUNT(*) AS total, SUM(${OPER_FAILED_SQL}) AS failed
         FROM audit_logs a
        WHERE ${spec.prevWhereSql} AND ${OPER_ONLY_SQL}`,
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
      prevTotal: Number(prev[0]?.total || 0),
      prevFailed: Number(prev[0]?.failed || 0),
      avgCost: Number(row.avg_cost || 0),
      p95Cost: 0,
      activeUsers: Number(row.active_users || 0),
      series: fillSeries(series, ladder)
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
        WHERE DATE(a.created_at) = :day AND ${OPER_ONLY_SQL}
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
  async loginPage({ pageNum = 1, pageSize = 20, ...filters }) {
    const { sequelize } = getModel('SessionLog');
    const { whereSql, replacements } = buildLoginFilter(filters);

    // COUNT 也要带同一段 JOIN：筛选条件里可能引用 `u` / `d`（按账号，含注销前用户名）
    const total = await sequelize.query(`SELECT COUNT(*) AS c FROM session_logs l ${LOGIN_JOIN_SQL} ${whereSql}`, {
      type: QueryTypes.SELECT,
      replacements
    });

    replacements.limit = Number(pageSize);
    replacements.offset = (Number(pageNum) - 1) * Number(pageSize);

    /*
     * 关联注销前的身份快照
     *
     * 注销执行时 `user_user.username` 被改成 `已注销用户#N`、email 置空（PII 擦除），
     * 于是日志只剩一个占位名 —— 管理员看不出这条会话属于谁。快照在擦除前留在了
     * `user_deactivation.username_snapshot / email_snapshot`，这里按 user_id 取最新一条。
     *
     * 🔴 派生表先 `MAX(id)` 再 JOIN 原表：同一 user_id 可能有多条申请（撤销过的、
     *    重提的），直接 JOIN `WHERE status = 3` 在极端情况下会放大行数，让分页失真。
     *
     * 历史数据（快照功能上线前注销的）取不到，`prev_username` 就是 NULL —— 前端要能
     * 区分"没有快照"和"没有注销"，所以另外带出 `u.status AS user_status`。
     */
    const rows = await sequelize.query(
      `SELECT l.id, l.user_id, u.username, u.status AS user_status,
              d.username_snapshot AS prev_username, d.email_snapshot AS prev_email,
              l.event, l.app_id, l.ip, l.location, l.user_agent,
              l.details, l.created_at, ${LOGIN_FAILED_SQL} AS failed
         FROM session_logs l
         ${LOGIN_JOIN_SQL}
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
        // `status` 被占用为"这条登录成功/失败"，账号状态另给 `user_status`：
        // -1 表示该账号已注销（用户名已被换成占位名）
        user_status: r.user_status === null || r.user_status === undefined ? null : Number(r.user_status),
        prev_username: r.prev_username || '',
        prev_email: r.prev_email || '',
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
    const spec = resolveRange(range);
    // 🔴 三个片段都要换别名：whereSql / prevWhereSql 里同样写着 `a.created_at`，
    //    只换 bucketExpr 会让登录统计的窗口条件指向不存在的表别名（ER_BAD_FIELD_ERROR）
    const toLogin = sql => String(sql).replace(/a\.created_at/g, 'l.created_at');
    const bucketExpr = toLogin(spec.bucketExpr);
    const whereSql = toLogin(spec.whereSql);
    const prevWhereSql = toLogin(spec.prevWhereSql);
    const clock = await readDbClock(sequelize);
    const ladder = bucketLadder(spec, clock);

    const summary = await sequelize.query(
      `SELECT COUNT(*) AS total, SUM(${LOGIN_FAILED_SQL}) AS failed,
              COUNT(DISTINCT l.user_id) AS users, COUNT(DISTINCT l.ip) AS ips
         FROM session_logs l WHERE ${whereSql}`,
      { type: QueryTypes.SELECT }
    );

    const series = await sequelize.query(
      `SELECT ${bucketExpr} AS bucket, COUNT(*) AS total, SUM(${LOGIN_FAILED_SQL}) AS failed
         FROM session_logs l WHERE ${whereSql}
        GROUP BY bucket ORDER BY bucket ASC`,
      { type: QueryTypes.SELECT }
    );

    // 上一等长周期（环比用）：口径与当前窗口完全对称，只平移一个窗口宽度
    const prev = await sequelize.query(
      `SELECT COUNT(*) AS total, SUM(${LOGIN_FAILED_SQL}) AS failed
         FROM session_logs l WHERE ${prevWhereSql}`,
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
      prevTotal: Number(prev[0]?.total || 0),
      prevFailed: Number(prev[0]?.failed || 0),
      users: Number(row.users || 0),
      ips: Number(row.ips || 0),
      series: fillSeries(series, ladder)
    };
  }

  /**
   * 操作热力（7×24）
   *
   * 与登录热力同一套口径（`WEEKDAY × HOUR`），但数据源是 `audit_logs` 且**排除登录
   * 类事件**（见 `OPER_ONLY_SQL`）—— 否则登录高峰会把"什么时候有人在改东西"
   * 完全淹没掉，热力图就变成了登录热力的副本。
   *
   * @param {number} [days=7] 回溯天数
   * @returns {Promise<object>} 热力数据
   */
  async operHeatmap(days = 7, offset = 0) {
    const { sequelize } = getModel('AuditLog');
    const span = Number(days) === 30 ? 30 : 7;

    const cells = await sequelize.query(
      `SELECT WEEKDAY(a.created_at) AS dow, HOUR(a.created_at) AS hour,
            COUNT(*) AS total, SUM(${OPER_FAILED_SQL}) AS failed
       FROM audit_logs a
      WHERE ${windowSql('a.created_at', span, offset)} AND ${OPER_ONLY_SQL}
      GROUP BY dow, hour ORDER BY dow ASC, hour ASC`,
      { type: QueryTypes.SELECT }
    );

    return {
      days: span,
      offset: Math.max(0, Math.trunc(Number(offset) || 0)),
      cells: cells.map(c => ({
        dow: Number(c.dow),
        hour: Number(c.hour),
        total: Number(c.total),
        failed: Number(c.failed || 0)
      }))
    };
  }

  /**
   * 操作日历（按天的序列，供「年」档日历热力）
   *
   * 与 `operLogStats('1y')` 的区别：那条给的是**读数卡**用的桶名（`MM-DD`，跨年重名），
   * 日历要的是完整日期 `YYYY-MM-DD`；两者口径不同，不能互相顶替。
   *
   * @param {number} [days=365] 窗口天数
   * @param {number} [offset=0] 向过去翻几页（0 = 最近一年）
   * @returns {Promise<{days: number, offset: number, series: Array<{date: string, total: number, failed: number}>}>}
   */
  async operCalendar(days = 365, offset = 0) {
    const { sequelize } = getModel('AuditLog');
    const span = Math.max(1, Math.min(400, Number(days) || 365));

    const rows = await sequelize.query(
      `SELECT DATE(a.created_at) AS d, COUNT(*) AS total, SUM(${OPER_FAILED_SQL}) AS failed
         FROM audit_logs a
        WHERE ${windowSql('a.created_at', span, offset)} AND ${OPER_ONLY_SQL}
        GROUP BY d ORDER BY d ASC`,
      { type: QueryTypes.SELECT }
    );

    return {
      days: span,
      offset: Math.max(0, Math.trunc(Number(offset) || 0)),
      series: await fillDailySeries(sequelize, rows, span, offset)
    };
  }

  /**
   * 登录热力（7×24）+ 异常来源聚合
   *
   * @param {number} [days=7] 回溯天数
   * @returns {Promise<object>} 热力数据
   */
  async loginHeatmap(days = 7, offset = 0) {
    const { sequelize } = getModel('SessionLog');
    const span = Number(days) === 30 ? 30 : 7;
    const threshold = 5;
    const window = windowSql('l.created_at', span, offset);

    const cells = await sequelize.query(
      `SELECT WEEKDAY(l.created_at) AS dow, HOUR(l.created_at) AS hour,
              COUNT(*) AS total, SUM(${LOGIN_FAILED_SQL}) AS failed
         FROM session_logs l
        WHERE ${window}
        GROUP BY dow, hour ORDER BY dow ASC, hour ASC`,
      { type: QueryTypes.SELECT }
    );

    const ipAnomalies = await sequelize.query(
      `SELECT l.ip AS \`key\`, SUM(${LOGIN_FAILED_SQL}) AS failed, COUNT(*) AS total,
              COUNT(DISTINCT l.user_id) AS spread,
              MIN(l.created_at) AS first_time, MAX(l.created_at) AS last_time
         FROM session_logs l
        WHERE ${window}
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

    const shift = Math.max(0, Math.trunc(Number(offset) || 0));

    return {
      days: span,
      offset: shift,
      threshold,
      // since 跟着窗口走：翻到上一周时，"起点"也应该是上一周，不能还报最近 7 天
      since: new Date(Date.now() - (shift + 1) * span * 86400000).toISOString(),
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
   * 登录日历（按天的序列，供「年」档日历热力）
   *
   * @param {number} [days=365] 窗口天数
   * @param {number} [offset=0] 向过去翻几页（0 = 最近一年）
   * @returns {Promise<{days: number, offset: number, series: Array<{date: string, total: number, failed: number}>}>}
   */
  async loginCalendar(days = 365, offset = 0) {
    const { sequelize } = getModel('SessionLog');
    const span = Math.max(1, Math.min(400, Number(days) || 365));

    const rows = await sequelize.query(
      `SELECT DATE(l.created_at) AS d, COUNT(*) AS total, SUM(${LOGIN_FAILED_SQL}) AS failed
         FROM session_logs l
        WHERE ${windowSql('l.created_at', span, offset)}
        GROUP BY d ORDER BY d ASC`,
      { type: QueryTypes.SELECT }
    );

    return {
      days: span,
      offset: Math.max(0, Math.trunc(Number(offset) || 0)),
      series: await fillDailySeries(sequelize, rows, span, offset)
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
  async removeOper(id, operator = {}) {
    const AuditLog = getModel('AuditLog');
    return AuditLog.sequelize.transaction(async transaction => {
      const affected = await AuditLog.destroy({ where: { id }, transaction });
      if (affected > 0) {
        /*
         * 单条删除同样留痕。它没有走二次验证（影响面是"一条"，且前端没有入口），
         * 但**必须留下痕迹** —— 否则"审计记录可以被逐条无痕抹掉"就成了绕过
         * 批量清除那套限制的后门。
         */
        await AuditLog.create(
          {
            user_id: operator.userId || null,
            event: 'LOG_PURGE',
            app_id: 'console',
            ip: operator.ip || null,
            user_agent: operator.userAgent || null,
            details: { scope: 'oper', removed: 1, filters: { id: Number(id) }, stepUpMethod: null }
          },
          { transaction }
        );
      }
      return affected > 0;
    });
  }

  /**
   * 删除单条登录日志
   *
   * @param {number} id 日志 ID
   * @returns {Promise<boolean>} 是否命中记录
   */
  async removeLogin(id, operator = {}) {
    const SessionLog = getModel('SessionLog');
    const AuditLog = getModel('AuditLog');
    return SessionLog.sequelize.transaction(async transaction => {
      const affected = await SessionLog.destroy({ where: { id }, transaction });
      if (affected > 0) {
        // 理由同 removeOper：删一条也要留痕
        await AuditLog.create(
          {
            user_id: operator.userId || null,
            event: 'LOG_PURGE',
            app_id: 'console',
            ip: operator.ip || null,
            user_agent: operator.userAgent || null,
            details: { scope: 'login', removed: 1, filters: { id: Number(id) }, stepUpMethod: null }
          },
          { transaction }
        );
      }
      return affected > 0;
    });
  }

  /**
   * 按条件清除操作日志（**必须带条件**，见 countOper）
   *
   * @param {object} filters 筛选条件（与 operPage 同一套）
   * @param {object} operator 操作者上下文
   * @returns {Promise<number>} 删除条数
   */
  async purgeOper(filters = {}, operator = {}) {
    return this.purge('oper', filters, operator);
  }

  /**
   * 按条件清除登录日志（**必须带条件**）
   *
   * @param {object} filters 筛选条件（与 loginPage 同一套）
   * @param {object} operator 操作者上下文
   * @returns {Promise<number>} 删除条数
   */
  async purgeLogin(filters = {}, operator = {}) {
    return this.purge('login', filters, operator);
  }

  /**
   * 统计命中条数（清除前预览）
   *
   * 与 purge 共用同一个 filter 构造函数 —— 预览说 3 条就必须删 3 条。
   *
   * @param {'oper'|'login'} scope 日志类型
   * @param {object} filters 条件
   * @returns {Promise<number>} 命中条数
   */
  async countByFilter(scope, filters = {}) {
    const { sequelize } = getModel(scope === 'login' ? 'SessionLog' : 'AuditLog');
    const built = scope === 'login' ? buildLoginFilter(filters) : buildOperFilter(filters);
    const from =
      scope === 'login'
        ? `FROM session_logs l ${LOGIN_JOIN_SQL}`
        : 'FROM audit_logs a LEFT JOIN user_user u ON u.id = a.user_id';
    const rows = await sequelize.query(`SELECT COUNT(*) AS c ${from} ${built.whereSql}`, {
      type: QueryTypes.SELECT,
      replacements: built.replacements
    });
    return Number(rows[0]?.c || 0);
  }

  /**
   * 清除 + 留痕（内部实现，两个 purge 方法共用）
   *
   * ── 为什么删除与留痕必须在**同一事务**里 ──
   * 分开做会出现两种半成品：删除成功但留痕失败（**删了却查不到谁删的**，这是最糟的），
   * 或者留痕成功但删除失败（日志里凭空多出一条"清除了 0 条"）。同事务内要么都成、
   * 要么都不成。
   *
   * ── 为什么留痕写在删除之后 ──
   * 写在之前会被自己这条 DELETE 命中（当条件是"截至现在"时会连留痕一起删掉）。
   * 写在之后，留痕的 `created_at` 必定晚于删除语句的可见范围。
   *
   * ── 为什么必须带条件 ──
   * 无条件清除等于"一条命令清空审计"，而审计被清空后连"谁清的"都无从追查（除非
   * 清的是登录日志）。所以这里硬性拒绝空条件；真要清空请给一个很早的起始时间，
   * 那也是一个**明确写在留痕里的条件**。
   *
   * @param {'oper'|'login'} scope 日志类型
   * @param {object} filters 条件
   * @param {object} operator { userId, ip, userAgent, stepUpMethod }
   * @returns {Promise<number>} 删除条数
   * @throws {Error} `INVALID_PARAM:` 条件为空
   */
  async purge(scope, filters = {}, operator = {}) {
    const effective = compactFilters(filters);
    // status=0 也算条件（清"所有失败日志"是合理诉求），但它不在 compactFilters 的空值判断里
    const hasCondition = Object.keys(effective).length > 0;
    if (!hasCondition) {
      throw new Error('INVALID_PARAM:请至少指定一个筛选条件（时间 / 账号 / 操作 / IP），不支持无条件清空');
    }

    const AuditLog = getModel('AuditLog');
    const { sequelize } = AuditLog;
    const built = scope === 'login' ? buildLoginFilter(filters) : buildOperFilter(filters);

    const deleteSql =
      scope === 'login'
        ? `DELETE l FROM session_logs l ${LOGIN_JOIN_SQL} ${built.whereSql}`
        : `DELETE a FROM audit_logs a LEFT JOIN user_user u ON u.id = a.user_id ${built.whereSql}`;

    return sequelize.transaction(async transaction => {
      /*
       * 🔴 `QueryTypes.BULKDELETE` 直接返回**受影响行数**（number），不是 `[n, meta]`。
       *    按数组解构会得到 `undefined` 再 `Number(undefined)` → NaN，留痕里就会写入
       *    `removed: null`，看着像"删了但没删"。
       */
      const affected = await sequelize.query(deleteSql, {
        type: QueryTypes.BULKDELETE,
        replacements: built.replacements,
        transaction
      });
      const removed = Number(affected || 0);

      // 留痕进 audit_logs：这份记录本身就是"操作日志"里的一条，可被检索
      await AuditLog.create(
        {
          user_id: operator.userId || null,
          event: 'LOG_PURGE',
          app_id: 'console',
          ip: operator.ip || null,
          user_agent: operator.userAgent || null,
          details: {
            scope,
            removed,
            filters: effective,
            stepUpMethod: operator.stepUpMethod || null
          }
        },
        { transaction }
      );

      return removed;
    });
  }
}

/**
 * 统一操作日志行形状（前端只认这一套字段）
 *
 * 🔴 `details.method` **不一定是 HTTP 方法**。审计载荷是各业务自己塞进去的，
 *    字段名会撞车：`STEPUP_CHALLENGE` 的 `method` 是"二次验证方式"（password/email），
 *    直接当 HTTP 方法渲染，列表里就会出现一个写着 `password` 的方法徽标。
 *    只有命中标准动词白名单才认，其余一律置空（详情弹窗里仍能看到原始 `method` 字段）。
 *
 * @param {object} row 数据库原始行
 * @returns {object} 归一化后的日志行
 */
function normalizeOperRow(row) {
  const verb = String(row.method || '').toUpperCase();
  return {
    id: Number(row.id),
    user_id: row.user_id,
    username: row.username || '',
    /*
     * 账号的唯一标识（uid）与邮箱：username 只是显示名，可能重名、也可能在用户被
     * 注销后被改写成「已注销用户#N」—— 只给名字，事后根本对不上是哪个人。
     * uid 是稳定主键之外的业务唯一键，邮箱用于人工核对。
     */
    uid: row.uid || '',
    email: row.email || '',
    module: row.module || '系统',
    action: row.action,
    method: HTTP_METHODS.has(verb) ? verb : '',
    path: row.path || '',
    cost_ms: Number(row.cost_ms || 0),
    ip: row.ip || '',
    device_id: row.device_id || '',
    user_agent: row.user_agent || '',
    /*
     * 🔴 raw 查询的 JSON 列回的是**字符串**，再 JSON.stringify 会套上第二层引号：
     *    前端拿到 `"{\"deptId\":5}"`，JSON.parse 得到的是字符串而不是对象，于是
     *    "载荷逐键展开"永远走不到，只能退化成显示一段被转义的原文（实测如此）。
     *    字符串原样透传，只有模型查询（对象）才需要序列化。
     */
    detail: row.details ? (typeof row.details === 'string' ? row.details : JSON.stringify(row.details)) : '',
    status: Number(row.failed || 0) === 1 ? 0 : 1,
    created_at: row.created_at
  };
}

const logDao = new LogDao();

// 导出收拢在文件末尾（仓规：定义处不写 export）
export { OPER_ONLY_SQL };

export default logDao;
