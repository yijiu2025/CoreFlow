/**
 * 个人统计 API（关注/粉丝/互关/获赞/作品/模板/收藏）
 *
 * @author Claude
 * @since 2026-07-13
 */
import service from '@/utils/request';

export const profileApi = {
  /** 获取当前登录用户的完整统计（从 session 识别） */
  getMyStats: () => service.get('/posecraft/v1/profile/stats'),

  /** 获取其他用户的完整统计（支持 uid 或 personal_id） */
  getUserStats: (uid: string) => service.get(`/posecraft/v1/profile/stats/${uid}`)
};
