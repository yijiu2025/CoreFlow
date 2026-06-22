/**
 * 作品 API
 */
import service from '@/utils/request'

export const workApi = {
  /** 获取作品列表 */
  getList: (params?: { keyword?: string; page?: number; pageSize?: number }) =>
    service.get('/posecraft/v1/works', { params }),

  /** 获取推荐作品 */
  getRecommended: (limit?: number) =>
    service.get('/posecraft/v1/works/recommended', { params: { limit } }),

  /** 获取用户作品 */
  getUserWorks: (userId: number, params?: { page?: number; pageSize?: number }) =>
    service.get(`/posecraft/v1/works/user/${userId}`, { params }),

  /** 获取作品详情 */
  getDetail: (id: number) =>
    service.get(`/posecraft/v1/works/${id}`),

  /** 创建作品 */
  create: (data: {
    title?: string
    description?: string
    template_id?: number
    image_url: string
    thumbnail_url?: string
    analysis_data?: any
    edit_data?: any
  }) => service.post('/posecraft/v1/works', data),

  /** 删除作品 */
  delete: (id: number) =>
    service.delete(`/posecraft/v1/works/${id}`),

  /** 点赞作品 */
  like: (id: number) =>
    service.post(`/posecraft/v1/works/${id}/like`)
}
