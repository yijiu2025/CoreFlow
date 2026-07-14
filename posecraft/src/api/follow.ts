/**
 * 关注/取消关注 API
 *
 * @author Claude
 * @since 2026-07-13
 */
import request from '@/utils/request'

export const followApi = {
  /**
   * 关注用户
   * @param userId - 目标用户 ID
   */
  follow: (userId: string | number) => {
    return request.post(`/posecraft/v1/follow/${userId}`)
  },

  /**
   * 取消关注
   * @param userId - 目标用户 ID
   */
  unfollow: (userId: string | number) => {
    return request.delete(`/posecraft/v1/follow/${userId}`)
  },

  /**
   * 检查是否已关注
   * @param userId - 目标用户 ID
   */
  checkStatus: (userId: string | number) => {
    return request.get(`/posecraft/v1/follow/status/${userId}`)
  }
}
