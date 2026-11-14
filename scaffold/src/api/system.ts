/**
 * 系统管理接口（用户 / 角色 / 菜单 / 部门 / 岗位 / 字典 / 参数）
 *
 * 路径前缀 `/admin/console/v1`；列表统一返回 `{ rows, total, pageNum, pageSize }`。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { del, download, get, post, put } from './http';
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
 * 批量导入用户
 *
 * @param rows 解析后的行（最多 500）
 * @returns 成功条数与失败明细
 */
export function importUsers(rows: UserImportRow[]): Promise<UserImportResult> {
  return post(`${BASE}/users/import`, { rows });
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
export function menuTree(): Promise<MenuNode[]> {
  return get(`${BASE}/menus/tree`);
}

/**
 * 本应用可用的权限码
 *
 * 🔴 只有本应用的码（`admin:` 开头）。**不要**改用 `/permissions/catalog` ——
 *    那是 8 个应用合并后的全量目录，拿它做菜单候选等于把"能用别的应用的码"
 *    摆到界面上；后端也会拒写非本应用的码。
 */
export function menuPermissionOptions(): Promise<{ options: Array<{ code: string; label: string; type: string }> }> {
  return get(`${BASE}/menus/permission-options`);
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
