/**
 * 接口数据类型（与后端 DTO 一一对应）
 *
 * 后端字段是 snake_case（Sequelize 直出），这里保持同名，避免前端多一层映射
 * 造成「后端加字段前端不显示」的静默遗漏。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

/** 分页结果（与后端 PageResult 对齐） */
export interface PageResult<T> {
  rows: T[];
  total: number;
  pageNum: number;
  pageSize: number;
}

/** 当前登录用户 */
export interface CurrentUser {
  id: number;
  uid: string;
  username: string;
  email: string;
  avatar: string;
  status: number;
  deptId: number | null;
  deptName: string;
  roles: string[];
  permissions: string[];
}

/** 菜单节点 */
export interface MenuNode {
  id: number;
  parent_id: number;
  name: string;
  type: 'dir' | 'menu' | 'btn';
  icon: string | null;
  path: string | null;
  component: string | null;
  permission: string | null;
  sort: number;
  visible: number;
  status: number;
  children: MenuNode[];
}

/** 用户行 */
export interface UserRow {
  id: number;
  uid: string;
  username: string;
  email: string | null;
  avatar: string | null;
  status: number;
  dept_id: number | null;
  dept_name: string | null;
  role_names: string | null;
  post_names: string | null;
  created_at: string;
}

/** 用户引用选项 */
export interface UserOptions {
  depts: Array<{ id: number; parent_id: number; name: string }>;
  roles: Array<{ id: number; code: string; name: string; app_id: string; rank_level: number }>;
  posts: Array<{ id: number; post_code: string; post_name: string }>;
}

/** 角色行 */
export interface RoleRow {
  id: number;
  app_id: string;
  code: string;
  name: string;
  rank_level: number;
  description: string | null;
  user_count: number;
  builtin: boolean;
  permissions: string[];
  menu_ids: number[];
}

/** 工作台概览 */
export interface DashboardSummary {
  users: number;
  roles: number;
  menus: number;
  depts: number;
  todayLogins: number;
  failedLogins: number;
  todayOps: number;
  successRate: number;
  activeUsers: number;
  trend: Array<{ bucket: string; total: number; failed: number }>;
  recentLogins: Array<{ id: number; username: string | null; ip: string; location: string | null; created_at: string }>;
}

/** 操作日志行 */
export interface OperLogRow {
  id: number;
  username: string;
  module: string;
  action: string;
  method: string;
  path: string;
  cost_ms: number;
  ip: string;
  user_agent: string;
  detail: string;
  status: number;
  created_at: string;
}

/** 登录日志行 */
export interface LoginLogRow {
  id: number;
  username: string;
  event: string;
  app_id: string;
  ip: string;
  location: string | null;
  status: number;
  created_at: string;
}

/** 日志概览 */
export interface LogStats {
  range: string;
  total: number;
  failed: number;
  successRate: number;
  series: Array<{ bucket: string; total: number; failed: number }>;
  avgCost?: number;
  activeUsers?: number;
  users?: number;
  ips?: number;
}
