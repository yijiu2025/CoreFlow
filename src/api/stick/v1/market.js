/**
 * 行情路由
 *
 * GET /stick/v1/market/search — 搜索股票
 * GET /stick/v1/market/:code  — 获取实时行情
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getQuote, searchStock } from '../../../app/stick/dao/market.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'stickMarket',
    alias: '实时行情',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /stick/v1/market/search
   * 搜索股票
   */
  registerSecureRoute(fastify, {
    name: 'searchMarket',
    alias: '搜索股票',
    method: 'GET',
    url: '/market/search',
    requireLogin: true,
    permission: 'stick:market:read',
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
   * GET /stick/v1/market/:code
   * 获取实时行情
   */
  registerSecureRoute(fastify, {
    name: 'getMarketQuote',
    alias: '获取实时行情',
    method: 'GET',
    url: '/market/:code',
    requireLogin: true,
    permission: 'stick:market:read',
    handler: async (request, reply) => {
      const { code } = request.params;
      const { market } = request.query;

      const quote = await getQuote(code, parseInt(market) || 1);
      if (!quote) {
        return reply.result.fail('获取行情失败', null, 500);
      }

      return reply.result.success('获取成功', quote);
    }
  });
}
