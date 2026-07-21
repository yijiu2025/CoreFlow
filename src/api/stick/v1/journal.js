/**
 * 交易日志路由
 *
 * GET    /stick/v1/journal     — 获取日志列表
 * POST   /stick/v1/journal     — 添加日志
 * PUT    /stick/v1/journal/:id — 更新日志
 * DELETE /stick/v1/journal/:id — 删除日志
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import JournalDao from '../../../app/stick/dao/journal.dao.js';
import StockDao from '../../../app/stick/dao/stock.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'stickJournal',
    alias: '交易日志',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /stick/v1/journal
   * 获取日志列表
   */
  registerSecureRoute(fastify, {
    name: 'getJournals',
    alias: '获取日志列表',
    method: 'GET',
    url: '/journal',
    requireLogin: true,
    permission: 'stick:journal:read',
    handler: async (request, reply) => {
      const user = request.state?.user;
      const userId = user?.userId;
      const { stockId, limit } = request.query;

      const journals = await JournalDao.findAll({ userId, stockId, limit });
      return reply.result.success('获取成功', journals);
    }
  });

  /**
   * POST /stick/v1/journal
   * 添加日志
   */
  registerSecureRoute(fastify, {
    name: 'addJournal',
    alias: '添加日志',
    method: 'POST',
    url: '/journal',
    requireLogin: true,
    permission: 'stick:journal:write',
    handler: async (request, reply) => {
      const user = request.state?.user;
      const userId = user?.userId;
      const { stockCode, title, content, lesson, mood } = request.body;

      if (!title) {
        return reply.result.fail('标题不能为空', null, 400);
      }

      let stockId = null;
      if (stockCode) {
        const stock = await StockDao.findByCode(stockCode);
        if (!stock) {
          return reply.result.fail('股票不存在', null, 404);
        }
        stockId = stock.id;
      }

      const journal = await JournalDao.create({
        userId,
        stockId,
        title,
        content,
        lesson,
        mood
      });

      return reply.result.success('添加成功', journal);
    }
  });

  /**
   * PUT /stick/v1/journal/:id
   * 更新日志
   */
  registerSecureRoute(fastify, {
    name: 'updateJournal',
    alias: '更新日志',
    method: 'PUT',
    url: '/journal/:id',
    requireLogin: true,
    permission: 'stick:journal:write',
    handler: async (request, reply) => {
      const { id } = request.params;
      const { title, content, lesson, mood } = request.body;

      const journal = await JournalDao.update(id, { title, content, lesson, mood });
      if (!journal) {
        return reply.result.fail('日志不存在', null, 404);
      }

      return reply.result.success('更新成功', journal);
    }
  });

  /**
   * DELETE /stick/v1/journal/:id
   * 删除日志
   */
  registerSecureRoute(fastify, {
    name: 'deleteJournal',
    alias: '删除日志',
    method: 'DELETE',
    url: '/journal/:id',
    requireLogin: true,
    permission: 'stick:journal:delete',
    handler: async (request, reply) => {
      const { id } = request.params;
      const result = await JournalDao.delete(id);

      if (!result) {
        return reply.result.fail('日志不存在', null, 404);
      }

      return reply.result.success('删除成功');
    }
  });
}
