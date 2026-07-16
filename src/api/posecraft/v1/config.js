/**
 * PoseCraft 频道配置 API
 * 从数据库读取频道分类列表（推荐、姿势、创意等），公开无需登录。
 *
 * @author Claude
 * @since 2026-07-13
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import channelDao from '../../../app/posecraft/dao/channel.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'config',
    description: 'PoseCraft 配置管理',
    prefix: '/v1/config'
  });

  registerSecureRoute(fastify, {
    name: 'getChannels',
    alias: '获取前端频道配置',
    method: 'GET',
    url: '/channels',
    handler: async (request, reply) => {
      const channels = await channelDao.findActive();
      // 输出精简字段，与前端旧格式兼容并扩展
      const list = channels.map(c => ({
        value: c.value,
        label: c.label,
        icon: c.icon,
        type: c.type,
        url: c.url,
        route: c.route,
        category: c.category,
        has_banner: c.has_banner
      }));
      return reply.result.success('获取成功', list);
    }
  });
}
