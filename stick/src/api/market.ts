/**
 * 行情 API
 *
 * @author <作者>
 * @since 2026-07-20
 */
import api from './index'
import type { Quote, SearchResult, ApiResponse } from '../types'

/**
 * 搜索股票
 * @param keyword - 搜索关键词
 * @returns 搜索结果
 */
export function searchStock(keyword: string) {
  return api.get<any, ApiResponse<SearchResult[]>>('/market/search', { params: { keyword } })
}

/**
 * 获取实时行情
 * @param code - 股票代码
 * @param market - 市场
 * @returns 行情数据
 */
export function getQuote(code: string, market: number = 1) {
  return api.get<any, ApiResponse<Quote>>(`/market/${code}`, { params: { market } })
}
