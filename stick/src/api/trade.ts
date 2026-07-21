/**
 * 交易 API
 *
 * @author <作者>
 * @since 2026-07-20
 */
import api from './index'
import type { Trade, ApiResponse } from '../types'

/**
 * 获取交易记录
 * @param params - 查询参数
 * @returns 交易列表
 */
export function getTrades(params?: { type?: number; startDate?: string; endDate?: string; limit?: number }) {
  return api.get<any, ApiResponse<Trade[]>>('/trades', { params })
}

/**
 * 记录交易
 * @param data - 交易数据
 * @returns 新创建的交易记录
 */
export function addTrade(data: {
  stockCode: string
  type: number
  price: number
  quantity: number
  fee?: number
  tradeDate: string
  note?: string
}) {
  return api.post<any, ApiResponse<Trade>>('/trades', data)
}
