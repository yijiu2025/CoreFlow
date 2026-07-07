/**
 * 用户个性设置 API
 * - GET  /posecraft/v1/settings        一次性拉取全部字段（登录时）
 * - PUT  /posecraft/v1/settings/:field 单字段更新（前端改动时）
 */
import service from '@/utils/request'

export const settingsApi = {
  /** 一次性拉取全部设置 */
  getAll: () => service.get<Record<string, any>>('/posecraft/v1/settings'),

  /** 写入单个字段 */
  setField: (field: string, value: any) =>
    service.put<{ field: string; value: any }>(
      `/posecraft/v1/settings/${encodeURIComponent(field)}`,
      { value }
    )
}
