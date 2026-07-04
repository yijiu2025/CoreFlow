import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';

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
      // 在这里可以替换为从数据库读取
      const channels = [
        { value: 'recommend', label: '推荐' },
        { value: 'pose', label: '姿势' },
        { value: 'creative', label: '创意' },
        { value: 'scenery', label: '风景', url: 'https://cn.bing.com/images/search?q=%E9%A3%8E%E6%99%AF' },
        { value: 'sports', label: '运动' },
        { value: 'composition', label: '构图' },
        { value: 'technique', label: '技巧' },
        { value: 'dynamic_test', label: '来自后端' } // 额外加一个来验证动态获取成功
      ];
      
      return reply.result.success('获取成功', channels);
    }
  });
}
