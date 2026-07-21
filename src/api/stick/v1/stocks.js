/**
 * 股票管理路由
 *
 * GET    /stick/v1/stocks          — 搜索股票（东方财富 API）
 * GET    /stick/v1/stocks/:code    — 获取股票详情（含实时行情）
 * POST   /stick/v1/stocks/watch    — 添加自选
 * DELETE /stick/v1/stocks/watch/:code — 删除自选
 * GET    /stick/v1/stocks/watch    — 获取自选列表（含实时行情）
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { searchStock, getQuote, getEastMoneyQuote } from '../../../app/stick/dao/market.service.js';
import StockDao from '../../../app/stick/dao/stock.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'stickStocks',
    alias: '股票管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /stick/v1/stocks
   * 搜索股票（从东方财富 API 搜索，不从本地数据库）
   */
  registerSecureRoute(fastify, {
    name: 'searchStocks',
    alias: '搜索股票',
    method: 'GET',
    url: '/stocks',
    requireLogin: true,
    permission: 'stick:stock:read',
    handler: async (request, reply) => {
      const { keyword } = request.query;

      if (!keyword) {
        return reply.result.fail('关键词不能为空', null, 400);
      }

      const results = await searchStock(keyword);
      return reply.result.success('搜索成功', results);
    }
  });

  /**
   * GET /stick/v1/stocks/:code
   * 获取股票详情（含实时行情）
   */
  registerSecureRoute(fastify, {
    name: 'getStockDetail',
    alias: '获取股票详情',
    method: 'GET',
    url: '/stocks/:code',
    requireLogin: true,
    permission: 'stick:stock:read',
    handler: async (request, reply) => {
      const { code } = request.params;
      const { market } = request.query;

      const quote = await getQuote(code, parseInt(market) || 1);
      if (!quote) {
        return reply.result.fail('未找到该股票', null, 404);
      }

      return reply.result.success('获取成功', quote);
    }
  });

  /**
   * POST /stick/v1/stocks/watch
   * 添加自选
   */
  registerSecureRoute(fastify, {
    name: 'addWatch',
    alias: '添加自选',
    method: 'POST',
    url: '/stocks/watch',
    requireLogin: true,
    permission: 'stick:stock:write',
    handler: async (request, reply) => {
      const { code, name, market } = request.body;

      if (!code || !name) {
        return reply.result.fail('股票代码和名称不能为空', null, 400);
      }

      // 检查是否已添加
      const existing = await StockDao.findByCode(code);
      if (existing) {
        return reply.result.fail('该股票已在自选中', null, 409);
      }

      const stock = await StockDao.create({ code, name, market });
      return reply.result.success('添加成功', stock);
    }
  });

  /**
   * DELETE /stick/v1/stocks/watch/:code
   * 删除自选
   */
  registerSecureRoute(fastify, {
    name: 'removeWatch',
    alias: '删除自选',
    method: 'DELETE',
    url: '/stocks/watch/:code',
    requireLogin: true,
    permission: 'stick:stock:delete',
    handler: async (request, reply) => {
      const { code } = request.params;
      const result = await StockDao.deleteByCode(code);

      if (!result) {
        return reply.result.fail('该股票不在自选中', null, 404);
      }

      return reply.result.success('删除成功');
    }
  });

  /**
   * GET /stick/v1/stocks/watch
   * 获取自选列表（含实时行情）
   */
  registerSecureRoute(fastify, {
    name: 'getWatchlist',
    alias: '获取自选列表',
    method: 'GET',
    url: '/stocks/watch',
    requireLogin: true,
    permission: 'stick:stock:read',
    handler: async (request, reply) => {
      const list = await StockDao.findAll({ page: 1, pageSize: 200 });

      // 并发获取所有自选股的实时行情
      const withQuotes = await Promise.all(
        list.list.map(async (stock) => {
          const quote = await getEastMoneyQuote(stock.code, stock.market);
          return {
            ...stock.toJSON(),
            quote
          };
        })
      );

      return reply.result.success('获取成功', withQuotes);
    }
  });
}