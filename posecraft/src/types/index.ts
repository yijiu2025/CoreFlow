/**
 * PoseCraft 类型定义
 *
 * 包含核心业务实体：Template（模板）、Work（作品）、Analysis（分析记录）、
 * User（用户）、PoseKeypoint（姿势关键点）、PoseAnalysisResult（AI 分析结果），
 * 以及统一 API 响应（ApiResult / ApiPageResult）和分页元数据（Pagination / PageResult）。
 *
 * @author Claude
 * @since 2026-07-13
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
  /** 是否为模板底图作品（模板一对一绑定的作品），true 时显示「模板」徽章 */
  is_template_work?: boolean
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

/** 统一 API 响应 */
export interface ApiResult<T> {
  code: number
  message: string
  data: T
  timestamp?: number
  requestId?: string
}

/** 分页元数据 */
export interface Pagination {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 统一分页响应 */
export interface ApiPageResult<T> extends ApiResult<T[]> {
  pagination: Pagination
}

/** 统一前端分页结果对象 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

