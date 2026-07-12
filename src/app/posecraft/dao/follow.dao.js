/**
 * PoseCraft 关注系统数据访问层
 */
import sequelize from '../../../db/index.js';

class FollowDao {
  getModel() {
    return sequelize.models.Follow;
  }

  getUserModel() {
    return sequelize.models.User;
  }

  /**
   * 关注用户
   * @param {number} followerId 关注者ID
   * @param {number} followingId 被关注者ID
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async follow(followerId, followingId) {
    if (followerId.toString() === followingId.toString()) {
      return { success: false, message: '不能关注自己' };
    }

    const User = this.getUserModel();
    const Follow = this.getModel();

    // 检查被关注者是否存在
    const targetUser = await User.findOne({ where: { id: followingId, status: 1 } });
    if (!targetUser) {
      return { success: false, message: '目标用户不存在或已被封禁' };
    }

    // 检查是否已经关注
    const existing = await Follow.findOne({
      where: { follower_id: followerId, following_id: followingId, delete_version: 0 }
    });

    if (existing) {
      return { success: true, message: '已经关注了该用户' };
    }

    // 检查对方是否关注了我（互关判断）
    const reverseFollow = await Follow.findOne({
      where: { follower_id: followingId, following_id: followerId, delete_version: 0 }
    });
    const isMutual = !!reverseFollow;

    // 这里直接复用曾经软删除的记录（如果存在）或创建新记录
    const deletedRecord = await Follow.findOne({
      where: { follower_id: followerId, following_id: followingId },
      paranoid: false // 包含已软删除的
    });

    if (deletedRecord && deletedRecord.delete_version !== 0) {
      // 恢复软删除，并设置互关状态
      await deletedRecord.restore();
      await deletedRecord.update({ delete_version: 0, mutual: isMutual });
    } else {
      await Follow.create({
        follower_id: followerId,
        following_id: followingId,
        mutual: isMutual,
        delete_version: 0
      });
    }

    // 如果互关，把对方记录的 mutual 也置为 true
    if (isMutual && reverseFollow) {
      await reverseFollow.update({ mutual: true });
    }

    return { success: true, message: '关注成功' };
  }

  /**
   * 取消关注
   */
  async unfollow(followerId, followingId) {
    const Follow = this.getModel();

    const record = await Follow.findOne({
      where: { follower_id: followerId, following_id: followingId, delete_version: 0 }
    });

    if (record) {
      // 软删除
      await record.update({ delete_version: record.id });
      await record.destroy();

      // 如果原来是互关，把对方的 mutual 置为 false
      if (record.mutual) {
        const reverseRecord = await Follow.findOne({
          where: { follower_id: followingId, following_id: followerId, delete_version: 0 }
        });
        if (reverseRecord) {
          await reverseRecord.update({ mutual: false });
        }
      }
    }

    return true;
  }

  /**
   * 检查是否已关注
   */
  async checkStatus(followerId, followingId) {
    const Follow = this.getModel();

    const record = await Follow.findOne({
      where: { follower_id: followerId, following_id: followingId, delete_version: 0 }
    });

    return !!record;
  }

  /**
   * 获取用户的粉丝数和关注数
   */
  async getStats(userId) {
    const followStats = await this.getFollowStatsCount(userId);
    const workStats = await this.getWorkStatsCount(userId);
    return { ...followStats, ...workStats };
  }

  /**
   * 仅获取粉丝数和关注数
   */
  async getFollowStatsCount(userId) {
    const Follow = this.getModel();
    const followersCount = await Follow.count({
      where: { following_id: userId, delete_version: 0 }
    });
    const followingCount = await Follow.count({
      where: { follower_id: userId, delete_version: 0 }
    });
    return { followersCount, followingCount };
  }

  /**
   * 获取互关数量（follower_id=X 且 mutual=true 的记录数）
   */
  async getMutualCount(userId) {
    const Follow = this.getModel();
    return await Follow.count({
      where: { follower_id: userId, mutual: true, delete_version: 0 }
    });
  }

  /**
   * 仅获取作品数和获赞数
   */
  async getWorkStatsCount(userId) {
    const { Work } = sequelize.models;
    let worksCount = 0;
    let likesCount = 0;
    if (Work) {
      worksCount = await Work.count({
        where: { user_id: userId, delete_version: 0 }
      });
      likesCount = await Work.sum('likes_count', {
        where: { user_id: userId, delete_version: 0 }
      }) || 0;
    }
    return { worksCount, likesCount };
  }
}

export default new FollowDao();
