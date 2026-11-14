/**
 * 日志审计接口（操作日志 / 登录日志）
 *
 * 操作日志（数据源 audit_logs）
 *   GET    /admin/console/v1/oper-logs
 *   GET    /admin/console/v1/oper-logs/stats?range=24h|7d|30d
 *   GET    /admin/console/v1/oper-logs/timeline?date=YYYY-MM-DD
 *   GET    /admin/console/v1/oper-logs/heatmap?days=7|30
 *   GET    /admin/console/v1/oper-logs/export
 *   DELETE /admin/console/v1/oper-logs/:id
 *   POST   /admin/console/v1/oper-logs/purge/challenge    —— 按条件清除（发二次验证码）
 *   POST   /admin/console/v1/oper-logs/purge              —— 按条件清除（执行 + 留痕）
 *
 * 登录日志（数据源 session_logs）
 *   GET    /admin/console/v1/login-logs
 *   GET    /admin/console/v1/login-logs/stats?range=
 *   GET    /admin/console/v1/login-logs/heatmap?days=7|30
 *   GET    /admin/console/v1/login-logs/export
 *   DELETE /admin/console/v1/login-logs/:id
 *   POST   /admin/console/v1/login-logs/purge/challenge   —— 按条件清除（发二次验证码）
 *   POST   /admin/console/v1/login-logs/purge             —— 按条件清除（执行 + 留痕）
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import crypto from 'node:crypto';
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import logDao from '../../../../app/console/dao/log.dao.js';
import stepUpService from '../../../../app/console/services/stepup.service.js';
import { withFail } from '../../../../app/console/utils/respond.js';
import { resolveDataScope, logScopeSql } from '../../../../app/console/services/data-scope.service.js';

/** 日志查询参数 schema */
const listQuerySchema = {
  type: 'object',
  properties: {
    pageNum: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
    keyword: { type: 'string', maxLength: 100 },
    status: { type: 'integer', enum: [0, 1] },
    // 以下是**独立维度**：keyword 是 OR 模糊，做"按 IP / 按账号"会误伤别处的同类文本
    username: { type: 'string', maxLength: 64 },
    ip: { type: 'string', maxLength: 50 },
    event: { type: 'string', maxLength: 50 },
    action: { type: 'string', maxLength: 50 },
    startTime: { type: 'string', maxLength: 32 },
    endTime: { type: 'string', maxLength: 32 }
  }
};

/** 清除操作允许的筛选键（白名单：前端传别的键一律忽略，不进 where 也不进留痕） */
const FILTER_KEYS = ['keyword', 'status', 'startTime', 'endTime', 'username', 'ip', 'event', 'action'];

/**
 * 从请求体里取筛选条件
 *
 * 只认白名单键：否则前端塞一个任意键进来，会同时污染 where 构造与审计留痕
 * （留痕里出现一个从未生效的条件，事后没人判断得出真实范围）。
 *
 * @param {object} body 原始筛选对象
 * @returns {object} 白名单内的非空条件
 */
function pickFilters(body) {
  const source = body && typeof body === 'object' ? body : {};
  const out = {};
  for (const key of FILTER_KEYS) {
    const value = source[key];
    if (value === null || value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
}

/**
 * 条件指纹（绑定二次验证的范围）
 *
 * 把条件按键名排序后哈希：`{ip,username}` 与 `{username,ip}` 必须得到同一个指纹，
 * 否则前端换了字段顺序就被判成"不是同一范围"。
 *
 * 🔴 这个指纹**由服务端从条件派生**，不接受前端传入 —— 否则前端可以拿"清 1 条"的
 *    验证去删 10000 条。
 *
 * @param {'oper'|'login'} scope 日志类型
 * @param {object} filters 条件
 * @returns {string} 指纹
 */
function filterFingerprint(scope, filters) {
  const ordered = {};
  for (const key of Object.keys(filters).sort()) {
    // 统一成字符串：`status: 0` 与 `status: "0"` 必须算同一个范围
    ordered[key] = String(filters[key]);
  }
  return crypto
    .createHash('sha256')
    .update(`${scope}:${JSON.stringify(ordered)}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * 断言至少有一个条件
 *
 * 宁可让用户给一个很早的起始时间，也不提供"无条件清空"：审计被清空之后，
 * 连"谁清的"都无从追查（清登录日志时更是把唯一的线索一起删了）。
 *
 * @param {object} filters 条件
 * @throws {Error} 无条件时抛 INVALID_PARAM
 */
function assertHasFilter(filters) {
  if (!Object.keys(filters).length) {
    throw new Error('INVALID_PARAM:请至少指定一个筛选条件（时间 / 账号 / 操作 / IP），不支持无条件清空');
  }
}

/** 清除请求体 schema */
const purgeChallengeSchema = {
  type: 'object',
  required: ['filters'],
  properties: {
    filters: { type: 'object', properties: listQuerySchema.properties, additionalProperties: false },
    method: { type: 'string', enum: ['email', 'password'] }
  }
};

const purgeSchema = {
  type: 'object',
  required: ['filters', 'stepUp'],
  properties: {
    filters: { type: 'object', properties: listQuerySchema.properties, additionalProperties: false },
    stepUp: {
      type: 'object',
      required: ['challengeId'],
      properties: {
        challengeId: { type: 'string', minLength: 1, maxLength: 64 },
        code: { type: 'string', maxLength: 12 },
        password: { type: 'string', maxLength: 128 }
      }
    }
  }
};

/**
 * 取操作者
 *
 * @param {import('fastify').FastifyRequest} request 请求
 * @returns {{id: number|null, username: string}} 操作者
 */
function actorOf(request) {
  const user = request.state?.user;
  return { id: user?.userId ? Number(user.userId) : null, username: user?.username || '未知' };
}

/** 时间档 schema */
const rangeQuerySchema = {
  type: 'object',
  properties: { range: { type: 'string', enum: ['24h', '7d', '30d', '1y'], default: '24h' } }
};

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

async function registerLogRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleLog',
    alias: '管理后台日志',
    description: '操作日志与登录日志查询、统计、导出、清理',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleOperLogList',
    alias: '操作日志列表',
    method: 'GET',
    url: '/oper-logs',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: { querystring: listQuerySchema },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 20, ...filters } = request.query;
      // 行级数据范围：日志只有 user_id，部门档走 user_user 子查询
      const scopeSql = logScopeSql(await resolveDataScope(request.state.user?.userId), request.state.user?.userId, 'a');
      const { rows, total } = await logDao.operPage({ pageNum, pageSize, ...pickFilters(filters), scopeSql });
      return reply.result.success('获取成功', { rows, total, pageNum, pageSize });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleOperLogStats',
    alias: '操作日志统计',
    method: 'GET',
    url: '/oper-logs/stats',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: { querystring: rangeQuerySchema },
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await logDao.operStats(request.query.range || '24h'));
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleOperLogTimeline',
    alias: '操作日志泳道',
    method: 'GET',
    url: '/oper-logs/timeline',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: {
      querystring: { type: 'object', properties: { date: { type: 'string', maxLength: 10 } } }
    },
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await logDao.operTimeline(request.query.date || ''));
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleOperLogHeatmap',
    alias: '操作热力',
    method: 'GET',
    url: '/oper-logs/heatmap',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', enum: [7, 30], default: 7 },
          /** 向过去翻几页（0 = 最近一个窗口），热力图上的「上一周 / 上一月」 */
          offset: { type: 'integer', minimum: 0, maximum: 520, default: 0 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      return reply.result.success(
        '获取成功',
        await logDao.operHeatmap(request.query.days || 7, request.query.offset || 0)
      );
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleOperCalendar',
    alias: '操作日历',
    method: 'GET',
    url: '/oper-logs/calendar',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 400, default: 365 },
          offset: { type: 'integer', minimum: 0, maximum: 20, default: 0 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      return reply.result.success(
        '获取成功',
        await logDao.operCalendar(request.query.days || 365, request.query.offset || 0)
      );
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleOperLogExport',
    alias: '导出操作日志',
    method: 'GET',
    url: '/oper-logs/export',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: { querystring: listQuerySchema },
    handler: withFail(async (request, reply) => {
      const { pageNum, pageSize, ...filters } = request.query;
      const scopeSql = logScopeSql(await resolveDataScope(request.state.user?.userId), request.state.user?.userId, 'a');
      const { rows } = await logDao.operPage({ pageNum: 1, pageSize: 5000, ...pickFilters(filters), scopeSql });
      const header = ['ID', '时间', '账号', '邮箱', '模块', '动作', '方法', '路径', '结果', '耗时(ms)', 'IP', '设备'];
      const lines = rows.map(r =>
        [
          r.id,
          r.created_at,
          r.username,
          r.email,
          r.module,
          r.action,
          r.method,
          r.path,
          r.status === 1 ? '成功' : '失败',
          r.cost_ms,
          r.ip,
          r.device_id
        ]
          .map(csvCell)
          .join(',')
      );
      const csv = `\uFEFF${header.join(',')}\n${lines.join('\n')}`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="oper-logs.csv"')
        .send(csv);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleOperLogRemove',
    alias: '删除操作日志',
    method: 'DELETE',
    url: '/oper-logs/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.REMOVE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const actor = actorOf(request);
      const ok = await logDao.removeOper(request.params.id, {
        userId: actor.id,
        ip: request.ip,
        userAgent: request.headers?.['user-agent'] || ''
      });
      if (!ok) throw new Error('NOT_FOUND:日志不存在');
      return reply.result.success('删除成功', null);
    })
  });

  /* ── 按条件清除（两步） ─────────────────────────────────────────
   *
   * 1. `POST /purge/challenge`：提交条件 → 算命中条数 → 签发一次性凭据
   * 2. `POST /purge`：同一份条件 + 凭据 → 校验一致 → 删除并留痕
   *
   * 🔴 凭据必须绑到**条件指纹**上（服务端从条件派生，不接受前端传入）。
   *    只认 challengeId 的话，拿"清 1 条"的验证就能删一万条 —— 二次验证形同虚设。
   *
   * 原来的 `DELETE /oper-logs`（无条件清空）已移除：它既没有二次验证也不留痕，
   * 留着就是一条绕过全部限制的旁路。要清空请给一个很早的起始时间，
   * 那至少是被留痕记录下来的一次**有范围**的操作。
   */
  registerSecureRoute(fastify, {
    name: 'consoleOperLogPurgeChallenge',
    alias: '清除操作日志-二次验证',
    method: 'POST',
    url: '/oper-logs/purge/challenge',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.REMOVE,
    // 这里会真的发邮件：不限频等于把后台当邮件轰炸器
    config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
    schema: { body: purgeChallengeSchema },
    handler: withFail(async (request, reply) => {
      const filters = pickFilters(request.body.filters);
      assertHasFilter(filters);
      const actor = actorOf(request);
      // 先给命中条数：操作者必须看到"将删除 N 条"再决定要不要验证
      const matched = await logDao.countByFilter('oper', filters);
      const challenge = await stepUpService.createChallenge({
        userId: actor.id,
        request,
        action: 'log.purge',
        targetId: null,
        targetKey: filterFingerprint('oper', filters),
        method: request.body.method
      });
      const message =
        challenge.method === 'email' ? `验证码已发送至 ${challenge.maskedTarget}` : '请输入你的登录密码完成验证';
      return reply.result.success(message, { ...challenge, matched });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleOperLogPurge',
    alias: '清除操作日志',
    method: 'POST',
    url: '/oper-logs/purge',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.REMOVE,
    schema: { body: purgeSchema },
    handler: withFail(async (request, reply) => {
      const filters = pickFilters(request.body.filters);
      assertHasFilter(filters);
      const actor = actorOf(request);
      const { method } = await stepUpService.consumeChallenge({
        userId: actor.id,
        request,
        action: 'log.purge',
        targetId: null,
        // 与签发时同一份条件 → 同一个指纹；条件被改过就通不过
        targetKey: filterFingerprint('oper', filters),
        challengeId: request.body.stepUp.challengeId,
        code: request.body.stepUp.code,
        password: request.body.stepUp.password
      });
      const removed = await logDao.purgeOper(filters, {
        userId: actor.id,
        ip: request.ip,
        userAgent: request.headers?.['user-agent'] || '',
        stepUpMethod: method
      });
      return reply.result.success(`已清除 ${removed} 条操作日志`, { removed });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLoginLogList',
    alias: '登录日志列表',
    method: 'GET',
    url: '/login-logs',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: { querystring: listQuerySchema },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 20, ...filters } = request.query;
      const scopeSql = logScopeSql(await resolveDataScope(request.state.user?.userId), request.state.user?.userId, 'l');
      const { rows, total } = await logDao.loginPage({ pageNum, pageSize, ...pickFilters(filters), scopeSql });
      return reply.result.success('获取成功', { rows, total, pageNum, pageSize });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLoginLogStats',
    alias: '登录日志统计',
    method: 'GET',
    url: '/login-logs/stats',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: { querystring: rangeQuerySchema },
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await logDao.loginStats(request.query.range || '24h'));
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLoginLogHeatmap',
    alias: '登录热力',
    method: 'GET',
    url: '/login-logs/heatmap',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', enum: [7, 30], default: 7 },
          offset: { type: 'integer', minimum: 0, maximum: 520, default: 0 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      return reply.result.success(
        '获取成功',
        await logDao.loginHeatmap(request.query.days || 7, request.query.offset || 0)
      );
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLoginCalendar',
    alias: '登录日历',
    method: 'GET',
    url: '/login-logs/calendar',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 400, default: 365 },
          offset: { type: 'integer', minimum: 0, maximum: 20, default: 0 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      return reply.result.success(
        '获取成功',
        await logDao.loginCalendar(request.query.days || 365, request.query.offset || 0)
      );
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLoginLogExport',
    alias: '导出登录日志',
    method: 'GET',
    url: '/login-logs/export',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: { querystring: listQuerySchema },
    handler: withFail(async (request, reply) => {
      const { pageNum, pageSize, ...filters } = request.query;
      const scopeSql = logScopeSql(await resolveDataScope(request.state.user?.userId), request.state.user?.userId, 'l');
      const { rows } = await logDao.loginPage({ pageNum: 1, pageSize: 5000, ...pickFilters(filters), scopeSql });
      const header = ['ID', '时间', '账号', '事件', '应用', 'IP', '归属地', '结果'];
      const lines = rows.map(r =>
        [r.id, r.created_at, r.username, r.event, r.app_id, r.ip, r.location, r.status === 1 ? '成功' : '失败']
          .map(csvCell)
          .join(',')
      );
      const csv = `\uFEFF${header.join(',')}\n${lines.join('\n')}`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="login-logs.csv"')
        .send(csv);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLoginLogRemove',
    alias: '删除登录日志',
    method: 'DELETE',
    url: '/login-logs/:id',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.REMOVE,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } }
    },
    handler: withFail(async (request, reply) => {
      const actor = actorOf(request);
      const ok = await logDao.removeLogin(request.params.id, {
        userId: actor.id,
        ip: request.ip,
        userAgent: request.headers?.['user-agent'] || ''
      });
      if (!ok) throw new Error('NOT_FOUND:日志不存在');
      return reply.result.success('删除成功', null);
    })
  });

  // 登录日志同一套两步流程，理由见上面操作日志那段
  registerSecureRoute(fastify, {
    name: 'consoleLoginLogPurgeChallenge',
    alias: '清除登录日志-二次验证',
    method: 'POST',
    url: '/login-logs/purge/challenge',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.REMOVE,
    config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
    schema: { body: purgeChallengeSchema },
    handler: withFail(async (request, reply) => {
      const filters = pickFilters(request.body.filters);
      assertHasFilter(filters);
      const actor = actorOf(request);
      const matched = await logDao.countByFilter('login', filters);
      const challenge = await stepUpService.createChallenge({
        userId: actor.id,
        request,
        action: 'log.purge',
        targetId: null,
        targetKey: filterFingerprint('login', filters),
        method: request.body.method
      });
      const message =
        challenge.method === 'email' ? `验证码已发送至 ${challenge.maskedTarget}` : '请输入你的登录密码完成验证';
      return reply.result.success(message, { ...challenge, matched });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLoginLogPurge',
    alias: '清除登录日志',
    method: 'POST',
    url: '/login-logs/purge',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.REMOVE,
    schema: { body: purgeSchema },
    handler: withFail(async (request, reply) => {
      const filters = pickFilters(request.body.filters);
      assertHasFilter(filters);
      const actor = actorOf(request);
      const { method } = await stepUpService.consumeChallenge({
        userId: actor.id,
        request,
        action: 'log.purge',
        targetId: null,
        targetKey: filterFingerprint('login', filters),
        challengeId: request.body.stepUp.challengeId,
        code: request.body.stepUp.code,
        password: request.body.stepUp.password
      });
      const removed = await logDao.purgeLogin(filters, {
        userId: actor.id,
        ip: request.ip,
        userAgent: request.headers?.['user-agent'] || '',
        stepUpMethod: method
      });
      return reply.result.success(`已清除 ${removed} 条登录日志`, { removed });
    })
  });
}

export default registerLogRoutes;
