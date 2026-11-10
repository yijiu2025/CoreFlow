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
  /** 角色 ID 逗号串（GROUP_CONCAT）：表单回填的唯一依据，**不要**用 role_names 反查 */
  role_ids: string | null;
  /** 岗位 ID 逗号串（同上） */
  post_ids: string | null;
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

/* ── 权限关系图（GET /permissions/graph）───────────────────────── */

/** 图里的用户节点（后端只返回脱敏字段） */
export interface GraphUser {
  id: number;
  username: string;
  email: string | null;
  status: number;
  dept_name: string | null;
}

/** 图里的角色节点（menuIds 是已授权的菜单 ID） */
export interface GraphRole {
  id: number;
  name: string;
  code: string;
  app_id: string;
  rank_level: number;
  /** PBAC 权限码（policy 解出的 Allow Action） */
  permissions: string[];
  menuIds: number[];
}

/** 图里的菜单节点（后端是 snake_case） */
export interface GraphMenu {
  id: number;
  parent_id: number | null;
  name: string;
  type: string;
  icon: string | null;
  path: string | null;
  permission: string | null;
  sort: number;
  visible: number;
  status: number;
}

/** 权限关系整图：users / roles / menus + [userId, roleId] 边集 */
export interface PermissionGraph {
  users: GraphUser[];
  roles: GraphRole[];
  menus: GraphMenu[];
  userRoles: Array<[number, number]>;
  usersVisible: boolean;
}

/** 岗位在岗成员（GET /posts/:id/users，只返回脱敏字段） */
export interface PostMember {
  id: number;
  uid: string;
  username: string;
  email: string | null;
  avatar: string | null;
  status: number;
}
