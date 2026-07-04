import request from '@/utils/request'

export const followApi = {
  // 关注用户
  follow: (userId: string | number) => {
    return request.post(`/posecraft/v1/follow/${userId}`)
  },

  // 取消关注
  unfollow: (userId: string | number) => {
    return request.delete(`/posecraft/v1/follow/${userId}`)
  },

  // 检查是否已关注
  checkStatus: (userId: string | number) => {
    return request.get(`/posecraft/v1/follow/status/${userId}`)
  },

  // 获取粉丝数和关注数
  getStats: (userId: string | number) => {
    return request.get(`/posecraft/v1/follow/stats/${userId}`)
  }
}
