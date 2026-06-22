/**
 * 模板 API
 */
import service from '@/utils/request'

export const templateApi = {
  /** 获取模板列表 */
  getList: (params?: { category?: string; keyword?: string; page?: number; pageSize?: number }) =>
    service.get('/posecraft/v1/templates', { params }),

  /** 获取热门模板 */
  getPopular: (limit?: number) =>
    service.get('/posecraft/v1/templates/popular', { params: { limit } }),

  /** 获取模板详情 */
  getDetail: (id: number) =>
    service.get(`/posecraft/v1/templates/${id}`),

  /** 创建模板 */
  create: (data: {
    title: string
    description?: string
    category?: string
    image_url: string
    thumbnail_url?: string
    pose_data?: any
    tags?: string[]
  }) => service.post('/posecraft/v1/templates', data),

  /** 更新模板 */
  update: (id: number, data: any) =>
    service.put(`/posecraft/v1/templates/${id}`, data),

  /** 删除模板 */
  delete: (id: number) =>
    service.delete(`/posecraft/v1/templates/${id}`)
}
