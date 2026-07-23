/**
 * Banner 配置前台 API
 *
 * @author Claude
 * @since 2026-07-13
 */
import service from '@/utils/request';

export const bannerConfigApi = {
  /** 获取当前在展示窗口内、启用的 Banner 列表（公开、无登录） */
  getActive: () => service.get('/posecraft/v1/banner-configs/active')
};
