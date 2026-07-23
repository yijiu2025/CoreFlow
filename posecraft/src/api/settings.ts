/**
 * 用户个性设置 API
 * - GET  /posecraft/v1/settings         一次性拉取全部字段（登录时）
 * - GET  /posecraft/v1/settings/:field  读取单个字段
 * - PUT  /posecraft/v1/settings/:field  单字段更新（前端改动时）
 */
import service from '@/utils/request';

export interface SettingFieldResponse {
  field: string;
  value: any;
  exists: boolean;
}

export const settingsApi = {
  /** 一次性拉取全部设置 */
  getAll: () => service.get<Record<string, any>>('/posecraft/v1/settings'),

  /** 读取单个字段 */
  getField: (field: string) => service.get<SettingFieldResponse>(`/posecraft/v1/settings/${encodeURIComponent(field)}`),

  /** 写入单个字段 */
  setField: (field: string, value: any) =>
    service.put<SettingFieldResponse>(`/posecraft/v1/settings/${encodeURIComponent(field)}`, { value })
};
