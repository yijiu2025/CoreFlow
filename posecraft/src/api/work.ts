/**
 * 作品 API
 *
 * @author Claude
 * @since 2026-07-13
 */
import service from '@/utils/request'

export const workApi = {
  /** 获取作品列表（支持按频道 category 过滤 / sort 排序） */
  getList: (params?: {
    keyword?: string
    page?: number
    pageSize?: number
    /** 分类过滤：pose / creative / sports / composition / technique */
    category?: string
    /** 排序方式：recommended（热度+随机）/ 不传则按时间降序 */
    sort?: string
  }) =>
    service.get('/posecraft/v1/works', { params }),

  /** 获取关注者的作品 */
  getFollowingWorks: (params?: { page?: number; pageSize?: number }) =>
    service.get('/posecraft/v1/works/following', { params }),

  /** 获取互关朋友的作品（仅 mutual=true 的用户） */
  getFriendsWorks: (params?: { page?: number; pageSize?: number }) =>
    service.get('/posecraft/v1/works/friends', { params }),

  /** 获取附近的公开作品（按 publication_lat/lng 计算距离） */
  getNearbyWorks: (params?: { lat?: number; lng?: number; radius?: number; page?: number; pageSize?: number }) =>
    service.get('/posecraft/v1/works/nearby', { params }),

  /** 获取推荐作品（多维加权随机排序） */
  getRecommendedWorks: (params?: { limit?: number }) =>
    service.get('/posecraft/v1/works/recommended', { params }),

  /** 获取当前登录用户自己的作品（从 session 识别用户） */
  getMyWorks: (params?: { page?: number; pageSize?: number; status?: number }) =>
    service.get('/posecraft/v1/works/mine', { params }),

  /** 获取作品详情 */
  getDetail: (id: number) =>
    service.get(`/posecraft/v1/works/${id}`),

  /** 创建作品 */
  create: (data: {
    title?: string
    description?: string
    template_id?: number
    image_url: string
    thumbnail_url?: string,
    edit_data?: any
    // 地址字段
    publication_address?: string | null
    publication_lat?: number | null
    publication_lng?: number | null
    publication_source?: string | null
    work_address?: string | null
    work_lat?: number | null
    work_lng?: number | null
    work_address_source?: string | null
  }) => service.post('/posecraft/v1/works', data),

  /** 删除作品 */
  delete: (id: number) =>
    service.delete(`/posecraft/v1/works/${id}`)
}
