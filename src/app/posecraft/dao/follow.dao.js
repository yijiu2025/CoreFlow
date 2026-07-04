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

    // 这里直接复用曾经软删除的记录（如果存在）或创建新记录
    const deletedRecord = await Follow.findOne({
      where: { follower_id: followerId, following_id: followingId },
      paranoid: false // 包含已软删除的
    });

    if (deletedRecord && deletedRecord.delete_version !== 0) {
      // 恢复软删除
      await deletedRecord.restore();
      await deletedRecord.update({ delete_version: 0 });
    } else {
      await Follow.create({
        follower_id: followerId,
        following_id: followingId,
        delete_version: 0
      });
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
    const Follow = this.getModel();

    const followersCount = await Follow.count({
      where: { following_id: userId, delete_version: 0 }
    });

    const followingCount = await Follow.count({
      where: { follower_id: userId, delete_version: 0 }
    });

    return { followersCount, followingCount };
  }
}

export default new FollowDao();
