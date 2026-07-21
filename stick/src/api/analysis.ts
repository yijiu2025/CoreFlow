/**
 * AI 分析 API
 *
 * @author <作者>
 * @since 2026-07-20
 */
import api from './index'
import type { Analysis, ApiResponse } from '../types'

/**
 * 获取分析结果
 * @param stockCode - 股票代码
 * @returns 分析结果
 */
export function getAnalysis(stockCode: string) {
  return api.get<any, ApiResponse<Analysis>>(`/analysis/${stockCode}`)
}

/**
 * 触发 AI 分析
 * @param stockCode - 股票代码
 * @returns 分析结果
 */
export function triggerAnalysis(stockCode: string) {
  return api.post<any, ApiResponse<Analysis>>(`/analysis/${stockCode}`)
}
