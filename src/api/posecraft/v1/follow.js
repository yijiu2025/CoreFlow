import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import followDao from '../../../app/posecraft/dao/follow.dao.js';
import sequelize from '../../../db/index.js';
import { Op } from 'sequelize';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'follow',
    description: '用户关注管理',
    prefix: '/v1'
  });

  /**
   * 根据 id/uid/personal_id 获取数据库内部整型用户 ID
   */
  const getInternalUserId = async (idOrUid) => {
    if (!idOrUid) return null;
    // 如果是纯数字，直接返回数字
    if (!isNaN(Number(idOrUid))) {
      return Number(idOrUid);
    }
    // 否则去数据库中查找对应的用户
    const { User } = sequelize.models;
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { uid: idOrUid },
          { personal_id: idOrUid }
        ]
      }
    });
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }
    return user.id;
  };

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

      let targetFollowingId;
      try {
        targetFollowingId = await getInternalUserId(followingId);
      } catch (err) {
        return reply.code(404).send({ code: 404, message: '目标用户不存在' });
      }

      const result = await followDao.follow(followerId, targetFollowingId);
      
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

      let targetFollowingId;
      try {
        targetFollowingId = await getInternalUserId(followingId);
      } catch (err) {
        return reply.code(404).send({ code: 404, message: '目标用户不存在' });
      }

      await followDao.unfollow(followerId, targetFollowingId);

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

      let targetFollowingId;
      try {
        targetFollowingId = await getInternalUserId(followingId);
      } catch (err) {
        return reply.code(404).send({ code: 404, message: '目标用户不存在' });
      }

      const isFollowing = await followDao.checkStatus(followerId, targetFollowingId);

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
      
      let targetUserId;
      try {
        targetUserId = await getInternalUserId(userId);
      } catch (err) {
        return reply.code(404).send({ code: 404, message: '用户不存在' });
      }
      
      const stats = await followDao.getStats(targetUserId);

      return reply.result.success('查询成功', stats);
    }
  });

  // 获取仅关注/粉丝统计数据
  registerSecureRoute(fastify, {
    name: 'getFollowStatsOnly',
    alias: '获取仅关注统计数据',
    method: 'GET',
    url: '/follow/stats/count/:userId',
    handler: async (request, reply) => {
      const { userId } = request.params;
      let targetUserId;
      try {
        targetUserId = await getInternalUserId(userId);
      } catch (err) {
        return reply.code(404).send({ code: 404, message: '用户不存在' });
      }
      const stats = await followDao.getFollowStatsCount(targetUserId);
      return reply.result.success('查询成功', stats);
    }
  });

  // 获取仅作品/获赞统计数据
  registerSecureRoute(fastify, {
    name: 'getWorkStatsOnly',
    alias: '获取仅作品获赞统计数据',
    method: 'GET',
    url: '/follow/stats/works/:userId',
    handler: async (request, reply) => {
      const { userId } = request.params;
      let targetUserId;
      try {
        targetUserId = await getInternalUserId(userId);
      } catch (err) {
        return reply.code(404).send({ code: 404, message: '用户不存在' });
      }
      const stats = await followDao.getWorkStatsCount(targetUserId);
      return reply.result.success('查询成功', stats);
    }
  });
}
