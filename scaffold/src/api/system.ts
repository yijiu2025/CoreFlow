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
  DeptHistoryRow,
  DeptNode,
  GrantHistoryPage,
  MenuNode,
  PageResult,
  PermissionGraph,
  PostMember,
  RoleRow,
  TempPasswordRow,
  UserAppRow,
  UserDeletionRequest,
  UserOptions,
  UserRow
} from './types';

const BASE = '/admin/console/v1';

/* ── 用户 ─────────────────────────────────────────────────── */

/** 用户分页查询参数 */
export interface UserQuery {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  deptId?: number | null;
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

/* ── 账号高危操作（都要求操作者密码） ──────────────────────── */

/** 待执行的注销申请 */
export function userDeletion(id: number): Promise<{ requests: UserDeletionRequest[] }> {
  return get(`${BASE}/users/${id}/deletion`);
}

/**
 * 发起删除（缓冲期，到期才清数据）
 *
 * `confirmUsername` 需要前端让操作者手打目标账号名 —— 服务端会比对，防手滑。
 */
export function requestUserDeletion(
  id: number,
  body: { password: string; confirmUsername: string; reason?: string }
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
  body: { password: string; reason?: string }
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
  body: { password: string; ttlMinutes?: number; maxUses?: number; reason?: string }
): Promise<{ id: number; password: string; expiresAt: string; maxUses: number }> {
  return post(`${BASE}/users/${id}/temp-password`, body);
}

/** 导出用户 CSV */
export function exportUsers(query: UserQuery): Promise<void> {
  return download(`${BASE}/users/export`, 'users.csv', query as Record<string, unknown>);
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
export function permissionCatalog(): Promise<Array<{ domain: string; domainName: string; code: string; label: string }>> {
  return get(`${BASE}/permissions/catalog`);
}

/* ── 菜单 ─────────────────────────────────────────────────── */

/** 菜单树 */
export function menuTree(): Promise<MenuNode[]> {
  return get(`${BASE}/menus/tree`);
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
