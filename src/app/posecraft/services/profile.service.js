/**
 * PoseCraft 用户资料统计服务
 *
 * 从 api/posecraft/v1/follow.js 下沉：
 * - resolveInternalUserId：id/uid/personal_id → 内部整型用户 ID
 * - getProfileStats：聚合个人完整统计（关注/粉丝/互关/获赞/作品/模板/收藏/推荐）
 *
 * @author yijiu
 * @since 2026-08-16
 */
import { getModel } from '../../../framework/db/index.js';
import { Op } from 'sequelize';
import followDao from '../dao/follow.dao.js';

/**
 * 根据 id/uid/personal_id 获取数据库内部整型用户 ID
 * @param {string|number} idOrUid - 用户整型 ID、uid 或 personal_id
 * @returns {Promise<number|null>} 数据库整型用户 ID；纯数字直接返回，无效值返回 null
 * @throws {Error} 非数字且数据库查不到时抛出 USER_NOT_FOUND
 */
export async function resolveInternalUserId(idOrUid) {
  if (!idOrUid) return null;
  // 纯数字直接返回
  if (!isNaN(Number(idOrUid))) {
    return Number(idOrUid);
  }
  // 否则查 uid / personal_id
  const user = await getModel('User').findOne({
    where: {
      [Op.or]: [{ uid: idOrUid }, { personal_id: idOrUid }]
    }
  });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  return user.id;
}

/**
 * 聚合个人完整统计（关注/粉丝/互关/获赞/作品/模板/收藏/推荐）
 * @param {number} userId - 数据库整型用户 ID
 * @returns {Promise<object>} 完整统计数据对象
 */
export async function getProfileStats(userId) {
  const [followStats, mutual, workStats, templatesCount, collectsCount, recommendationsCount] = await Promise.all([
    followDao.getFollowStatsCount(userId),
    followDao.getMutualCount(userId),
    followDao.getWorkStatsCount(userId),
    getModel('Template').count({ where: { user_id: userId, delete_version: 0 } }),
    getModel('UserCollect').count({ where: { user_id: userId, delete_version: 0 } }),
    getModel('Recommendation').count({ where: { user_id: userId, delete_version: 0 } })
  ]);

  return {
    following: followStats.followingCount,
    followers: followStats.followersCount,
    mutual,
    likes_received: workStats.likesCount,
    works_count: workStats.worksCount,
    templates_count: templatesCount,
    collects_count: collectsCount,
    recommendations_count: recommendationsCount
  };
}
