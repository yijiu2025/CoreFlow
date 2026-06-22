/**
 * PoseCraft 类型定义
 */

/** 模板 */
export interface Template {
  id: number
  title: string
  description?: string
  category: string
  thumbnail_url?: string
  image_url: string
  pose_data?: any
  tags?: string[]
  user_id: number
  status: number
  likes_count: number
  uses_count: number
  created_at: string
  updated_at: string
}

/** 作品 */
export interface Work {
  id: number
  user_id: number
  template_id?: number
  title?: string
  description?: string
  image_url: string
  thumbnail_url?: string
  analysis_data?: any
  edit_data?: any
  status: number
  likes_count: number
  views_count: number
  created_at: string
  updated_at: string
}

/** 分析记录 */
export interface Analysis {
  id: number
  user_id: number
  image_url: string
  analysis_type: 'pose' | 'face' | 'hand' | 'segmentation'
  result_data: any
  processing_time?: number
  status: number
  created_at: string
}

/** 用户 */
export interface User {
  id: number
  uid: string
  username: string
  email: string
  avatar?: string
  status: number
}

/** 姿势关键点 */
export interface PoseKeypoint {
  x: number
  y: number
  score: number
  name: string
}

/** AI 分析结果 */
export interface PoseAnalysisResult {
  keypoints: PoseKeypoint[]
  score: number
  width: number
  height: number
}
