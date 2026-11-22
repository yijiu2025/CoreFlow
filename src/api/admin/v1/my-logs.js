/**
 * 我的操作日志（自助）
 *
 * GET /admin/v1/my-logs —— 只返回**当前登录用户自己**产生的操作记录
 *
 * 与管理端的 `GET /admin/v1/oper-logs` 是两个接口，不是同一个接口换权限：
 *   · 管理端那条要 `admin:log:read`，还要叠数据范围（行级 scope），因为它能看全站；
 *   · 这条**只认会话里的 userId**，没有任何可以放大的参数 —— 请求里就算带了
 *     `userId` / `username`，也直接忽略（白名单取参，不 spread）。
 *
 * 为什么不复用管理端那条 + 补一个 `self=1`：那会让"能不能看别人"变成请求参数说了算，
 * 一旦哪天 scope 计算有缺口，自助页就成了越权入口。这里把用户范围写死在 SQL 片段里。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import logDao from '../../../app/admin/console/dao/log.dao.js';
import { withFail } from '../../../app/admin/console/utils/respond.js';

async function registerMyLogRoutes(fastify) {
  registerGroupMetadata({
    name: 'adminMyLogs',
    alias: '我的操作日志',
    description: '本人操作记录查询（自助，无需授权）',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'adminMyLogs',
    alias: '我的操作日志',
    method: 'GET',
    url: '/my-logs',
    requireLogin: true,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          pageNum: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          keyword: { type: 'string', maxLength: 64 },
          startTime: { type: 'string', maxLength: 32 },
          endTime: { type: 'string', maxLength: 32 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const user = request.state.user || {};
      const userId = Number(user.userId);
      /*
       * 没有数字主键的凭证（M2M 的 client_token）没有"自己的日志"这回事 ——
       * 直接拒绝，而不是退化成"查全站"。两者差一个越权。
       */
      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.result.forbidden('当前凭证没有用户身份，无法查看操作日志');
      }

      // 逐项取参（白名单）：客户端额外传 userId / username 一律不生效
      const pageNum = request.query.pageNum || 1;
      const pageSize = request.query.pageSize || 20;
      const keyword = request.query.keyword || '';
      const startTime = request.query.startTime || '';
      const endTime = request.query.endTime || '';

      const { rows, total } = await logDao.operPage({
        pageNum,
        pageSize,
        keyword,
        startTime,
        endTime,
        /*
         * 用户范围钉死在 SQL 里。`userId` 是上面校验过的整数（`Number.isInteger`），
         * 不是外部字符串 —— 这里的拼接是安全的；换成把用户输入塞进来就是注入。
         */
        scopeSql: `AND a.user_id = ${userId}`
      });

      return reply.result.success('获取成功', { rows, total, pageNum, pageSize });
    })
  });
}

export default registerMyLogRoutes;
