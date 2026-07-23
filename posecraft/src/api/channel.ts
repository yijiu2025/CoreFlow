/**
 * 频道配置 API
 *
 * @author Claude
 * @since 2026-07-13
 */
import service from '@/utils/request';

export const channelApi = {
  /** 获取频道配置列表（决定首页 Tab 结构） */
  getList: () => service.get('/posecraft/v1/config/channels')
};
