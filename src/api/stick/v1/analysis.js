/**
 * AI 分析路由
 *
 * GET  /stick/v1/analysis/:stockCode — 获取分析结果
 * POST /stick/v1/analysis/:stockCode — 触发 AI 分析
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import AnalysisDao from '../../../app/stick/dao/analysis.dao.js';
import StockDao from '../../../app/stick/dao/stock.dao.js';
import { getQuote } from '../../../app/stick/dao/market.service.js';

/**
 * 计算技术指标
 * @param {number[]} prices - 价格数组
 * @returns {object} 技术指标
 */
function calculateIndicators(prices) {
  if (!prices || prices.length < 20) {
    return { ma5: 0, ma10: 0, ma20: 0, macd: 0, rsi: 50 };
  }

  // MA 计算
  const ma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma10 = prices.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const ma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;

  // MACD 简化计算
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;

  // RSI 计算
  const rsi = calculateRSI(prices, 14);

  return { ma5, ma10, ma20, macd, rsi };
}

/**
 * 计算 EMA
 * @param {number[]} prices - 价格数组
 * @param {number} period - 周期
 * @returns {number} EMA 值
 */
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * 计算 RSI
 * @param {number[]} prices - 价格数组
 * @param {number} period - 周期
 * @returns {number} RSI 值
 */
function calculateRSI(prices, period) {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

/**
 * 生成 AI 建议
 * @param {object} indicators - 技术指标
 * @param {object} position - 持仓信息
 * @returns {object} 建议
 */
function generateSuggestion(indicators, position) {
  let score = 0;
  const reasons = [];

  // MA 趋势 (30%)
  if (indicators.ma5 > indicators.ma10 && indicators.ma10 > indicators.ma20) {
    score += 0.3;
    reasons.push('多头排列，趋势向上');
  } else if (indicators.ma5 < indicators.ma10 && indicators.ma10 < indicators.ma20) {
    score -= 0.3;
    reasons.push('空头排列，趋势向下');
  }

  // MACD 信号 (25%)
  if (indicators.macd > 0) {
    score += 0.25;
    reasons.push('MACD 为正，动能向上');
  } else {
    score -= 0.25;
    reasons.push('MACD 为负，动能向下');
  }

  // RSI 状态 (25%)
  if (indicators.rsi > 70) {
    score -= 0.125;
    reasons.push('RSI 超买，注意回调风险');
  } else if (indicators.rsi < 30) {
    score += 0.125;
    reasons.push('RSI 超卖，可能反弹');
  }

  // 持仓盈亏 (20%)
  if (position) {
    const profitRate = (position.currentPrice - position.avgCost) / position.avgCost;
    if (profitRate > 0.2) {
      score -= 0.1;
      reasons.push('盈利超过20%，考虑止盈');
    } else if (profitRate < -0.1) {
      score -= 0.15;
      reasons.push('亏损超过10%，考虑止损');
    }
  }

  // 生成建议
  let suggestion, reason;
  if (score > 0.3) {
    suggestion = 1;
    reason = `强烈建议买入：${reasons.join('；')}`;
  } else if (score > 0.1) {
    suggestion = 2;
    reason = `建议买入：${reasons.join('；')}`;
  } else if (score > -0.1) {
    suggestion = 3;
    reason = `建议持有：${reasons.join('；')}`;
  } else if (score > -0.3) {
    suggestion = 4;
    reason = `建议卖出：${reasons.join('；')}`;
  } else {
    suggestion = 5;
    reason = `强烈建议卖出：${reasons.join('；')}`;
  }

  return { suggestion, reason, confidence: Math.min(Math.abs(score), 1) };
}

export default async function (fastify) {
  registerGroupMetadata({
    name: 'stickAnalysis',
    alias: 'AI 分析',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /stick/v1/analysis/:stockCode
   * 获取分析结果
   */
  registerSecureRoute(fastify, {
    name: 'getAnalysis',
    alias: '获取分析结果',
    method: 'GET',
    url: '/analysis/:stockCode',
    requireLogin: true,
    permission: 'stick:analysis:read',
    handler: async (request, reply) => {
      const { stockCode } = request.params;

      const stock = await StockDao.findByCode(stockCode);
      if (!stock) {
        return reply.result.fail('股票不存在', null, 404);
      }

      const analysis = await AnalysisDao.findLatestByStock(stock.id);
      return reply.result.success('获取成功', analysis);
    }
  });

  /**
   * POST /stick/v1/analysis/:stockCode
   * 触发 AI 分析
   */
  registerSecureRoute(fastify, {
    name: 'triggerAnalysis',
    alias: '触发 AI 分析',
    method: 'POST',
    url: '/analysis/:stockCode',
    requireLogin: true,
    permission: 'stick:analysis:write',
    handler: async (request, reply) => {
      const { stockCode } = request.params;

      const stock = await StockDao.findByCode(stockCode);
      if (!stock) {
        return reply.result.fail('股票不存在', null, 404);
      }

      // 获取实时行情
      const quote = await getQuote(stockCode, stock.market);
      if (!quote) {
        return reply.result.fail('获取行情失败', null, 500);
      }

      // 模拟历史价格（实际应从数据库或 API 获取）
      const prices = Array(20).fill(0).map((_, i) => {
        const base = quote.currentPrice;
        return base * (0.95 + Math.random() * 0.1);
      });
      prices.push(quote.currentPrice);

      // 计算技术指标
      const indicators = calculateIndicators(prices);

      // 生成建议
      const { suggestion, reason, confidence } = generateSuggestion(indicators, null);

      // 保存分析结果
      const analysis = await AnalysisDao.create({
        stockId: stock.id,
        currentPrice: quote.currentPrice,
        ma5: indicators.ma5,
        ma10: indicators.ma10,
        ma20: indicators.ma20,
        macd: indicators.macd,
        rsi: indicators.rsi,
        suggestion,
        reason,
        confidence
      });

      return reply.result.success('分析完成', analysis);
    }
  });
}
