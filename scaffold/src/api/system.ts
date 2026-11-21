/**
 * 系统管理接口（用户 / 角色 / 菜单 / 部门 / 岗位 / 字典 / 参数）
 *
 * 路径前缀 `/admin/console/v1`；列表统一返回 `{ rows, total, pageNum, pageSize }`。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { del, download, get, patch, post, put } from './http';
import type {
  DangerConfirm,
  DeptHistoryRow,
  DeptNode,
  GrantHistoryPage,
  MenuNode,
  PageResult,
  PermissionGraph,
  PendingKick,
  PostMember,
  RoleRow,
  StepUpChallenge,
  StepUpFactors,
  StepUpPayload,
  TempPasswordRow,
  UserAppRow,
  UserDeletionRequest,
  UserProfile,
  UserOptions,
  UserRow,
  UserSessionRow
} from './types';

const BASE = '/admin/console/v1';

/* ── 用户 ─────────────────────────────────────────────────── */

/** 用户分页查询参数 */
export interface UserQuery {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  deptId?: number | null;
  /** 子应用过滤：只留在该应用里有角色的人（空 = 全部应用） */
  appId?: string | null;
  status?: number | null;
  /** 只看「一个有效角色都没有」的账号（供超管补授权；非超管被应用域先过滤成空） */
  noRole?: boolean;
}

/** 用户分页 */
export function listUsers(query: UserQuery): Promise<PageResult<UserRow>> {
  return get(`${BASE}/users`, query as Record<string, unknown>);
}

/** 用户表单引用选项（部门 / 角色 / 岗位） */
export function userOptions(): Promise<UserOptions> {
  return get(`${BASE}/users/options`);
}

/** 某用户的授权历史（授权 / 取消流水） */
export function userGrants(id: number, query: Record<string, unknown> = {}): Promise<GrantHistoryPage> {
  return get(`${BASE}/users/${id}/grants`, query);
}

/**
 * 批量授权：对多个用户追加 / 移除同一组角色
 *
 * 刻意只有 add / remove，没有 replace —— 覆盖式批量的破坏力太大
 * （一次误操作会把一批人原有角色全冲掉，流水只能事后解释、无法恢复）。
 */
export function batchGrantRoles(body: {
  userIds: number[];
  roleIds: number[];
  mode: 'add' | 'remove';
}): Promise<{ count: number }> {
  return post(`${BASE}/users/roles/batch`, body);
}

/** 新建用户 */
export function createUser(body: Record<string, unknown>): Promise<{ id: number; uid: string }> {
  return post(`${BASE}/users`, body);
}

/** 编辑用户 */
export function updateUser(id: number, body: Record<string, unknown>): Promise<null> {
  return put(`${BASE}/users/${id}`, body);
}

/** 启用 / 冻结用户 */
export function updateUserStatus(id: number, status: number): Promise<null> {
  return put(`${BASE}/users/${id}/status`, { status });
}

/* ── 二次验证（高危写操作的前置） ─────────────────────────── */

/** 我可用哪些验证方式（只回脱敏邮箱与布尔值） */
export function stepUpFactors(): Promise<StepUpFactors> {
  return get(`${BASE}/stepup/factors`);
}

/**
 * 为「某动作 + 某目标」签发一次性凭据
 *
 * 凭据绑定动作与目标：为了看 A 而通过的验证，不能拿去删 B。
 */
export function requestStepUpChallenge(body: {
  action: 'user.delete' | 'user.app-deactivate' | 'user.temp-password';
  targetId: number;
  method?: 'email' | 'password';
}): Promise<StepUpChallenge> {
  return post(`${BASE}/stepup/challenge`, body);
}

/* ── 账号高危操作（都要 stepUp 一次性凭据） ────────────────── */

/** 待执行的注销申请 + 会话未踢干净的记录 */
/**
 * 用户详情（概览 / 应用 / 角色权限 / 最近记录）
 *
 * 后端一个接口给全，职级可见性也在后端判（同级能看、下级看不了上级）。
 */
export function userProfile(id: number): Promise<UserProfile> {
  return get(`${BASE}/users/${id}/profile`);
}

/**
 * 调整某一条权限：allow / deny / inherit
 *
 * 落 PBAC 个人策略（`iam_inline_policy`），Deny 优先于角色授予。
 */
export function setUserPermission(
  id: number,
  body: { appId: string; code: string; effect: 'allow' | 'deny' | 'inherit' }
): Promise<{ appId: string; appLabel: string; allow: string[]; deny: string[] }> {
  return put(`${BASE}/users/${id}/permissions`, body);
}

export function userDeletion(
  id: number
): Promise<{ requests: UserDeletionRequest[]; pendingKicks: PendingKick[]; confirm: DangerConfirm }> {
  return get(`${BASE}/users/${id}/deletion`);
}

/**
 * 发起删除（缓冲期，到期才清数据）
 *
 * `confirm` 需要前端让操作者手打 GET 详情里返回的 `confirm.value`（邮箱 / 手机号 /
 * 用户 ID，由后端挑一个最好打的），服务端会按同一套规则比对，防手滑。
 */
export function requestUserDeletion(
  id: number,
  body: { stepUp: StepUpPayload; confirm: string; reason?: string }
): Promise<{ id: number; scheduledAt: string; graceDays: number }> {
  return post(`${BASE}/users/${id}/deletion`, body);
}

/** 撤销注销申请 */
export function cancelUserDeletion(id: number, requestId: number): Promise<{ id: number; status: number }> {
  return post(`${BASE}/users/${id}/deletion/${requestId}/cancel`);
}

/** 该用户在各应用的账号状态 */
export function userApps(id: number): Promise<{ rows: UserAppRow[]; total: number }> {
  return get(`${BASE}/users/${id}/apps`);
}

/** 注销该用户在某应用的账号（不动主账号） */
export function deactivateUserApp(
  id: number,
  appId: string,
  body: { stepUp: StepUpPayload; reason?: string }
): Promise<{ id: number; appId: string; scheduledAt: string; graceDays: number }> {
  return post(`${BASE}/users/${id}/apps/${encodeURIComponent(appId)}/deactivation`, body);
}

/** 当前有效的临时密码（不含明文） */
export function userTempPasswords(id: number): Promise<{ rows: TempPasswordRow[]; total: number }> {
  return get(`${BASE}/users/${id}/temp-password`);
}

/** 签发临时密码（明文只返回一次） */
export function issueUserTempPassword(
  id: number,
  body: { stepUp: StepUpPayload; ttlMinutes?: number; maxUses?: number; reason?: string }
): Promise<{ id: number; password: string; expiresAt: string; maxUses: number }> {
  return post(`${BASE}/users/${id}/temp-password`, body);
}

/** 导出用户 CSV */
export function exportUsers(query: UserQuery): Promise<void> {
  return download(`${BASE}/users/export`, 'users.csv', query as Record<string, unknown>);
}

/** 导入行（CSV 已在浏览器解析成结构化数据；部门/角色写名称，后端负责映射成 id） */
export interface UserImportRow {
  username: string;
  email?: string;
  password: string;
  dept?: string;
  roles?: string[];
}

/** 批量导入结果（逐行成败，单行失败不影响其他行） */
export interface UserImportResult {
  created: number;
  failed: Array<{ line: number; username: string; reason: string }>;
}

/**
 * 批量导入用户（第一步）：签发二次验证凭据
 *
 * 🔴 必须把**同一批 rows** 传上来：服务端会算一份内容指纹存进挑战记录，
 *    执行时再用同一份指纹比对。前端换过任意一行都要重新领凭据。
 *
 * @param rows 解析后的行（最多 500）
 * @param method 验证方式（缺省按账号可用因素推荐）
 * @returns 挑战信息 + 本批行数
 */
export function createUserImportChallenge(
  rows: UserImportRow[],
  method?: 'email' | 'password'
): Promise<StepUpChallenge & { matched: number }> {
  return post(`${BASE}/users/import/challenge`, { rows, method });
}

/**
 * 批量导入用户（第二步：带凭据执行）
 *
 * @param rows 解析后的行（最多 500）
 * @param stepUp 一次性验证凭据
 * @returns 成功条数与失败明细
 */
export function importUsers(rows: UserImportRow[], stepUp: StepUpPayload): Promise<UserImportResult> {
  return post(`${BASE}/users/import`, { rows, stepUp });
}

/* ── 角色 ─────────────────────────────────────────────────── */

/** 角色分页 */
export function listRoles(query: Record<string, unknown>): Promise<PageResult<RoleRow>> {
  return get(`${BASE}/roles`, query);
}

/** 新建角色 */
export function createRole(body: Record<string, unknown>): Promise<{ id: number }> {
  return post(`${BASE}/roles`, body);
}

/** 编辑角色 */
export function updateRole(id: number, body: Record<string, unknown>): Promise<null> {
  return put(`${BASE}/roles/${id}`, body);
}

/** 删除角色 */
export function removeRole(id: number): Promise<null> {
  return del(`${BASE}/roles/${id}`);
}

/** 角色已授权菜单 */
export function roleMenus(id: number): Promise<{ menuIds: number[] }> {
  return get(`${BASE}/roles/${id}/menus`);
}

/** 保存角色菜单授权 */
export function saveRoleMenus(id: number, menuIds: number[]): Promise<{ count: number }> {
  return put(`${BASE}/roles/${id}/menus`, { menuIds });
}

/** 权限码目录（角色表单勾选） */
export function permissionCatalog(): Promise<
  Array<{ domain: string; domainName: string; code: string; label: string }>
> {
  return get(`${BASE}/permissions/catalog`);
}

/* ── 设备会话（注意前缀不同） ─────────────────────────────── */

/**
 * 某用户的所有设备会话
 *
 * 🔴 路径**不走** `BASE`：会话管理挂在 user 域（`/admin/user/v1/sessions/*`），
 *    与 console 的 `/admin/console/v1` 是两个前缀。拼错会 404，而 404 在这里
 *    很容易被当成"这个人没有设备"。
 *
 * @param query userId 为数字主键（后端明确拒绝 uid/UUID）
 * @returns 设备会话列表
 */
export function listUserSessions(query: { userId: number; appId?: string }): Promise<UserSessionRow[]> {
  return get('/admin/user/v1/sessions/list', query);
}

/**
 * 按设备码踢下线（只影响这一台设备）
 *
 * `kicked = 0` 是正常结果：该设备当前没有活跃会话（可能已过期或已被踢）。
 *
 * @param body 目标与设备码
 * @returns 实际踢出的会话数
 */
export function kickUserSession(body: {
  userId: number;
  appId: string;
  deviceId: string;
}): Promise<{ kicked: number; revoked: number; clearedRefresh: number }> {
  return post('/admin/user/v1/sessions/kick-by-device', body);
}

/* ── 菜单 ─────────────────────────────────────────────────── */

/** 菜单树 */
export function menuTree(appId?: string): Promise<MenuNode[]> {
  return get(`${BASE}/menus/tree`, appId ? { appId } : undefined);
}

/**
 * 可配置的应用（注册过权限码的那些）
 *
 * `writable` = 当前账号能否配置该应用的菜单。前端据此置灰/过滤，
 * 真正的闸在写接口（`assertAppWritable`）。
 */
export function menuApps(): Promise<Array<{ id: string; name: string; writable: boolean }>> {
  return get(`${BASE}/menus/apps`);
}

/**
 * 本应用可用的权限码
 *
 * 🔴 只有本应用的码（`admin:` 开头）。**不要**改用 `/permissions/catalog` ——
 *    那是 8 个应用合并后的全量目录，拿它做菜单候选等于把"能用别的应用的码"
 *    摆到界面上；后端也会拒写非本应用的码。
 */
export function menuPermissionOptions(
  appId?: string
): Promise<{ appId?: string; appName?: string; options: Array<{ code: string; label: string; type: string }> }> {
  return get(`${BASE}/menus/permission-options`, appId ? { appId } : undefined);
}

/** 新建菜单 */
export function createMenu(body: Record<string, unknown>): Promise<{ id: number }> {
  return post(`${BASE}/menus`, body);
}

/** 编辑菜单 */
export function updateMenu(id: number, body: Record<string, unknown>): Promise<null> {
  return put(`${BASE}/menus/${id}`, body);
}

/** 删除菜单 */
export function removeMenu(id: number): Promise<null> {
  return del(`${BASE}/menus/${id}`);
}

/* ── 部门 ─────────────────────────────────────────────────── */

/** 部门树（含成员数与上级链） */
export function deptTree(): Promise<DeptNode[]> {
  return get(`${BASE}/depts/tree`);
}

/**
 * 部门变更历史（读审计：谁在什么时候改了什么）
 */
export function deptHistory(id: number, limit = 50): Promise<{ rows: DeptHistoryRow[]; total: number }> {
  return get(`${BASE}/depts/${id}/history`, { limit });
}

/** 新建部门 */
export function createDept(body: Record<string, unknown>): Promise<{ id: number }> {
  return post(`${BASE}/depts`, body);
}

/** 编辑部门 */
export function updateDept(id: number, body: Record<string, unknown>): Promise<null> {
  return put(`${BASE}/depts/${id}`, body);
}

/** 删除部门 */
export function removeDept(id: number): Promise<null> {
  return del(`${BASE}/depts/${id}`);
}

/* ── 岗位 ─────────────────────────────────────────────────── */

/** 岗位分页 */
export function listPosts<T = Record<string, unknown>>(query: Record<string, unknown>): Promise<PageResult<T>> {
  return get(`${BASE}/posts`, query);
}

/** 新建岗位 */
export function createPost(body: Record<string, unknown>): Promise<{ id: number }> {
  return post(`${BASE}/posts`, body);
}

/** 编辑岗位 */
export function updatePost(id: number, body: Record<string, unknown>): Promise<null> {
  return put(`${BASE}/posts/${id}`, body);
}

/** 岗位在岗成员 */
export function postUsers(id: number): Promise<PostMember[]> {
  return get(`${BASE}/posts/${id}/users`);
}

/** 删除岗位 */
export function removePost(id: number): Promise<null> {
  return del(`${BASE}/posts/${id}`);
}

/** 权限关系整图（溯源 / 星图共用） */
export function permissionGraph(): Promise<PermissionGraph> {
  return get(`${BASE}/permissions/graph`);
}

/* ── 应用管理 ──────────────────────────────────────────────── */

/**
 * 一个应用的清单行
 *
 * 应用是**代码声明**的（`src/app/<app>/config.js`），接口只读：没有增删改。
 * `counts` 是各应用授权数据的规模，用来回答"这个应用配齐了没有"。
 */
export interface AppOverview {
  /** 应用标识（会话里的 appId） */
  appId: string;
  /** 显示名 */
  name: string;
  /** 一句话说明 */
  description: string;
  /** 权限命名空间：角色/菜单/权限码都挂在它下面（console → admin） */
  permissionAppId: string;
  /** 授权即送的默认角色 */
  defaultRole: string;
  /** 登录准入策略（null = 不限制） */
  access: { anyPermission: string[]; anyRole: string[]; denyMessage: string } | null;
  /** 应用声明的 Host（多域名部署用） */
  hosts: string[];
  /** 授权数据规模 */
  counts: { roles: number; menus: number; permissionCodes: number; oauthClients: number };
  /** 接口开关规模（`disabled` = 已关闭的节点数，含系统与模块级） */
  apis: { total: number; disabled: number };
}

/** 应用清单（只读） */
export function listApps(): Promise<{ apps: AppOverview[]; total: number }> {
  return get(`${BASE}/apps`);
}

/* ── 应用接口开关 ───────────────────────────────────────────── */

/** 接口树节点（系统 / 模块 / 接口同构） */
export interface AppApiNode {
  key: string;
  id?: string;
  name?: string;
  description?: string;
  prefix?: string;
  enabled: boolean;
  requireLogin?: boolean;
  requirePermission?: string | null;
  allowIps?: string[];
  allowRoles?: string[];
  /** 保护性接口：不允许关闭（登录/授权、应用管理与会话自身） */
  critical?: boolean;
  /**
   * 被哪个祖先"挂空"：`system` = 系统总开关已关，`group` = 模块开关已关
   *
   * 有值时**不允许再改这一层** —— 改完也不生效，请求在更外层就被拦了。
   */
  blockedBy?: 'system' | 'group' | null;
}

/** 模块节点 */
export interface AppApiGroup extends AppApiNode {
  apis: AppApiNode[];
}

/** 系统节点 */
export interface AppApiSystem extends AppApiNode {
  groups: AppApiGroup[];
}

/** 某应用的接口树 */
export function listAppApis(appId: string): Promise<{ appId: string; systems: AppApiSystem[]; total: number }> {
  return get(`${BASE}/apps/${appId}/apis`);
}

/** 切换接口开关的入参 */
export interface AppApiToggleBody {
  systemKey: string;
  groupKey?: string;
  apiKey?: string;
  stepupToken?: string;
}

/** 切换接口开关（系统 / 模块 / 接口） */
export function toggleAppApi(appId: string, body: AppApiToggleBody): Promise<{ enabled: boolean }> {
  return post(`${BASE}/apps/${appId}/apis/toggle`, body);
}

/** 申请接口开关的二次认证（返回 challengeId 与打码后的目标） */
export function appApiStepUpChallenge(
  appId: string,
  body: {
    systemKey: string;
    groupKey?: string;
    apiKey?: string;
    action: 'toggle' | 'patch';
    patch?: Record<string, unknown>;
    /** 变更原因（后端要求 4-200 字，写进审计并绑进票据） */
    reason?: string;
    method?: 'email' | 'password';
  }
): Promise<{
  challengeId: string;
  method: string;
  maskedTarget: string;
  expiresIn: number;
  patch?: Record<string, unknown>;
}> {
  return post(`${BASE}/apps/${appId}/apis/stepup/challenge`, body);
}

/** 核验二次认证，换回票据 */
export function appApiStepUpVerify(
  appId: string,
  body: { challengeId: string; code?: string; password?: string }
): Promise<{ ticket: string; expiresIn: number; method: string }> {
  return post(`${BASE}/apps/${appId}/apis/stepup/verify`, body);
}

/** 接口开关的二次验证策略 */
export interface AppSwitchPolicy {
  requireStepUp: boolean;
  /** 当前账号能否修改（只有超管） */
  canEdit: boolean;
}

/** 读策略 */
export function getAppSwitchPolicy(): Promise<AppSwitchPolicy> {
  return get(`${BASE}/apps/switch-policy`);
}

/** 改策略（仅超管；后端会再判一次） */
export function setAppSwitchPolicy(requireStepUp: boolean): Promise<{ requireStepUp: boolean }> {
  return put(`${BASE}/apps/switch-policy`, { requireStepUp });
}

/** 编辑某个接口节点的可写字段 */
export interface AppApiPatch {
  description?: string;
  requireLogin?: boolean;
  allowIps?: string[];
  allowRoles?: string[];
}

export function updateAppApi(
  appId: string,
  body: {
    systemKey: string;
    groupKey?: string;
    apiKey?: string;
    patch: AppApiPatch;
    stepupToken?: string;
  }
): Promise<{ node: AppApiNode | null }> {
  return patch(`${BASE}/apps/${appId}/apis`, body);
}
