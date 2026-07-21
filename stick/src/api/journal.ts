/**
 * 交易日志 API
 *
 * @author <作者>
 * @since 2026-07-20
 */
import api from './index'
import type { Journal, ApiResponse } from '../types'

/**
 * 获取日志列表
 * @param params - 查询参数
 * @returns 日志列表
 */
export function getJournals(params?: { stockId?: number; limit?: number }) {
  return api.get<any, ApiResponse<Journal[]>>('/journal', { params })
}

/**
 * 添加日志
 * @param data - 日志数据
 * @returns 新创建的日志
 */
export function addJournal(data: {
  stockCode?: string
  title: string
  content?: string
  lesson?: string
  mood?: number
}) {
  return api.post<any, ApiResponse<Journal>>('/journal', data)
}

/**
 * 更新日志
 * @param id - 日志 ID
 * @param data - 更新数据
 * @returns 更新后的日志
 */
export function updateJournal(id: number, data: { title?: string; content?: string; lesson?: string; mood?: number }) {
  return api.put<any, ApiResponse<Journal>>(`/journal/${id}`, data)
}

/**
 * 删除日志
 * @param id - 日志 ID
 * @returns 删除结果
 */
export function deleteJournal(id: number) {
  return api.delete<any, ApiResponse<null>>(`/journal/${id}`)
}
