/**
 * 用户交互 API（浏览历史、点赞、收藏）
 */
import request from '@/utils/request'

export const interactionApi = {
  /**
   * 记录浏览历史
   * @param data - workId 或 templateId（二选一）
   */
  recordHistory: (data: { workId?: number; templateId?: number }) => {
    return request.post('/posecraft/v1/interaction/history', data)
  },

  /**
   * 点赞/取消点赞
   * @param data - workId 或 templateId + like 状态
   */
  toggleLike: (data: { workId?: number; templateId?: number; like: boolean }) => {
    return request.post('/posecraft/v1/interaction/like', data)
  },

  /**
   * 收藏/取消收藏
   * @param data - workId 或 templateId + collect 状态
   */
  toggleCollect: (data: { workId?: number; templateId?: number; collect: boolean }) => {
    return request.post('/posecraft/v1/interaction/collect', data)
  },

  /**
   * 检查点赞和收藏状态
   * @param params - workId 或 templateId
   */
  checkStatus: (params: { workId?: number; templateId?: number }) => {
    return request.get('/posecraft/v1/interaction/status', { params })
  },

  /**
   * 获取浏览历史列表
   * @param params - 分页参数
   */
  getHistoryList: (params: { page: number; pageSize: number }) => {
    return request.get('/posecraft/v1/interaction/history/list', { params })
  },

  /**
   * 获取点赞列表
   * @param params - 分页参数
   */
  getLikesList: (params: { page: number; pageSize: number }) => {
    return request.get('/posecraft/v1/interaction/like/list', { params })
  },

  /**
   * 获取收藏列表
   * @param params - 分页参数
   */
  getCollectsList: (params: { page: number; pageSize: number }) => {
    return request.get('/posecraft/v1/interaction/collect/list', { params })
  }
}
