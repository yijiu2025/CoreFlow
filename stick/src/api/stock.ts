/**
 * 股票 API
 *
 * GET    /stocks?keyword=xxx    — 搜索股票（东方财富 API）
 * GET    /stocks/:code          — 获取股票详情（含实时行情）
 * POST   /stocks/watch          — 添加自选
 * DELETE /stocks/watch/:code    — 删除自选
 * GET    /stocks/watch          — 获取自选列表（含实时行情）
 *
 * @author <作者>
 * @since 2026-07-20
 */
import api from './index'
import type { ApiResponse } from '../types'

/**
 * 搜索股票
 * @param keyword - 搜索关键词（代码或名称）
 * @returns 搜索结果
 */
export function searchStocks(keyword: string) {
  return api.get<any, ApiResponse<any[]>>('/stocks', { params: { keyword } })
}

/**
 * 获取股票详情（含实时行情）
 * @param code - 股票代码
 * @param market - 市场
 * @returns 股票详情
 */
export function getStockDetail(code: string, market?: number) {
  return api.get<any, ApiResponse<any>>(`/stocks/${code}`, { params: { market } })
}

/**
 * 添加自选
 * @param data - 股票信息
 * @returns 添加结果
 */
export function addWatch(data: { code: string; name: string; market?: number }) {
  return api.post<any, ApiResponse<any>>('/stocks/watch', data)
}

/**
 * 删除自选
 * @param code - 股票代码
 * @returns 删除结果
 */
export function removeWatch(code: string) {
  return api.delete<any, ApiResponse<null>>(`/stocks/watch/${code}`)
}

/**
 * 获取自选列表（含实时行情）
 * @returns 自选列表
 */
export function getWatchlist() {
  return api.get<any, ApiResponse<any[]>>('/stocks/watch')
}