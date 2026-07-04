import { registerSecureRoute } from '../../guard.js';
import followDao from '../../../app/posecraft/dao/follow.dao.js';

export default async function (fastify) {
  // 关注某人
  registerSecureRoute(fastify, {
    name: 'followUser',
    alias: '关注用户',
    method: 'POST',
    url: '/follow/:userId',
    requireLogin: true,
    handler: async (request, reply) => {
      const { userId: followingId } = request.params;
      const followerId = request.state.user.userId;

      const result = await followDao.follow(followerId, followingId);
      
      if (!result.success) {
        return reply.result.fail(result.message);
      }

      return reply.result.success(result.message);
    }
  });

  // 取消关注
  registerSecureRoute(fastify, {
    name: 'unfollowUser',
    alias: '取消关注',
    method: 'DELETE',
    url: '/follow/:userId',
    requireLogin: true,
    handler: async (request, reply) => {
      const { userId: followingId } = request.params;
      const followerId = request.state.user.userId;

      await followDao.unfollow(followerId, followingId);

      return reply.result.success('已取消关注');
    }
  });

  // 检查是否已关注
  registerSecureRoute(fastify, {
    name: 'checkFollowStatus',
    alias: '检查关注状态',
    method: 'GET',
    url: '/follow/status/:userId',
    requireLogin: true,
    handler: async (request, reply) => {
      const { userId: followingId } = request.params;
      const followerId = request.state.user.userId;

      const isFollowing = await followDao.checkStatus(followerId, followingId);

      return reply.result.success('查询成功', {
        isFollowing
      });
    }
  });

  // 获取用户的粉丝数和关注数
  registerSecureRoute(fastify, {
    name: 'getFollowStats',
    alias: '获取关注统计数据',
    method: 'GET',
    url: '/follow/stats/:userId',
    handler: async (request, reply) => {
      const { userId } = request.params;
      
      const stats = await followDao.getStats(userId);

      return reply.result.success('查询成功', stats);
    }
  });
}
