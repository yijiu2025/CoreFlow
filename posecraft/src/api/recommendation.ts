/**
 * 推荐 API
 */
import service from '@/utils/request'

export const recommendationApi = {
  /** 推荐作品 */
  recommendWork: (workId: number) => service.post(`/posecraft/v1/works/${workId}/recommend`),

  /** 取消推荐作品 */
  cancelRecommendWork: (workId: number) => service.delete(`/posecraft/v1/works/${workId}/recommend`),

  /** 推荐模板 */
  recommendTemplate: (templateId: number) => service.post(`/posecraft/v1/templates/${templateId}/recommend`),

  /** 取消推荐模板 */
  cancelRecommendTemplate: (templateId: number) => service.delete(`/posecraft/v1/templates/${templateId}/recommend`),

  /** 我的推荐列表（分页） */
  getMyList: (params?: { page?: number; pageSize?: number }) =>
    service.get('/posecraft/v1/recommendations/mine', { params }),

  /** 我的推荐数量 */
  getMyCount: () => service.get('/posecraft/v1/recommendations/mine/count'),

  /** 检查是否已推荐 */
  checkStatus: (params: { work_id?: number; template_id?: number }) =>
    service.get('/posecraft/v1/recommendations/status', { params })
}
