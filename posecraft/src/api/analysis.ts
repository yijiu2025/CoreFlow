/**
 * AI 分析 API
 */
import service from '@/utils/request'

export const analysisApi = {
  /** 保存分析结果 */
  save: (data: {
    image_url: string
    analysis_type: string
    result_data: any
    processing_time?: number
  }) => service.post('/posecraft/v1/analysis', data),

  /** 获取分析记录 */
  getList: (params?: { analysis_type?: string; page?: number; pageSize?: number }) =>
    service.get('/posecraft/v1/analysis', { params }),

  /** 获取统计 */
  getStats: () => service.get('/posecraft/v1/analysis/stats')
}
