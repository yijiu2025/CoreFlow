/**
 * 日志审计接口（操作日志 / 登录日志）
 *
 * 操作日志（数据源 audit_logs）
 *   GET    /admin/console/v1/oper-logs
 *   GET    /admin/console/v1/oper-logs/stats?range=24h|7d|30d
 *   GET    /admin/console/v1/oper-logs/timeline?date=YYYY-MM-DD
 *   GET    /admin/console/v1/oper-logs/export
 *   DELETE /admin/console/v1/oper-logs/:id
 *   DELETE /admin/console/v1/oper-logs
 *
 * 登录日志（数据源 session_logs）
 *   GET    /admin/console/v1/login-logs
 *   GET    /admin/console/v1/login-logs/stats?range=
 *   GET    /admin/console/v1/login-logs/heatmap?days=7|30
 *   GET    /admin/console/v1/login-logs/export
 *   DELETE /admin/console/v1/login-logs/:id
 *   DELETE /admin/console/v1/login-logs
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import logDao from '../../../../app/console/dao/log.dao.js';
import { withFail } from '../../../../app/console/utils/respond.js';

/** 日志查询参数 schema */
const listQuerySchema = {
  type: 'object',
  properties: {
    pageNum: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
    keyword: { type: 'string', maxLength: 100 },
    status: { type: 'integer', enum: [0, 1] },
    event: { type: 'string', maxLength: 50 },
    startTime: { type: 'string', maxLength: 32 },
    endTime: { type: 'string', maxLength: 32 }
  }
};

/** 时间档 schema */
const rangeQuerySchema = {
  type: 'object',
  properties: { range: { type: 'string', enum: ['24h', '7d', '30d'], default: '24h' } }
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
      const { pageNum = 1, pageSize = 20, keyword = '', status = null, startTime = '', endTime = '' } = request.query;
      const { rows, total } = await logDao.operPage({ pageNum, pageSize, keyword, status, startTime, endTime });
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
    name: 'consoleOperLogExport',
    alias: '导出操作日志',
    method: 'GET',
    url: '/oper-logs/export',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.READ,
    schema: { querystring: listQuerySchema },
    handler: withFail(async (request, reply) => {
      const { keyword = '', status = null, startTime = '', endTime = '' } = request.query;
      const { rows } = await logDao.operPage({ pageNum: 1, pageSize: 5000, keyword, status, startTime, endTime });
      const header = ['ID', '时间', '账号', '模块', '动作', '方法', '路径', '结果', '耗时(ms)', 'IP'];
      const lines = rows.map(r =>
        [
          r.id,
          r.created_at,
          r.username,
          r.module,
          r.action,
          r.method,
          r.path,
          r.status === 1 ? '成功' : '失败',
          r.cost_ms,
          r.ip
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
      const ok = await logDao.removeOper(request.params.id);
      if (!ok) throw new Error('NOT_FOUND:日志不存在');
      return reply.result.success('删除成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleOperLogClear',
    alias: '清空操作日志',
    method: 'DELETE',
    url: '/oper-logs',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.REMOVE,
    handler: withFail(async (request, reply) => {
      const count = await logDao.clearOper();
      return reply.result.success('已清空', { count });
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
      const { pageNum = 1, pageSize = 20, keyword = '', event = '', startTime = '', endTime = '' } = request.query;
      const { rows, total } = await logDao.loginPage({ pageNum, pageSize, keyword, event, startTime, endTime });
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
        properties: { days: { type: 'integer', enum: [7, 30], default: 7 } }
      }
    },
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await logDao.loginHeatmap(request.query.days || 7));
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
      const { keyword = '', event = '', startTime = '', endTime = '' } = request.query;
      const { rows } = await logDao.loginPage({ pageNum: 1, pageSize: 5000, keyword, event, startTime, endTime });
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
      const ok = await logDao.removeLogin(request.params.id);
      if (!ok) throw new Error('NOT_FOUND:日志不存在');
      return reply.result.success('删除成功', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLoginLogClear',
    alias: '清空登录日志',
    method: 'DELETE',
    url: '/login-logs',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.LOG.REMOVE,
    handler: withFail(async (request, reply) => {
      const count = await logDao.clearLogin();
      return reply.result.success('已清空', { count });
    })
  });
}

export default registerLogRoutes;
