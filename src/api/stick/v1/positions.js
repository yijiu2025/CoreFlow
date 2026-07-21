/**
 * 持仓管理路由
 *
 * GET    /stick/v1/positions     — 获取持仓列表
 * POST   /stick/v1/positions     — 添加持仓
 * PUT    /stick/v1/positions/:id — 更新持仓
 * DELETE /stick/v1/positions/:id — 删除持仓
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import PositionDao from '../../../app/stick/dao/position.dao.js';
import StockDao from '../../../app/stick/dao/stock.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'stickPositions',
    alias: '持仓管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /stick/v1/positions
   * 获取持仓列表
   */
  registerSecureRoute(fastify, {
    name: 'getPositions',
    alias: '获取持仓列表',
    method: 'GET',
    url: '/positions',
    requireLogin: true,
    permission: 'stick:position:read',
    handler: async (request, reply) => {
      const user = request.state?.user;
      const userId = user?.userId;
      const { status } = request.query;

      const positions = await PositionDao.findAll({ userId, status });
      return reply.result.success('获取成功', positions);
    }
  });

  /**
   * POST /stick/v1/positions
   * 添加持仓
   */
  registerSecureRoute(fastify, {
    name: 'addPosition',
    alias: '添加持仓',
    method: 'POST',
    url: '/positions',
    requireLogin: true,
    permission: 'stick:position:write',
    handler: async (request, reply) => {
      const user = request.state?.user;
      const userId = user?.userId;
      const { stockCode, price, quantity, tradeDate } = request.body;

      if (!stockCode || !price || !quantity) {
        return reply.result.fail('股票代码、价格和数量不能为空', null, 400);
      }

      // 查找股票
      const stock = await StockDao.findByCode(stockCode);
      if (!stock) {
        return reply.result.fail('股票不存在，请先添加', null, 404);
      }

      // 检查是否已有持仓
      const existing = await PositionDao.findByUserAndStock(userId, stock.id);
      if (existing) {
        return reply.result.fail('该股票已有持仓，请更新', null, 409);
      }

      const totalCost = price * quantity;
      const position = await PositionDao.create({
        userId,
        stockId: stock.id,
        quantity,
        avgCost: price,
        totalCost
      });

      return reply.result.success('添加成功', position);
    }
  });

  /**
   * PUT /stick/v1/positions/:id
   * 更新持仓
   */
  registerSecureRoute(fastify, {
    name: 'updatePosition',
    alias: '更新持仓',
    method: 'PUT',
    url: '/positions/:id',
    requireLogin: true,
    permission: 'stick:position:write',
    handler: async (request, reply) => {
      const { id } = request.params;
      const { quantity, avgCost } = request.body;

      const totalCost = quantity * avgCost;
      const position = await PositionDao.update(id, {
        quantity,
        avg_cost: avgCost,
        total_cost: totalCost
      });

      if (!position) {
        return reply.result.fail('持仓不存在', null, 404);
      }

      return reply.result.success('更新成功', position);
    }
  });

  /**
   * DELETE /stick/v1/positions/:id
   * 删除持仓
   */
  registerSecureRoute(fastify, {
    name: 'deletePosition',
    alias: '删除持仓',
    method: 'DELETE',
    url: '/positions/:id',
    requireLogin: true,
    permission: 'stick:position:delete',
    handler: async (request, reply) => {
      const { id } = request.params;
      const result = await PositionDao.delete(id);

      if (!result) {
        return reply.result.fail('持仓不存在', null, 404);
      }

      return reply.result.success('删除成功');
    }
  });
}
