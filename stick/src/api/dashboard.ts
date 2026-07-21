/**
 * 仪表盘 API
 *
 * @author <作者>
 * @since 2026-07-20
 */
import api from './index'
import type { DashboardData, ApiResponse } from '../types'

/**
 * 获取仪表盘数据
 * @returns 仪表盘数据
 */
export function getDashboard() {
  return api.get<any, ApiResponse<DashboardData>>('/dashboard')
}
