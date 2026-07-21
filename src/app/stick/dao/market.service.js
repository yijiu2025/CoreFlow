/**
 * 行情服务
 * 提供实时股票行情数据获取
 *
 * @author <作者>
 * @since 2026-07-20
 */

/**
 * 根据股票代码和市场生成行情查询代码
 * @param {string} code - 股票代码
 * @param {number} market - 市场 (1=沪市 2=深市)
 * @returns {string} 查询代码
 */
function getMarketCode(code, market) {
  if (market === 1) return `sh${code}`;
  if (market === 2) return `sz${code}`;
  return code;
}

/**
 * 从东方财富 API 获取实时行情
 * @param {string} code - 股票代码
 * @param {number} market - 市场
 * @returns {Promise<object>} 行情数据
 */
async function getEastMoneyQuote(code, market) {
  const marketCode = getMarketCode(code, market);
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${market === 1 ? '1' : '0'}.${code}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f170`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.data) {
      return {
        code: data.data.f57,
        name: data.data.f58,
        currentPrice: data.data.f43 / 100,
        high: data.data.f44 / 100,
        low: data.data.f45 / 100,
        open: data.data.f46 / 100,
        volume: data.data.f47,
        amount: data.data.f48,
        changePercent: data.data.f170 / 100
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ [Market] 获取行情失败: ${code}`, error.message);
    return null;
  }
}

/**
 * 从新浪财经 API 获取实时行情
 * @param {string} code - 股票代码
 * @param {number} market - 市场
 * @returns {Promise<object>} 行情数据
 */
async function getSinaQuote(code, market) {
  const marketCode = getMarketCode(code, market);
  const url = `https://hq.sinajs.cn/list=${marketCode}`;

  try {
    const response = await fetch(url, {
      headers: { 'Referer': 'https://finance.sina.com.cn' }
    });
    const text = await response.text();

    // 解析新浪行情数据
    const match = text.match(/="(.+)"/);
    if (match && match[1]) {
      const parts = match[1].split(',');
      if (parts.length >= 32) {
        return {
          code,
          name: parts[0],
          open: parseFloat(parts[1]),
          prevClose: parseFloat(parts[2]),
          currentPrice: parseFloat(parts[3]),
          high: parseFloat(parts[4]),
          low: parseFloat(parts[5]),
          volume: parseInt(parts[8]),
          amount: parseFloat(parts[9]),
          changePercent: ((parseFloat(parts[3]) - parseFloat(parts[2])) / parseFloat(parts[2]) * 100).toFixed(2)
        };
      }
    }
    return null;
  } catch (error) {
    console.error(`❌ [Market] 获取新浪行情失败: ${code}`, error.message);
    return null;
  }
}

/**
 * 获取股票实时行情（优先东方财富，失败回退新浪）
 * @param {string} code - 股票代码
 * @param {number} market - 市场 (1=沪市 2=深市)
 * @returns {Promise<object|null>} 行情数据
 */
export async function getQuote(code, market = 1) {
  // 优先使用东方财富 API
  let quote = await getEastMoneyQuote(code, market);

  // 失败则回退到新浪 API
  if (!quote) {
    quote = await getSinaQuote(code, market);
  }

  return quote;
}

/**
 * 搜索股票
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<object[]>} 搜索结果
 */
export async function searchStock(keyword) {
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.QuotationCodeTable && data.QuotationCodeTable.Data) {
      return data.QuotationCodeTable.Data.map(item => ({
        code: item.Code,
        name: item.Name,
        market: item.MktNum === '0' ? 2 : 1,
        type: item.SecurityTypeName
      }));
    }
    return [];
  } catch (error) {
    console.error(`❌ [Market] 搜索股票失败:`, error.message);
    return [];
  }
}

export default {
  getQuote,
  searchStock
};
