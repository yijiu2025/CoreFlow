/**
 * 仪表盘路由
 *
 * GET /stick/v1/dashboard — 获取仪表盘数据
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import PositionDao from '../../../app/stick/dao/position.dao.js';
import TradeDao from '../../../app/stick/dao/trade.dao.js';
import { getQuote } from '../../../app/stick/dao/market.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'stickDashboard',
    alias: '仪表盘',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /stick/v1/dashboard
   * 获取仪表盘数据
   */
  registerSecureRoute(fastify, {
    name: 'getDashboard',
    alias: '获取仪表盘数据',
    method: 'GET',
    url: '/dashboard',
    requireLogin: true,
    permission: 'stick:dashboard:read',
    handler: async (request, reply) => {
      const user = request.state?.user;
      const userId = user?.userId;

      // 获取持仓统计
      const positionStats = await PositionDao.getStats(userId);

      // 获取交易统计
      const tradeStats = await TradeDao.getStats(userId);

      // 获取持仓列表（带实时价格）
      const positions = await PositionDao.findAll({ userId, status: 1 });

      let totalMarketValue = 0;
      let totalProfit = 0;
      const positionsWithPrice = [];

      for (const pos of positions) {
        const stock = pos.stock;
        let currentPrice = parseFloat(pos.avg_cost);

        // 尝试获取实时价格
        try {
          const quote = await getQuote(stock.code, stock.market);
          if (quote) {
            currentPrice = quote.currentPrice;
          }
        } catch (e) {
          // 使用成本价作为 fallback
        }

        const marketValue = currentPrice * pos.quantity;
        const profit = marketValue - parseFloat(pos.total_cost);
        const profitRate = (profit / parseFloat(pos.total_cost) * 100).toFixed(2);

        totalMarketValue += marketValue;
        totalProfit += profit;

        positionsWithPrice.push({
          ...pos.toJSON(),
          currentPrice,
          marketValue,
          profit,
          profitRate: parseFloat(profitRate)
        });
      }

      const totalCost = parseFloat(positionStats.totalCost);
      const totalProfitRate = totalCost > 0 ? (totalProfit / totalCost * 100).toFixed(2) : 0;

      return reply.result.success('获取成功', {
        totalAsset: totalMarketValue,
        totalCost,
        totalProfit,
        totalProfitRate: parseFloat(totalProfitRate),
        todayProfit: 0, // 需要昨日数据对比
        positionCount: positionStats.positionCount,
        monthTradeCount: tradeStats.monthTradeCount,
        positions: positionsWithPrice
      });
    }
  });
}
