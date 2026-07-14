/**
 * PoseCraft Banner 配置公开 API
 * 前台获取当前展示的 Banner（公开、无登录）
 *
 * @author Claude
 * @since 2026-07-13
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import BannerConfigDao from '../../../app/posecraft/dao/bannerConfig.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'bannerConfig',
    description: 'Banner 配置',
    prefix: '/v1'
  });

  /**
   * GET /banner-configs/active
   * 获取当前在展示窗口内、启用的 Banner 列表
   * 公开接口，无需登录
   */
  registerSecureRoute(fastify, {
    name: 'getActiveBanners',
    alias: '获取当前展示 Banner',
    method: 'GET',
    url: '/banner-configs/active',
    handler: async (request, reply) => {
      const list = await BannerConfigDao.findActive();
      return reply.result.success('获取成功', list);
    }
  });
}
