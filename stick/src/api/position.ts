/**
 * 持仓 API
 *
 * @author <作者>
 * @since 2026-07-20
 */
import api from './index'
import type { Position, ApiResponse } from '../types'

/**
 * 获取持仓列表
 * @param params - 查询参数
 * @returns 持仓列表
 */
export function getPositions(params?: { status?: number }) {
  return api.get<any, ApiResponse<Position[]>>('/positions', { params })
}

/**
 * 添加持仓
 * @param data - 持仓数据
 * @returns 新创建的持仓
 */
export function addPosition(data: { stockCode: string; price: number; quantity: number; tradeDate: string }) {
  return api.post<any, ApiResponse<Position>>('/positions', data)
}

/**
 * 更新持仓
 * @param id - 持仓 ID
 * @param data - 更新数据
 * @returns 更新后的持仓
 */
export function updatePosition(id: number, data: { quantity?: number; avgCost?: number }) {
  return api.put<any, ApiResponse<Position>>(`/positions/${id}`, data)
}

/**
 * 删除持仓
 * @param id - 持仓 ID
 * @returns 删除结果
 */
export function deletePosition(id: number) {
  return api.delete<any, ApiResponse<null>>(`/positions/${id}`)
}
