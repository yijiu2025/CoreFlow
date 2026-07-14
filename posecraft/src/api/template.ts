/**
 * 模板 API
 *
 * @author Claude
 * @since 2026-07-13
 */
import service from '@/utils/request'

export const templateApi = {
  /** 获取模板列表 */
  getList: (params?: { category?: string; keyword?: string; page?: number; pageSize?: number; status?: number }) =>
    service.get('/posecraft/v1/templates', { params }),

  /** 获取热门模板 */
  getPopular: (limit?: number) =>
    service.get('/posecraft/v1/templates/popular', { params: { limit } }),

  /** 获取模板详情 */
  getDetail: (id: number, params?: { camera?: boolean }) =>
    service.get(`/posecraft/v1/templates/${id}`, { params }),

  /** 创建模板 */
  create: (data: {
    title: string
    description?: string
    category?: string
    image_url: string
    pose_data?: any
    tags?: string[]
  }) => service.post('/posecraft/v1/templates', data),

  /** 更新模板 */
  update: (id: number, data: any) =>
    service.put(`/posecraft/v1/templates/${id}`, data),

  /** 删除模板 */
  delete: (id: number) =>
    service.delete(`/posecraft/v1/templates/${id}`),

  /** 审核模板 (管理员) */
  audit: (id: number, status: number) =>
    service.post(`/posecraft/v1/templates/${id}/audit`, { status }),

  /** 获取当前登录用户自己上传的模板（从 session 识别用户） */
  getMyTemplates: (params?: { page?: number; pageSize?: number }) =>
    service.get('/posecraft/v1/templates/mine', { params })
}
