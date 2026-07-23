/**
 * Banner 配置管理 API 调用
 */
import axios from 'axios';

export const bannerApi = {
  /** 分页列表 */
  list: (params: { page?: number; pageSize?: number } = {}) =>
    axios.get('/posecraft/v1/admin/banner-configs', { params }),
  /** 新建 */
  create: (data: Record<string, any>) => axios.post('/posecraft/v1/admin/banner-configs', data),
  /** 更新 */
  update: (id: number, data: Record<string, any>) => axios.put(`/posecraft/v1/admin/banner-configs/${id}`, data),
  /** 删除（软删除） */
  remove: (id: number) => axios.delete(`/posecraft/v1/admin/banner-configs/${id}`)
};
