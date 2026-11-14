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
  /**
   * 生效权限码（**后端已算好**：角色 policy ∩ 菜单按钮授权）
   *
   * 前端不再自己拼"按钮码还要被菜单授权命中"——那是一套会分叉的第二实现。
   * 支持 `admin:*` 这类通配；只有真的摘掉某个按钮时后端才会展开成具体码。
   */
  permissions: string[];
  /** 个人偏好（界面设置）：登录后据此恢复主题色等 */
  preferences?: { accent?: string };
  /** 后台内的展示身份（昵称/头像为空时后端已回落到全局值） */
  profile?: { nickname: string; avatar: string };
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
/** 二次验证方式（GET /stepup/factors）：决定展示「发送验证码」还是密码框 */
export interface StepUpFactors {
  /** 脱敏后的操作者邮箱，如 `ad***@qq.com`；未绑定为空串 */
  email: string;
  /** 是否设置过密码（真源：user_identity 的 password 行） */
  hasPassword: boolean;
  /** 后端建议的方式：优先邮箱，其次密码，都没有为 null */
  recommended: 'email' | 'password' | null;
}

/** 一次性二次验证凭据（POST /stepup/challenge） */
export interface StepUpChallenge {
  challengeId: string;
  method: 'email' | 'password';
  /** 有效期（秒） */
  expiresIn: number;
  /** 邮箱方式时为脱敏收件地址 */
  maskedTarget: string | null;
}

/**
 * 日志筛选条件（列表 / 导出 / 清除共用）
 *
 * 🔴 这些是**独立维度**，不是一个大 keyword：`keyword` 是 OR 模糊匹配，
 *    用它做"按 IP 清除"会把别处出现的同类文本一起删掉。
 *
 * 清除时同一份对象会同时用于：算命中条数、算二次验证的范围指纹、写进审计留痕。
 * 三个地方必须完全一致，否则出现"预览 3 条、实删 30 条"。
 */
export interface LogFilters {
  keyword?: string;
  status?: 0 | 1;
  /** 起始时间（含） */
  startTime?: string;
  /** 结束时间（含） */
  endTime?: string;
  /** 账号（模糊；登录日志同时匹配注销前用户名） */
  username?: string;
  /** 来源 IP（前缀匹配） */
  ip?: string;
  /** 事件码（登录日志） */
  event?: string;
  /** 事件码（操作日志） */
  action?: string;
}

/** 高危写接口共用的二次验证载荷 */
export interface StepUpPayload {
  challengeId: string;
  code?: string;
  password?: string;
}

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
  /** 发起前的账号状态（撤销时据此恢复；null = 历史数据） */
  prev_status?: number | null;
}

/** 「会话未踢干净」记录（注销时 Redis 不可用） */
export interface PendingKick {
  id: number;
  scope: 'all' | 'app';
  app_id: string | null;
  /** 已重试次数 */
  attempts: number;
  last_error: string | null;
  updated_at: string | null;
}

/**
 * 高危操作「手打确认」用哪个字段
 *
 * 由后端决定（邮箱 → 手机号 → 用户 ID），前端只负责显示与比对：
 * 登录名可能是带符号/中文/长工号的串，手打容易错，错一次就把验证码吃掉。
 */
export interface DangerConfirm {
  field: 'email' | 'phone' | 'id';
  /** 字段中文名（邮箱 / 手机号 / 用户 ID），直接拼进提示语 */
  label: string;
  /** 需要用户手打的值 */
  value: string;
}

/** 用户详情（GET /users/:id/profile） */
export interface UserProfile {
  user: {
    id: number;
    uid: string;
    username: string;
    email: string;
    avatar: string;
    status: number;
    deptId: number | null;
    deptName: string;
    postNames: string[];
    createdAt: string | null;
    deleteVersion: number;
  };
  access: {
    roles: Array<{
      role_id: number;
      role_code: string;
      role_name: string;
      app_id: string;
      app_label: string;
      rank_level: number;
      permissions: string[];
      granted_at: string | null;
      granted_by: number | null;
    }>;
    permissionCodes: string[];
    permissionGroups: Array<{
      key: string;
      label: string;
      domain: string;
      domainName: string;
      codes?: string[];
      list?: string[];
    }>;
    apps: Array<{ id: string; label: string }>;
    wildcard: boolean;
  };
  apps: UserAppRow[];
  /** 个人策略（按应用）：单独允许 / 拒绝的权限码 */
  inline: Array<{ appId: string; appLabel: string; allow: string[]; deny: string[] }>;
  recentOps: Array<{ event: string; appId: string; ip: string; costMs: number | null; createdAt: string }>;
  recentLogins: Array<{
    event: string;
    appId: string;
    ip: string;
    location: string;
    userAgent: string;
    failed: boolean;
    createdAt: string;
  }>;
  /** 当前操作者能否编辑这个人的权限（后端按职级判） */
  canEdit: boolean;
}

/**
 * 用户的设备会话（GET /admin/user/v1/sessions/list）
 *
 * 一行 = 一台设备在某应用下的一条会话记录。后端按 `user_id + device_id + app_id`
 * 做 upsert，所以同一台设备在同一应用里只有一行，`last_active` 是它最后说话的时​间。
 *
 * 🔴 `device_id` 是**设备码**（如 `WEB-KICKPROBEBBBB`），不是数据库主键 ——
 *    踢下线要传它，传 `id` 会踢不掉。
 */
export interface UserSessionRow {
  id: number;
  user_id: number;
  app_id: string;
  /** 设备码（踢下线按它匹配） */
  device_id: string;
  device_fingerprint: string | null;
  ip: string | null;
  user_agent: string | null;
  last_active: string | null;
  /** 只读：当前会话是否已失效（踢过 / 过期 / 登出） */
  revoked: boolean | number;
  /** 是否是发起本次请求的这台设备（管理员查看自己时用来避免误踢） */
  is_current?: boolean;
  /** 未撤销但最后活跃时间已超过最长会话 TTL：会话大概率已过期，仅剩历史记录 */
  stale?: boolean;
  updated_at: string;
}

/**
 * 我的登录设备（用户自助视角，GET /user/v1/sessions/devices）
 *
 * 与 `UserSessionRow` 的区别：这是**本人**的设备视图，设备码已打码
 * （`maskDeviceId`），且多一个 `isCurrent`。踢下线按 `id` 走，不按设备码 ——
 * 打码值拿去匹配永远不相等。
 */
export interface MyDeviceRow {
  id: number;
  appId: string;
  /** 打码后的设备码（便于辨认，不暴露完整指纹） */
  deviceId: string;
  ip: string | null;
  userAgent: string | null;
  lastActive: string | null;
  /** 只读：是否已失效（踢过 / 过期 / 登出） */
  revoked: boolean | number;
  /** 未撤销但最后活跃时间超过最长会话 TTL：会话大概率已过期，仅剩历史记录 */
  stale?: boolean;
  /** 是否是发起本次请求的这台设备 */
  isCurrent: boolean;
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
  /** 由代码 `defineRoles` 声明：不可删除、不可改 code / 权限码 */
  builtin: boolean;
  /** 菜单授权锁定：只有超级管理员（它的 policy 是 `admin:*` 全量） */
  menuLocked: boolean;
  permissions: string[];
  /** 数据范围：1 全部 / 2 自定义 / 3 本部门 / 4 本部门及以下 / 5 仅本人 */
  data_scope?: number;
  /** 自定义数据范围时勾选的部门（其它档位为空数组） */
  dept_ids?: number[];
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
  /** 近 24 小时**成功登录**过的账号数（不含被踢/刷新/失败） */
  activeUsers: number;
  /** 当前在线：有有效会话的账号数；Redis 不可用时为 null */
  onlineUsers?: number | null;
  trend: Array<{ bucket: string; total: number; failed: number }>;
  recentLogins: Array<{ id: number; username: string | null; ip: string; location: string | null; created_at: string }>;
}

/** 操作日志行 */
export interface OperLogRow {
  id: number;
  username: string;
  /** 用户业务唯一键（账号改名/注销后仍可对应到具体账户） */
  uid?: string;
  /** 邮箱（人工核对用；已注销用户可能为空） */
  email?: string;
  user_id?: number | null;
  module: string;
  action: string;
  method: string;
  path: string;
  cost_ms: number;
  ip: string;
  /** 操作时客户端携带的设备标识（历史记录为空串：当时未采集） */
  device_id: string;
  user_agent: string;
  detail: string;
  status: number;
  created_at: string;
}

/**
 * 登录日志行
 *
 * 后端 `loginPage` 已经把 `details` 解析成对象（raw 查询里 JSON 列回的是字符串，
 * DAO 里 parseDetails 归一化了）。这里如实声明，别让消费方以为只有列表那几列 ——
 * 排查登录问题要看的就是 `details` 里的 reason / deviceId。
 */
export interface LoginLogRow {
  id: number;
  user_id?: number | null;
  username: string;
  event: string;
  app_id: string;
  ip: string;
  location: string | null;
  user_agent?: string;
  /** 事件载荷（后端已 parse；解析失败是 null） */
  details?: Record<string, unknown> | null;
  /** 后端按事件名判定的失败标记（1 = 失败） */
  failed?: number;
  /**
   * 账号状态（来自 user_user.status，-1 = 已注销）
   *
   * 🔴 不要和上面的 `status` 混用：`status` 是"这条登录成功/失败"，
   *    `user_status` 是"这个账号现在是否还在"。注销后 username 会被换成
   *    `已注销用户#N`，只能靠它判断。
   */
  user_status?: number | null;
  /** 注销前的用户名（注销申请表留存的快照；该功能上线前注销的为空） */
  prev_username?: string;
  /** 注销前的邮箱（同上） */
  prev_email?: string;
  status: number;
  created_at: string;
}

/** 日志概览 */
export interface LogStats {
  range: string;
  total: number;
  failed: number;
  successRate: number;
  /**
   * 上一等长周期的总量（环比分母）
   *
   * `0` 表示上期没有数据 —— 此时环比百分比在数学上不存在，前端应显示"新增"
   * 而不是 `+100%`。两者语义不同，不要用 `||` 兜成同一个值。
   */
  prevTotal?: number;
  /** 上一等长周期的失败量 */
  prevFailed?: number;
  /**
   * 时间序列
   *
   * 🔴 **已补零、已按时间升序**，长度恒等于档位的桶数（24 / 7 / 30）。
   *    前端不要再排序、也不要再按"有几天有记录"推算缺口 —— 排序会破坏顺序
   *    （24h 桶名带日期才有序），补零会算错均值（分母应是全档位数）。
   */
  series: Array<{ bucket: string; total: number; failed: number; date: string }>;
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
