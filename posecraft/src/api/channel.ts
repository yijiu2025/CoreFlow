/**
 * 频道配置 API
 */
import service from '@/utils/request'

export const channelApi = {
  /** 获取频道配置列表（决定首页 Tab 结构） */
  getList: () => service.get('/posecraft/v1/config/channels')
}
