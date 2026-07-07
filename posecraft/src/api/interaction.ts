import request from '@/utils/request'

export const interactionApi = {
  // 记录浏览历史 (workId 或 templateId)
  recordHistory: (data: { workId?: number; templateId?: number }) => {
    return request.post('/posecraft/v1/interaction/history', data)
  },

  // 点赞/取消点赞
  toggleLike: (data: { workId?: number; templateId?: number; like: boolean }) => {
    return request.post('/posecraft/v1/interaction/like', data)
  },

  // 收藏/取消收藏
  toggleCollect: (data: { workId?: number; templateId?: number; collect: boolean }) => {
    return request.post('/posecraft/v1/interaction/collect', data)
  },

  // 检查点赞和收藏状态
  checkStatus: (params: { workId?: number; templateId?: number }) => {
    return request.get('/posecraft/v1/interaction/status', { params })
  },

  // 获取历史记录列表
  getHistoryList: (params: { page: number; pageSize: number }) => {
    return request.get('/posecraft/v1/interaction/history/list', { params })
  },

  // 获取点赞列表
  getLikesList: (params: { page: number; pageSize: number }) => {
    return request.get('/posecraft/v1/interaction/like/list', { params })
  },

  // 获取收藏列表
  getCollectsList: (params: { page: number; pageSize: number }) => {
    return request.get('/posecraft/v1/interaction/collect/list', { params })
  }
}
