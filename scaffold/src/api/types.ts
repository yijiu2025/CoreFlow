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
/** 注销申请摘要（列表行 / 详情共用） */
export interface UserDeletionBrief {
  id: number;
  /** all = 删除整个账号；app = 只注销某个应用 */
  scope: 'all' | 'app';
  app_id: string | null;
  /** 到期执行时间（ISO） */
  scheduled_at: string;
  /** 发起人账号快照（用户自助时为空） */
  requested_by_name: string | null;
}

/** 待执行注销的完整信息（GET /users/:id/deletion） */
export interface UserDeletionRequest extends UserDeletionBrief {
  reason: string | null;
  requested_at: string;
  requested_by: number | null;
}

/** 用户在某应用里的账号状态（GET /users/:id/apps） */
export interface UserAppRow {
  app_id: string;
  app_label: string;
  /** 有 OAuth 授权 */
  authorized: boolean;
  /** 有未撤销的令牌 */
  has_token: boolean;
  /** 有活跃会话 */
  has_session: boolean;
  last_active_at: string | null;
  /** 该应用待执行的注销申请 */
  pending: UserDeletionBrief | null;
}

/** 有效的临时密码（不含明文） */
export interface TempPasswordRow {
  id: number;
  expires_at: string;
  max_uses: number;
  used_count: number;
  created_by_name: string | null;
  reason: string | null;
  created_at: string;
}

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
  /** 待执行的注销申请（null = 没有）；列表里据此显示"还有几天到期" */
  deletion?: UserDeletionBrief | null;
}

/** 角色选项（用户表单 / 批量授权共用） */
export interface RoleOption {
  id: number;
  code: string;
  name: string;
  /** 角色所属应用（`GLOBAL` = 公共角色） */
  app_id: string;
  /** 应用显示名（后端解析，前端不维护第二份映射） */
  app_label?: string;
  /** 职级权重：数字越大越高，用于职级压制 */
  rank_level: number;
  /**
   * 当前操作者能否改动这个角色
   *
   * `false` = 不在他的应用域内，或职级不低于他。前端据此置灰并**不提交**该 id
   * （后端同样会拒），判据只此一份，不要在前端另写规则。
   */
  manageable?: boolean;
}

/** 岗位选项 */
export interface PostOption {
  id: number;
  post_code: string;
  post_name: string;
}

/** 当前操作者的授权范围（由后端下发，用于前端展示层判断） */
export interface ActorScope {
  appIds: string[];
  /** 是否跨应用管理员（持有管理后台角色） */
  crossApp: boolean;
  /** 自己拥有的最高职级 */
  maxRank: number;
  isSuper: boolean;
}

/** 用户引用选项 */
export interface UserOptions {
  depts: Array<{ id: number; parent_id: number; name: string }>;
  roles: RoleOption[];
  posts: PostOption[];
  apps?: Array<{ id: string; label: string }>;
  scope?: ActorScope;
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
  /** 应用显示名（后端解析） */
  app_label?: string;
  /** 当前操作者能否编辑 / 删除这个角色（后端与写接口同一份判据） */
  manageable?: boolean;
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

/** 部门变更项（from → to 已由后端翻译成可读文本） */
export interface DeptChange {
  field: string;
  /** 字段中文名，如「上级部门」 */
  label: string;
  from: string;
  to: string;
}

/** 部门变更历史行（GET /depts/:id/history） */
export interface DeptHistoryRow {
  id: number;
  event: 'DEPT_CREATE' | 'DEPT_UPDATE' | 'DEPT_DELETE';
  created_at: string;
  operator_id: number | null;
  /** 操作人账号（账号被删时仍保留名字，`operator_deleted` 标明） */
  operator_name: string | null;
  operator_email: string | null;
  operator_deleted: boolean;
  /** 事件发生时的部门名（改名后历史仍读得懂） */
  dept_name: string | null;
  changes: DeptChange[];
  ip: string | null;
}

/** 部门节点（GET /depts/tree，含成员数与上级链） */
export interface DeptNode {
  id: number;
  parent_id: number;
  /** 祖先链，形如 `0,1,3`（根为 0）；由后端维护，前端不自行拼接 */
  ancestors: string;
  name: string;
  leader: string | null;
  phone: string | null;
  email: string | null;
  sort: number;
  status: number;
  /** 本部门直属成员数（不含下级） */
  user_count: number;
  children: DeptNode[];
}

/** 角色授权流水（GET /users/:id/grants） */
export interface GrantLogRow {
  id: number;
  action: 'grant' | 'revoke';
  role_id: number;
  role_code: string;
  role_name: string;
  operator_id: number | null;
  /** 操作人账号快照（用户改名/删除后仍可读） */
  operator_name: string;
  /**
   * 操作人详情（后端按 `operator_id` 现查，非快照）
   *
   * 不存在或已删除时这些字段为 null，`operator_deleted` 说明原因 —— 审计里
   * 「授权人已被删除」本身是一条信息，不能让他从列表里消失。
   */
  operator_uid: string | null;
  operator_email: string | null;
  /** 所属部门名称（未分配部门为 null） */
  operator_dept: string | null;
  /** 账号状态：1 正常 / 0 冻结 / -1 已注销 */
  operator_status: number | null;
  operator_deleted: boolean;
  app_id: string;
  remark: string | null;
  created_at: string;
}

/** 当前生效的角色（含它带来的权限码与授予来源） */
export interface CurrentAccessRole {
  role_id: number;
  role_code: string;
  role_name: string;
  app_id: string;
  app_label: string;
  rank_level: number;
  /** 该角色的权限码（PBAC Allow 列表，可能含 `*`） */
  permissions: string[];
  /** 当前这次生效是从什么时候开始的（最近一次 grant） */
  granted_at: string | null;
  /** 最近一次 grant 的操作人账号快照 */
  granted_by: string | null;
}

/**
 * 当前生效的访问权
 *
 * 由服务端**不分页**算出：流水是一页一页翻的，用已加载那几页倒推"谁还在生效"
 * 会把第二页之后的授予误判成已撤销。前端只负责展示。
 */
export interface CurrentAccess {
  roles: CurrentAccessRole[];
  /** 去重后的权限码；含 `*` 时看 `wildcard`，别再数个数 */
  permissionCodes: string[];
  /** 权限码按模块折叠（中文名来自后端元数据；缺失时前端不要再猜一遍） */
  permissionGroups: PermissionGroup[];
  apps: Array<{ id: string; label: string }>;
  /** 是否包含全权通配 `*` */
  wildcard: boolean;
}

/** 权限码模块分组（按码前缀折叠，中文名来自后端权限元数据） */
export interface PermissionGroup {
  /** 模块键，如 `admin:user`；`*` 表示全部权限 */
  key: string;
  /** 模块显示名，如「用户管理」 */
  label: string;
  domain: string;
  domainName: string;
  codes: Array<{ code: string; label: string }>;
}

/** 一个角色的生效区间片段（`to` 为 null = 至今仍开着） */
export interface TimelineSegment {
  from: string;
  to: string | null;
}

/** 按角色聚合的生效区间（服务端折好，前端只画） */
export interface RoleTimelineEntry {
  role_id: number;
  role_code: string;
  role_name: string;
  app_id: string;
  segments: TimelineSegment[];
  /** 当前是否仍在生效（最后一段没有 revoke） */
  active: boolean;
  first_at: string;
}

/** 授权记录 + 当前生效状态 + 角色时间线（GET /users/:id/grants） */
export type GrantHistoryPage = PageResult<GrantLogRow> & {
  current: CurrentAccess;
  timeline: RoleTimelineEntry[];
};
