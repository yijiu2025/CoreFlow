/**
 * 交易记录路由
 *
 * GET  /stick/v1/trades — 获取交易记录
 * POST /stick/v1/trades — 记录交易
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import TradeDao from '../../../app/stick/dao/trade.dao.js';
import PositionDao from '../../../app/stick/dao/position.dao.js';
import StockDao from '../../../app/stick/dao/stock.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'stickTrades',
    alias: '交易记录',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /stick/v1/trades
   * 获取交易记录
   */
  registerSecureRoute(fastify, {
    name: 'getTrades',
    alias: '获取交易记录',
    method: 'GET',
    url: '/trades',
    requireLogin: true,
    permission: 'stick:trade:read',
    handler: async (request, reply) => {
      const user = request.state?.user;
      const userId = user?.userId;
      const { type, startDate, endDate, limit } = request.query;

      const trades = await TradeDao.findAll({ userId, type, startDate, endDate, limit });
      return reply.result.success('获取成功', trades);
    }
  });

  /**
   * POST /stick/v1/trades
   * 记录交易
   */
  registerSecureRoute(fastify, {
    name: 'addTrade',
    alias: '记录交易',
    method: 'POST',
    url: '/trades',
    requireLogin: true,
    permission: 'stick:trade:write',
    handler: async (request, reply) => {
      const user = request.state?.user;
      const userId = user?.userId;
      const { stockCode, type, price, quantity, fee, tradeDate, note } = request.body;

      if (!stockCode || !type || !price || !quantity || !tradeDate) {
        return reply.result.fail('股票代码、类型、价格、数量和日期不能为空', null, 400);
      }

      // 查找股票
      const stock = await StockDao.findByCode(stockCode);
      if (!stock) {
        return reply.result.fail('股票不存在', null, 404);
      }

      // 查找或创建持仓
      let position = await PositionDao.findByUserAndStock(userId, stock.id);

      if (type === 1) {
        // 买入：创建或更新持仓
        if (position) {
          const newQuantity = position.quantity + quantity;
          const newTotalCost = parseFloat(position.total_cost) + (price * quantity);
          const newAvgCost = newTotalCost / newQuantity;
          await PositionDao.update(position.id, {
            quantity: newQuantity,
            avg_cost: newAvgCost,
            total_cost: newTotalCost
          });
        } else {
          position = await PositionDao.create({
            userId,
            stockId: stock.id,
            quantity,
            avgCost: price,
            totalCost: price * quantity
          });
        }
      } else if (type === 2) {
        // 卖出：更新持仓
        if (!position || position.quantity < quantity) {
          return reply.result.fail('持仓不足', null, 400);
        }

        const newQuantity = position.quantity - quantity;
        if (newQuantity === 0) {
          await PositionDao.update(position.id, { quantity: 0, status: 0 });
        } else {
          await PositionDao.update(position.id, { quantity: newQuantity });
        }
      }

      // 创建交易记录
      const trade = await TradeDao.create({
        userId,
        stockId: stock.id,
        positionId: position?.id,
        type,
        price,
        quantity,
        fee,
        tradeDate,
        note
      });

      return reply.result.success('记录成功', trade);
    }
  });
}
